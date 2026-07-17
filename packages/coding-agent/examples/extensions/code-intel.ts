/**
 * Code-intelligence adapter with a read-only interface.
 *
 * This extension does not bundle or start a language server. Set
 * PI_CODE_INTEL_COMMAND to a project-provided adapter executable and, when
 * needed, PI_CODE_INTEL_ARGS to a JSON string array of fixed arguments.
 * The adapter receives one JSON request argument and must return bounded text.
 * Each request is a short-lived process, so there is no persistent server or
 * background task in the normal session. The executable is trusted host code;
 * this extension does not enforce that it avoids writes, so use a sandbox when
 * the adapter is not fully trusted.
 *
 * Example:
 *   PI_CODE_INTEL_COMMAND=./scripts/code-intel-adapter.ts \
 *   pi -e ./examples/extensions/code-intel.ts
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExecResult, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_OUTPUT_CHARS = 20_000;
const MAX_CAPTURE_BYTES = MAX_OUTPUT_CHARS;
const MAX_ADAPTER_ARGS = 32;
const MAX_ADAPTER_ARG_CHARS = 2_000;
const REQUEST_TIMEOUT_MS = 10_000;

export function parseCodeIntelArgs(raw: string | undefined): { args: string[] } | { error: string } {
	if (!raw) return { args: [] };

	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
			return { error: "PI_CODE_INTEL_ARGS must be a JSON string array" };
		}
		if (parsed.length > MAX_ADAPTER_ARGS || parsed.some((value) => value.length > MAX_ADAPTER_ARG_CHARS)) {
			return {
				error: `PI_CODE_INTEL_ARGS must contain at most ${MAX_ADAPTER_ARGS} arguments of ${MAX_ADAPTER_ARG_CHARS} characters each`,
			};
		}
		return { args: parsed };
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

export interface FormattedCodeIntelOutput {
	text: string;
	truncated: boolean;
}

export function formatCodeIntelOutput(result: ExecResult): FormattedCodeIntelOutput {
	const output =
		result.stdout && result.stderr
			? `stdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`
			: result.stdout || (result.stderr ? `stderr:\n${result.stderr}` : "No code-intelligence result.");
	const truncated = Boolean(result.stdoutTruncated || result.stderrTruncated || output.length > MAX_OUTPUT_CHARS);
	return {
		text: `${output.slice(0, MAX_OUTPUT_CHARS)}${truncated ? "\n[output truncated]" : ""}`,
		truncated,
	};
}

function createCodeIntelTool(pi: ExtensionAPI) {
	return defineTool({
		name: "code_intel",
		label: "Code intelligence",
		description:
			"Read-only project code intelligence through an already-installed adapter. Supports diagnostics, definition, references, and symbols.",
		promptSnippet:
			"Read-only diagnostics, definitions, references, or symbols through the configured project adapter",
		parameters: Type.Object({
			operation: Type.Union([
				Type.Literal("diagnostics"),
				Type.Literal("definition"),
				Type.Literal("references"),
				Type.Literal("symbols"),
			]),
			file: Type.Optional(Type.String()),
			line: Type.Optional(Type.Integer({ minimum: 1 })),
			column: Type.Optional(Type.Integer({ minimum: 1 })),
			query: Type.Optional(Type.String()),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const command = process.env.PI_CODE_INTEL_COMMAND;
			if (!command) {
				return {
					content: [
						{
							type: "text",
							text: "Code intelligence is disabled. Set PI_CODE_INTEL_COMMAND to a project-provided read-only adapter.",
						},
					],
					isError: true,
					details: { configured: false },
				};
			}

			const parsedArgs = parseCodeIntelArgs(process.env.PI_CODE_INTEL_ARGS);
			if ("error" in parsedArgs) {
				return {
					content: [{ type: "text", text: parsedArgs.error }],
					isError: true,
					details: { configured: false },
				};
			}

			const result = await pi.exec(command, [...parsedArgs.args, JSON.stringify(params)], {
				cwd: ctx.cwd,
				signal,
				timeout: REQUEST_TIMEOUT_MS,
				maxOutputBytes: MAX_CAPTURE_BYTES,
			});
			const formatted = formatCodeIntelOutput(result);
			return {
				content: [{ type: "text", text: formatted.text }],
				isError: result.code !== 0,
				details: {
					operation: params.operation,
					exitCode: result.code,
					termination: result.termination,
					killed: result.killed,
					stdoutTruncated: result.stdoutTruncated ?? false,
					stderrTruncated: result.stderrTruncated ?? false,
					truncated: formatted.truncated,
				},
			};
		},
	});
}

export default function codeIntelExtension(pi: ExtensionAPI): void {
	pi.registerTool(createCodeIntelTool(pi));
}
