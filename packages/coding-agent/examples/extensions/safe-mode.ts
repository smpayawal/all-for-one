/**
 * Optional authorization-oriented safe mode.
 *
 * Load with:
 *   pi -e ./examples/extensions/safe-mode.ts
 *
 * This extension is not an OS sandbox. It allows common read-only commands,
 * blocks destructive or credential-related access, confirms other bash
 * commands and in-workspace mutations, and rejects mutation paths outside the
 * workspace. Use the sandbox/gondolin examples when process isolation is
 * required.
 */

import { basename, relative, resolve, sep } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@earendil-works/pi-coding-agent";

const SAFE_COMMAND =
	/^\s*(?:pwd|ls|find|rg|grep|cat|head|tail|sed|awk|sort|wc|file|which|git\s+(?:status|diff|log|show|branch|rev-parse|ls-files)|node\s+--version|npm\s+(?:--version|run\s+(?:check|typecheck|lint)(?:\s|$)))(?:\s|$)/i;
const DENIED_COMMAND =
	/\b(?:sudo|su|mkfs|fdisk|shutdown|reboot|poweroff|dd)\b|\b(?:rm|rmdir|del)\b[^\n]*(?:-r|--recursive|-f|--force)|(?:curl|wget)[^\n]*\|\s*(?:sh|bash|zsh)\b/i;
const SENSITIVE_PATH =
	/(^|[\\/])(?:\.env(?:\.[^\\/]*)?|\.git|node_modules|[^\\/]*(?:credential|secret|token)[^\\/]*|[^\\/]+\.(?:pem|key))(?=[\\/]|$)/i;
const SENSITIVE_REFERENCE =
	/(?:^|[\s"'=])(?:\.env(?:\.[^\s"']*)?|auth\.json|[^\s"']*(?:credential|secret|token)[^\s"']*|[^\s"']+\.(?:pem|key))(?:$|[\s"'])/i;

function isInsideWorkspace(workspace: string, candidate: string): boolean {
	const path = resolve(workspace, candidate);
	const remainder = relative(workspace, path);
	return remainder === "" || (!remainder.startsWith(`..${sep}`) && remainder !== ".." && !remainder.startsWith(sep));
}

function isSensitivePath(workspace: string, candidate: string): boolean {
	const normalized = resolve(workspace, candidate).split(sep).join("/");
	return SENSITIVE_PATH.test(normalized) || basename(normalized).toLowerCase() === "auth.json";
}

function getMutationPaths(event: ToolCallEvent): string[] {
	if (event.toolName === "write" || event.toolName === "edit") {
		const path = event.input.path;
		return typeof path === "string" ? [path] : [];
	}
	if (event.toolName === "apply_patch") {
		const patch = event.input.patch;
		if (typeof patch !== "string") return [];
		return [...patch.matchAll(/^\*\*\* (?:Update|Delete|Add) File:\s*(.+)$/gm)].map((match) => match[1].trim());
	}
	return [];
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
			const command = event.input.command;
			if (typeof command !== "string") {
				return { block: true, reason: "Safe mode blocks malformed bash tool input." };
			}
			if (
				SENSITIVE_REFERENCE.test(command) ||
				/(?:^|\s)(?:~\/\.ssh|~\/\.aws|~\/\.config\/gcloud)(?:\s|$)/i.test(command)
			) {
				return { block: true, reason: "Safe mode blocks commands that reference credential or secret paths." };
			}
			if (DENIED_COMMAND.test(command)) {
				return { block: true, reason: "Safe mode blocks destructive commands and shell-piped downloads." };
			}
			if (SAFE_COMMAND.test(command)) return undefined;
			const approved = await askForApproval(ctx, "Allow bash command?", command);
			return approved ? undefined : { block: true, reason: "Bash command denied by safe mode." };
		}

		const paths = getMutationPaths(event);
		if (paths.length === 0) return undefined;
		for (const path of paths) {
			if (!isInsideWorkspace(ctx.cwd, path)) {
				return { block: true, reason: `Safe mode blocks writes outside the workspace: ${path}` };
			}
			if (isSensitivePath(ctx.cwd, path)) {
				return { block: true, reason: `Safe mode protects credential or generated paths: ${path}` };
			}
		}

		const approved = await askForApproval(ctx, "Allow workspace mutation?", paths.join("\n"));
		return approved ? undefined : { block: true, reason: "Workspace mutation denied by safe mode." };
	});
}
