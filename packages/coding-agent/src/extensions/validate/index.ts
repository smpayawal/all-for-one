import { createHash } from "node:crypto";
import { accessSync, constants, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import type { ExtensionAPI, ExtensionCommandContext } from "../../core/extensions/types.ts";
import {
	discoverValidationCommands,
	fingerprintValidationCommandDiscovery,
	type ValidationCommand,
	type ValidationCommandDiscovery,
	type ValidationCommandKind,
} from "../../core/validation-commands.ts";

const VALIDATION_TIMEOUT_MS = 120_000;
const VALIDATION_MAX_OUTPUT_BYTES = 64 * 1_024;
const VALIDATION_MAX_NOTIFICATION_CHARS = 6_000;
const WINDOWS_DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";

type StructuredValidationCommand = ValidationCommand & { program: string; args: string[] };

interface ValidationSelection {
	discovery: ValidationCommandDiscovery;
	sourceFingerprint: string;
}

interface ValidationExecutableResolutionOptions {
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
}

export type ValidationExecutableResolution =
	| {
			status: "resolved";
			requestedProgram: string;
			resolvedPath: string;
			canonicalPath: string;
			workspaceLocal: boolean;
	  }
	| { status: "not-found"; requestedProgram: string };

export interface ValidationRunRecord {
	command: ValidationCommand;
	resolvedProgram?: string;
	cwd: string;
	code: number;
	termination: string;
	durationMs: number;
	stdout: string;
	stderr: string;
	stdoutTruncated: boolean;
	stderrTruncated: boolean;
}

function formatArguments(args: readonly string[]): string {
	return JSON.stringify(args);
}

function formatCommandEntry(command: ValidationCommand, index: number): string {
	return [
		`${index + 1}. [${command.kind}] ${command.command}`,
		`   Program: ${command.program ?? "not available"}`,
		`   Arguments: ${formatArguments(command.args ?? [])}`,
		`   Source: ${command.source}`,
		`   Confidence: ${command.confidence}`,
	].join("\n");
}

export function formatValidationCommandList(
	discovery: ValidationCommandDiscovery,
	filter?: ValidationCommandKind,
): string {
	const indexed = discovery.commands
		.map((command, index) => ({ command, index }))
		.filter(({ command }) => filter === undefined || command.kind === filter);
	if (indexed.length === 0) {
		return filter
			? `No repository-grounded ${filter} command was discovered.`
			: "No repository-grounded validation commands were discovered.";
	}
	const ecosystems = discovery.ecosystems.length > 0 ? discovery.ecosystems.join(", ") : "not identified";
	return [
		`Repository validation commands (ecosystems: ${ecosystems})`,
		...indexed.map(({ command, index }) => formatCommandEntry(command, index)),
		"",
		"Run a numbered entry with /validate run <number>. Execution requires project trust and exact confirmation.",
	].join("\n");
}

function compactOutput(text: string): string {
	const normalized = text.trim();
	if (normalized.length <= VALIDATION_MAX_NOTIFICATION_CHARS) return normalized;
	const suffix = "\n… output display truncated; command capture remained bounded.";
	return `${normalized.slice(0, VALIDATION_MAX_NOTIFICATION_CHARS - suffix.length)}${suffix}`;
}

export function formatValidationRun(record: ValidationRunRecord): string {
	const header = [
		`Validation: ${record.command.command}`,
		`Program: ${record.command.program ?? "not available"}`,
		...(record.resolvedProgram ? [`Resolved executable: ${record.resolvedProgram}`] : []),
		`Arguments: ${formatArguments(record.command.args ?? [])}`,
		`Source: ${record.command.source} (${record.command.confidence})`,
		`Result: exit ${record.code}; termination ${record.termination}; duration ${Math.round(record.durationMs)} ms`,
	];
	const body: string[] = [];
	if (record.stdout.trim())
		body.push(`stdout${record.stdoutTruncated ? " (truncated)" : ""}:\n${record.stdout.trim()}`);
	if (record.stderr.trim())
		body.push(`stderr${record.stderrTruncated ? " (truncated)" : ""}:\n${record.stderr.trim()}`);
	return compactOutput([...header, ...body].join("\n"));
}

function isSafeStructuredInvocation(command: ValidationCommand): command is StructuredValidationCommand {
	if (!command.program || !command.args || /[\0\r\n]/u.test(command.program)) return false;
	if (command.args.some((argument) => /[\0\r\n]/u.test(argument))) return false;
	return [command.program, ...command.args].join(" ") === command.command;
}

function validationCommandIdentity(command: ValidationCommand): string {
	return JSON.stringify({
		kind: command.kind,
		command: command.command,
		program: command.program,
		args: command.args,
		confidence: command.confidence,
		source: command.source,
	});
}

function findEquivalentCommand(
	discovery: ValidationCommandDiscovery,
	command: ValidationCommand,
): ValidationCommand | undefined {
	const identity = validationCommandIdentity(command);
	return discovery.commands.find((candidate) => validationCommandIdentity(candidate) === identity);
}

function fingerprintValidationSources(cwd: string, discovery: ValidationCommandDiscovery): string {
	const sources = [...new Set(discovery.commands.map((command) => command.source.split("#", 1)[0]))].sort();
	const hash = createHash("sha256");
	for (const source of sources) {
		hash.update(source);
		hash.update("\0");
		try {
			hash.update(readFileSync(resolve(cwd, source)));
		} catch {
			hash.update("<unavailable>");
		}
		hash.update("\0");
	}
	return hash.digest("hex");
}

function environmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
	const normalized = name.toLowerCase();
	for (const [key, value] of Object.entries(env)) {
		if (key.toLowerCase() === normalized) return value;
	}
	return undefined;
}

