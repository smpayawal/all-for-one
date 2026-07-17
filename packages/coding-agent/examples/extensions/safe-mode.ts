/**
 * Optional authorization-oriented safe mode.
 *
 * Load with:
 *   pi -e ./examples/extensions/safe-mode.ts
 *
 * This extension is not an OS sandbox. It allows only a small exact set of
 * read-only commands, blocks destructive or credential-related access, confirms
 * other bash commands, known workspace mutations, and unknown extension tools,
 * and rejects mutation paths outside the workspace. Use the sandbox/gondolin
 * examples when process isolation is required.
 */

import { basename, isAbsolute, relative, resolve, sep, win32 } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	resolveCanonicalPath,
	type ToolCallEvent,
} from "@earendil-works/pi-coding-agent";

const SAFE_COMMANDS = new Set([
	"pwd",
	"ls",
	"git status",
	"git diff",
	"git log",
	"git show",
	"git branch",
	"node --version",
	"npm --version",
]);
const SHELL_SYNTAX = /[\r\n;|&<>`$()]/;
const MUTATING_COMMAND =
	/^\s*(?:find\b[^\n]*(?:-delete|-exec(?:dir)?\b)|sed\b[^\n]*(?:\s-i(?:\S*|\s|$)|\s--in-place(?:=|\s|$))|awk\b[^\n]*\bsystem\s*\(|git\s+branch\b[^\n]*(?:\s-[dD]\S*|\s--delete(?:=|\s|$)))/i;
const DENIED_COMMAND =
	/\b(?:sudo|su|mkfs|fdisk|shutdown|reboot|poweroff|dd)\b|\b(?:rm|rmdir|del)\b[^\n]*(?:-r|--recursive|-f|--force)|(?:curl|wget)[^\n]*\|\s*(?:sh|bash|zsh)\b/i;
const SENSITIVE_PATH =
	/(^|[\\/])(?:\.env(?:\.[^\\/]*)?|\.git|node_modules|[^\\/]*(?:credential|secret|token)[^\\/]*|[^\\/]+\.(?:pem|key))(?=[\\/]|$)/i;
const SENSITIVE_REFERENCE =
	/(?:^|[\s"'=\\/])(?:\.env(?:\.[^\s"']*)?|auth\.json|[^\s"']*(?:credential|secret|token)[^\s"']*|[^\s"']+\.(?:pem|key)|(?:~[\\/])?\.(?:ssh|aws|config[\\/]gcloud))(?:$|[\s"'\\/])/i;
const KNOWN_READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls"]);

export type SafeModeAction = "allow" | "ask" | "block";

export interface SafeModeDecision {
	action: SafeModeAction;
	reason: string;
}

export interface SafeModeMutationValidation extends SafeModeDecision {
	paths: string[];
}

function normalizedCommand(command: string): string {
	return command.trim().replace(/\s+/g, " ");
}

function isSensitiveCommand(command: string): boolean {
	return SENSITIVE_REFERENCE.test(command);
}

export function classifyBashCommand(value: unknown): SafeModeDecision {
	if (typeof value !== "string" || value.trim().length === 0) {
		return { action: "block", reason: "Safe mode blocks malformed bash tool input." };
	}
	if (isSensitiveCommand(value)) {
		return { action: "block", reason: "Safe mode blocks commands that reference credential or secret paths." };
	}
	if (SHELL_SYNTAX.test(value)) {
		return { action: "block", reason: "Safe mode blocks shell operators, substitutions, and redirection." };
	}
	if (DENIED_COMMAND.test(value) || MUTATING_COMMAND.test(value)) {
		return { action: "block", reason: "Safe mode blocks destructive commands and mutating command flags." };
	}
	if (SAFE_COMMANDS.has(normalizedCommand(value))) {
		return { action: "allow", reason: "Command is in the exact safe-mode read-only set." };
	}
	return { action: "ask", reason: "Command requires safe-mode approval." };
}

function isPathInside(root: string, target: string, caseInsensitive: boolean): boolean {
	const comparableRoot = caseInsensitive ? root.toLowerCase() : root;
	const comparableTarget = caseInsensitive ? target.toLowerCase() : target;
	const remainder = relative(comparableRoot, comparableTarget);
	return remainder === "" || (!isAbsolute(remainder) && remainder !== ".." && !remainder.startsWith(`..${sep}`));
}

function isSensitivePath(path: string): boolean {
	const normalized = path.split(/[\\/]/).join("/");
	return SENSITIVE_PATH.test(normalized) || basename(normalized).toLowerCase() === "auth.json";
}

export function getMutationPaths(event: ToolCallEvent): { paths: string[]; malformed: boolean } {
	if (event.toolName === "write" || event.toolName === "edit") {
		const path = event.input.path;
		return typeof path === "string" && path.trim().length > 0
			? { paths: [path], malformed: false }
			: { paths: [], malformed: true };
	}
	if (event.toolName === "apply_patch") {
		const patch = event.input.patch;
		if (typeof patch !== "string") return { paths: [], malformed: true };
		const paths: string[] = [];
		for (const line of patch.split(/\r?\n/)) {
			if (!/^\*\*\* (?:Update|Delete|Add) File:/.test(line)) continue;
			const path = line.replace(/^\*\*\* (?:Update|Delete|Add) File:/, "").trim();
			if (path.length === 0) return { paths: [], malformed: true };
			paths.push(path);
		}
		return { paths, malformed: paths.length === 0 };
	}
	return { paths: [], malformed: false };
}

export async function validateMutationPaths(
	event: ToolCallEvent,
	workspace: string,
	trustedReadOnlyBuiltIn = false,
): Promise<SafeModeMutationValidation> {
	const mutation = getMutationPaths(event);
	if (mutation.malformed) {
		return { action: "block", reason: "Safe mode blocks malformed mutation tool input.", paths: [] };
	}
	if (mutation.paths.length === 0) {
		if (trustedReadOnlyBuiltIn) {
			return { action: "allow", reason: "Tool is an active read-only built-in.", paths: [] };
		}
		return { action: "ask", reason: "Unknown or extension tools require safe-mode approval.", paths: [] };
	}

	try {
		const root = await resolveCanonicalPath(workspace);
		for (const candidate of mutation.paths) {
			if (process.platform !== "win32" && win32.isAbsolute(candidate)) {
				return {
					action: "block",
					reason: `Safe mode blocks Windows absolute mutation paths on this platform: ${candidate}`,
					paths: mutation.paths,
				};
			}
			const target = await resolveCanonicalPath(resolve(workspace, candidate));
			const caseInsensitive = root.caseInsensitive || target.caseInsensitive;
			if (!isPathInside(root.path, target.path, caseInsensitive)) {
				return {
					action: "block",
					reason: `Safe mode blocks writes outside the workspace: ${candidate}`,
					paths: mutation.paths,
				};
			}
			if (isSensitivePath(target.path)) {
				return {
					action: "block",
					reason: `Safe mode protects credential or generated paths: ${candidate}`,
					paths: mutation.paths,
				};
			}
		}
	} catch {
		return { action: "block", reason: "Safe mode could not canonicalize a mutation path.", paths: mutation.paths };
	}

	return { action: "ask", reason: "Workspace mutation requires safe-mode approval.", paths: mutation.paths };
}

async function askForApproval(ctx: ExtensionContext, title: string, detail: string): Promise<boolean> {
	if (!ctx.hasUI) return false;
	return (await ctx.ui.confirm(title, detail)) === true;
}

export default function safeModeExtension(pi: ExtensionAPI): void {
	pi.registerFlag("safe-mode", {
		description: "Enable authorization-oriented safe mode (not an OS sandbox)",
		type: "boolean",
		default: true,
	});
	let enabled = pi.getFlag("safe-mode") === true;

	pi.registerCommand("safe-mode", {
		description: "Toggle authorization-oriented safe mode",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			ctx.ui.notify(`Safe mode ${enabled ? "enabled" : "disabled"}.`, enabled ? "info" : "warning");
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!enabled) return undefined;

		if (event.toolName === "bash") {
			const decision = classifyBashCommand(event.input.command);
			if (decision.action === "block") return { block: true, reason: decision.reason };
			if (decision.action === "allow") return undefined;
			const command = typeof event.input.command === "string" ? event.input.command : "";
			const approved = await askForApproval(ctx, "Allow bash command?", command);
			return approved ? undefined : { block: true, reason: "Bash command denied by safe mode." };
		}

		const activeTool = pi.getAllTools().find((tool) => tool.name === event.toolName);
		const trustedReadOnlyBuiltIn =
			KNOWN_READ_ONLY_TOOLS.has(event.toolName) && activeTool?.sourceInfo.source === "builtin";
		const validation = await validateMutationPaths(event, ctx.cwd, trustedReadOnlyBuiltIn);
		if (validation.action === "block") return { block: true, reason: validation.reason };
		if (validation.action === "allow") return undefined;

		if (validation.paths.length > 0) {
			const approved = await askForApproval(ctx, "Allow workspace mutation?", validation.paths.join("\n"));
			return approved ? undefined : { block: true, reason: "Workspace mutation denied by safe mode." };
		}

		const approved = await askForApproval(ctx, `Allow tool "${event.toolName}"?`, validation.reason);
		return approved ? undefined : { block: true, reason: `Tool "${event.toolName}" denied by safe mode.` };
	});
}