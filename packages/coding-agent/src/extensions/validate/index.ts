import { performance } from "node:perf_hooks";
import type { ExtensionAPI, ExtensionCommandContext } from "../../core/extensions/types.ts";
import {
	discoverValidationCommands,
	type ValidationCommand,
	type ValidationCommandDiscovery,
	type ValidationCommandKind,
} from "../../core/validation-commands.ts";

const VALIDATION_TIMEOUT_MS = 120_000;
const VALIDATION_MAX_OUTPUT_BYTES = 64 * 1_024;
const VALIDATION_MAX_NOTIFICATION_CHARS = 6_000;

type StructuredValidationCommand = ValidationCommand & { program: string; args: string[] };

export interface ValidationRunRecord {
	command: ValidationCommand;
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

function confirmationMessage(command: StructuredValidationCommand, cwd: string): string {
	const warning =
		command.confidence === "inferred"
			? "This command was inferred from repository configuration rather than declared as an exact project script."
			: "This command is declared by repository configuration.";
	return [
		warning,
		"",
		`Program: ${command.program}`,
		`Arguments: ${formatArguments(command.args)}`,
		`Working directory: ${cwd}`,
		`Source: ${command.source}`,
		"",
		"The executable will be spawned directly without a shell. Continue?",
	].join("\n");
}

async function executeValidation(
	pi: ExtensionAPI,
	command: ValidationCommand,
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

	await ctx.waitForIdle();
	const confirmed = await ctx.ui.confirm("Run repository validation?", confirmationMessage(command, ctx.cwd));
	if (!confirmed) {
		ctx.ui.notify("Validation command cancelled.");
		return undefined;
	}

	const started = performance.now();
	const result = await pi.exec(command.program, [...command.args], {
		cwd: ctx.cwd,
		signal: ctx.signal,
		timeout: VALIDATION_TIMEOUT_MS,
		maxOutputBytes: VALIDATION_MAX_OUTPUT_BYTES,
	});
	return {
		command,
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

function discover(ctx: ExtensionCommandContext): ValidationCommandDiscovery {
	return discoverValidationCommands(ctx.cwd);
}

function parseIndex(value: string): number | undefined {
	if (!/^\d+$/u.test(value)) return undefined;
	const index = Number.parseInt(value, 10) - 1;
	return Number.isSafeInteger(index) && index >= 0 ? index : undefined;
}

export default function validationExtension(pi: ExtensionAPI): void {
	let lastDiscovery: ValidationCommandDiscovery | undefined;
	let lastRun: ValidationRunRecord | undefined;

	const showList = (ctx: ExtensionCommandContext, filter?: ValidationCommandKind): ValidationCommandDiscovery => {
		lastDiscovery = discover(ctx);
		ctx.ui.notify(formatValidationCommandList(lastDiscovery, filter));
		return lastDiscovery;
	};

	const runCommand = async (command: ValidationCommand, ctx: ExtensionCommandContext): Promise<void> => {
		const record = await executeValidation(pi, command, ctx);
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
				const discovery = lastDiscovery ?? discover(ctx);
				lastDiscovery = discovery;
				const command = index === undefined ? undefined : discovery.commands[index];
				if (!command) {
					ctx.ui.notify(
						"Unknown validation command number. Run /validate list to refresh the choices.",
						"warning",
					);
					return;
				}
				await runCommand(command, ctx);
				return;
			}
			if (["check", "typecheck", "lint", "test", "build"].includes(action)) {
				const kind = action as ValidationCommandKind;
				const discovery = discover(ctx);
				lastDiscovery = discovery;
				const matches = discovery.commands.filter((command) => command.kind === kind);
				if (matches.length === 1) {
					await runCommand(matches[0], ctx);
					return;
				}
				ctx.ui.notify(formatValidationCommandList(discovery, kind), matches.length > 1 ? "warning" : "info");
				return;
			}

			ctx.ui.notify("Usage: /validate [list|check|typecheck|lint|test|build|run <number>|last]", "warning");
		},
	});
}
