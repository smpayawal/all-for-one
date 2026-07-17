/**
 * Read-only code-intelligence adapter.
 *
 * This extension does not bundle or start a language server. Set
 * PI_CODE_INTEL_COMMAND to a project-provided adapter executable and, when
 * needed, PI_CODE_INTEL_ARGS to a JSON string array of fixed arguments.
 * The adapter receives one JSON request argument and must return bounded text.
 * Each request is a short-lived process, so there is no persistent server or
 * background task in the normal session.
 *
 * Example:
 *   PI_CODE_INTEL_COMMAND=./scripts/code-intel-adapter.ts \
 *   pi -e ./examples/extensions/code-intel.ts
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_OUTPUT_CHARS = 20_000;
const REQUEST_TIMEOUT_MS = 10_000;

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

			let adapterArgs: string[] = [];
			const configuredArgs = process.env.PI_CODE_INTEL_ARGS;
			if (configuredArgs) {
				try {
					const parsed: unknown = JSON.parse(configuredArgs);
					if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
						throw new Error("PI_CODE_INTEL_ARGS must be a JSON string array");
					}
					adapterArgs = parsed;
				} catch (error) {
					return {
						content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
						isError: true,
						details: { configured: false },
					};
				}
			}

			const result = await pi.exec(command, [...adapterArgs, JSON.stringify(params)], {
				cwd: ctx.cwd,
				signal,
				timeout: REQUEST_TIMEOUT_MS,
			});
			const output = (result.stdout || result.stderr || "No code-intelligence result.").slice(0, MAX_OUTPUT_CHARS);
			const suffix = output.length === MAX_OUTPUT_CHARS ? "\n[output truncated]" : "";
			return {
				content: [{ type: "text", text: `${output}${suffix}` }],
				isError: result.code !== 0,
				details: { operation: params.operation, exitCode: result.code, truncated: suffix.length > 0 },
			};
		},
	});
}

export default function codeIntelExtension(pi: ExtensionAPI): void {
	pi.registerTool(createCodeIntelTool(pi));
}