function isWithinWorkspace(root: string, target: string): boolean {
	const path = relative(root, target);
	return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

function executableExtensions(program: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
	if (platform !== "win32" || extname(program)) return [""];
	return (environmentValue(env, "PATHEXT") ?? WINDOWS_DEFAULT_PATHEXT)
		.split(";")
		.map((extension) => extension.trim().toLowerCase())
		.filter(Boolean);
}

export function resolveValidationExecutable(
	program: string,
	cwd: string,
	options: ValidationExecutableResolutionOptions = {},
): ValidationExecutableResolution {
	if (!program || /[\\/\0\r\n]/u.test(program)) return { status: "not-found", requestedProgram: program };
	const platform = options.platform ?? process.platform;
	const env = options.env ?? process.env;
	const pathSeparator = platform === "win32" ? ";" : ":";
	const pathEntries = (environmentValue(env, "PATH") ?? "").split(pathSeparator);
	const directories = platform === "win32" ? [cwd, ...pathEntries] : pathEntries;
	const extensions = executableExtensions(program, platform, env);
	let workspaceRoot: string;
	try {
		workspaceRoot = realpathSync(cwd);
	} catch {
		workspaceRoot = resolve(cwd);
	}
	const seenDirectories = new Set<string>();

	for (const rawDirectory of directories) {
		const unquoted = rawDirectory.trim().replace(/^"|"$/gu, "");
		const directory = resolve(cwd, unquoted || ".");
		if (seenDirectories.has(directory)) continue;
		seenDirectories.add(directory);
		for (const extension of extensions) {
			const resolvedPath = resolve(directory, `${program}${extension}`);
			try {
				const canonicalPath = realpathSync(resolvedPath);
				if (!statSync(canonicalPath).isFile()) continue;
				if (platform !== "win32") accessSync(canonicalPath, constants.X_OK);
				return {
					status: "resolved",
					requestedProgram: program,
					resolvedPath,
					canonicalPath,
					workspaceLocal:
						isWithinWorkspace(workspaceRoot, resolvedPath) || isWithinWorkspace(workspaceRoot, canonicalPath),
				};
			} catch {
				continue;
			}
		}
	}
	return { status: "not-found", requestedProgram: program };
}

function notifyDiscoveryChanged(ctx: ExtensionCommandContext, phase: "selected" | "approval"): void {
	ctx.ui.notify(
		phase === "selected"
			? "Repository validation discovery changed since it was selected. Run /validate list again."
			: "Repository validation discovery changed during approval. Nothing was executed; run /validate list again.",
		"warning",
	);
}

function notifyExecutableUnavailable(
	ctx: ExtensionCommandContext,
	resolution: ValidationExecutableResolution,
	phase: "approval" | "execution",
): void {
	if (resolution.status === "not-found") {
		ctx.ui.notify(
			`Validation executable ${JSON.stringify(resolution.requestedProgram)} could not be resolved from the host PATH. Nothing was executed.`,
			"warning",
		);
		return;
	}
	ctx.ui.notify(
		phase === "approval"
			? `Validation executable resolves inside the workspace: ${resolution.canonicalPath}. Nothing was executed.`
			: "Validation executable identity changed during approval. Nothing was executed; run /validate again.",
		"warning",
	);
}

function confirmationMessage(
	command: StructuredValidationCommand,
	cwd: string,
	executable: Extract<ValidationExecutableResolution, { status: "resolved" }>,
): string {
	const warning =
		command.confidence === "inferred"
			? "This command was inferred from repository configuration rather than declared as an exact project script."
			: "This command is declared by repository configuration.";
	return [
		warning,
		"",
		`Program: ${command.program}`,
		`Resolved executable: ${executable.canonicalPath}`,
		`Arguments: ${formatArguments(command.args)}`,
		`Working directory: ${cwd}`,
		`Source: ${command.source}`,
		"",
		"The executable identity will be checked again immediately before direct spawn. Continue?",
	].join("\n");
}

function createSelection(ctx: ExtensionCommandContext): ValidationSelection {
	const discovery = discoverValidationCommands(ctx.cwd);
	return {
		discovery,
		sourceFingerprint: fingerprintValidationSources(ctx.cwd, discovery),
	};
}

function selectionMatches(left: ValidationSelection, right: ValidationSelection): boolean {
	return (
		fingerprintValidationCommandDiscovery(left.discovery) ===
			fingerprintValidationCommandDiscovery(right.discovery) && left.sourceFingerprint === right.sourceFingerprint
	);
}

function executableMatches(
	left: Extract<ValidationExecutableResolution, { status: "resolved" }>,
	right: ValidationExecutableResolution,
): right is Extract<ValidationExecutableResolution, { status: "resolved" }> {
	return (
		right.status === "resolved" &&
		!right.workspaceLocal &&
		left.resolvedPath === right.resolvedPath &&
		left.canonicalPath === right.canonicalPath
	);
}

async function executeValidation(
	pi: ExtensionAPI,
	command: ValidationCommand,
	expectedSelection: ValidationSelection,
	ctx: ExtensionCommandContext,
): Promise<ValidationRunRecord | undefined> {
	if (!ctx.isProjectTrusted()) {
		ctx.ui.notify("Validation execution is unavailable because this project is not trusted.", "warning");
		return undefined;
	}
	if (!ctx.hasUI) {
		ctx.ui.notify(
			"Validation execution requires an interactive approval channel. Use /validate list only.",
			"warning",
		);
		return undefined;
	}
	if (!isSafeStructuredInvocation(command)) {
		ctx.ui.notify(
			"The discovered validation command has an invalid structured invocation and was not executed.",
			"error",
		);
		return undefined;
	}

	const approvalSelection = createSelection(ctx);
	if (!selectionMatches(approvalSelection, expectedSelection)) {
		notifyDiscoveryChanged(ctx, "selected");
		return undefined;
	}
	const approvalCommand = findEquivalentCommand(approvalSelection.discovery, command);
	if (!approvalCommand || !isSafeStructuredInvocation(approvalCommand)) {
		notifyDiscoveryChanged(ctx, "selected");
		return undefined;
	}
	const approvalExecutable = resolveValidationExecutable(approvalCommand.program, ctx.cwd);
	if (approvalExecutable.status === "not-found" || approvalExecutable.workspaceLocal) {
		notifyExecutableUnavailable(ctx, approvalExecutable, "approval");
		return undefined;
	}

	await ctx.waitForIdle();
	const confirmed = await ctx.ui.confirm(
		"Run repository validation?",
		confirmationMessage(approvalCommand, ctx.cwd, approvalExecutable),
	);
	if (!confirmed) {
		ctx.ui.notify("Validation command cancelled.");
		return undefined;
	}

	const executionSelection = createSelection(ctx);
	if (!selectionMatches(executionSelection, approvalSelection)) {
		notifyDiscoveryChanged(ctx, "approval");
		return undefined;
	}
	const executionCommand = findEquivalentCommand(executionSelection.discovery, approvalCommand);
	if (!executionCommand || !isSafeStructuredInvocation(executionCommand)) {
		notifyDiscoveryChanged(ctx, "approval");
		return undefined;
	}
	const executionExecutable = resolveValidationExecutable(executionCommand.program, ctx.cwd);
	if (!executableMatches(approvalExecutable, executionExecutable)) {
		notifyExecutableUnavailable(ctx, executionExecutable, "execution");
		return undefined;
	}

	const started = performance.now();
	const result = await pi.exec(executionCommand.program, [...executionCommand.args], {
		cwd: ctx.cwd,
		signal: ctx.signal,
		timeout: VALIDATION_TIMEOUT_MS,
		maxOutputBytes: VALIDATION_MAX_OUTPUT_BYTES,
	});
	return {
		command: executionCommand,
		resolvedProgram: executionExecutable.canonicalPath,
		cwd: ctx.cwd,
		code: result.code,
		termination: result.termination ?? "completed",
		durationMs: performance.now() - started,
		stdout: result.stdout,
		stderr: result.stderr,
		stdoutTruncated: result.stdoutTruncated === true,
		stderrTruncated: result.stderrTruncated === true,
	};
}

function parseIndex(value: string): number | undefined {
	if (!/^\d+$/u.test(value)) return undefined;
	const index = Number.parseInt(value, 10) - 1;
	return Number.isSafeInteger(index) && index >= 0 ? index : undefined;
}

export default function validationExtension(pi: ExtensionAPI): void {
	let lastSelection: ValidationSelection | undefined;
	let lastRun: ValidationRunRecord | undefined;

	const showList = (ctx: ExtensionCommandContext, filter?: ValidationCommandKind): ValidationSelection => {
		lastSelection = createSelection(ctx);
		ctx.ui.notify(formatValidationCommandList(lastSelection.discovery, filter));
		return lastSelection;
	};

	const runCommand = async (
		command: ValidationCommand,
		selection: ValidationSelection,
		ctx: ExtensionCommandContext,
	): Promise<void> => {
		const record = await executeValidation(pi, command, selection, ctx);
		if (!record) return;
		lastRun = record;
		ctx.ui.notify(
			formatValidationRun(record),
			record.code === 0 && record.termination === "completed" ? "info" : "error",
		);
	};

	pi.registerCommand("validate", {
		description: "Discover and explicitly run repository-grounded validation commands",
		handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
			const args = rawArgs.trim().split(/\s+/u).filter(Boolean);
			const action = args[0]?.toLowerCase() ?? "list";

			if (action === "list") {
				showList(ctx);
				return;
			}
			if (action === "last") {
				ctx.ui.notify(lastRun ? formatValidationRun(lastRun) : "No validation command has run in this session.");
				return;
			}
			if (action === "run") {
				if (args.length !== 2) {
					ctx.ui.notify("Usage: /validate run <number>", "warning");
					return;
				}
				const index = parseIndex(args[1]);
				const selection = lastSelection ?? createSelection(ctx);
				lastSelection = selection;
				const command = index === undefined ? undefined : selection.discovery.commands[index];
				if (!command) {
					ctx.ui.notify(
						"Unknown validation command number. Run /validate list to refresh the choices.",
						"warning",
					);
					return;
				}
				await runCommand(command, selection, ctx);
				return;
			}
			if (["check", "typecheck", "lint", "test", "build"].includes(action)) {
				const kind = action as ValidationCommandKind;
				const selection = createSelection(ctx);
				lastSelection = selection;
				const matches = selection.discovery.commands.filter((command) => command.kind === kind);
				if (matches.length === 1) {
					await runCommand(matches[0], selection, ctx);
					return;
				}
				ctx.ui.notify(
					formatValidationCommandList(selection.discovery, kind),
					matches.length > 1 ? "warning" : "info",
				);
				return;
			}

			ctx.ui.notify("Usage: /validate [list|check|typecheck|lint|test|build|run <number>|last]", "warning");
		},
	});
}
