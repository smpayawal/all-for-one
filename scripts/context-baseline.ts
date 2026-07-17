import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai/compat";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ALLFORONE_BASELINE_TASK_CATEGORIES, type AllForOneBaselineTaskCategory } from "./allforone-baseline.ts";
import {
	estimateContextTokens,
	prepareCompaction,
	type CompactionPreparation,
	type CompactionSettings,
} from "../packages/coding-agent/src/core/compaction/index.ts";
import { serializeConversation } from "../packages/coding-agent/src/core/compaction/utils.ts";
import { convertToLlm } from "../packages/coding-agent/src/core/messages.ts";
import {
	buildSessionContext,
	type CompactionEntry,
	type SessionEntry,
	type SessionMessageEntry,
} from "../packages/coding-agent/src/core/session-manager.ts";
import { ToolOutputTelemetryStore } from "../packages/coding-agent/src/core/tool-output-telemetry.ts";

export const CONTEXT_SCENARIO_IDS = [
	"constraint-survival",
	"superseded-decision",
	"repeated-compaction",
	"split-turn",
	"large-evidence",
	"interrupted-continuation",
] as const;

export type ContextScenarioId = (typeof CONTEXT_SCENARIO_IDS)[number];
export type ContextMarkerDisposition = "summarized" | "recent-exact" | "not-retained";

export interface ContextCriticalMarker {
	marker: string;
	disposition: ContextMarkerDisposition;
}

export interface ContextScenarioReport {
	id: ContextScenarioId;
	description: string;
	executionStatus: "deterministic-fixture";
	compactionCount: number;
	tokensBefore: number[];
	tokensAfter: number[];
	previousSummaryUsed: boolean;
	splitTurnObserved: boolean;
	interruptedContinuationObserved: boolean;
	supersessionObserved: boolean;
	criticalMarkers: ContextCriticalMarker[];
	rawEvidenceChars: number;
	serializedEvidenceChars: number;
	evidenceTailMarkerRetained: boolean;
	truncationCount: number;
	followUpRetrievals: number;
	repeatedReads: number;
	toolCalls: number;
	limitations: string[];
}

export interface ContextBaselineReport {
	schemaVersion: 2;
	capability: "context-integrity";
	title: "Context integrity and compaction baseline";
	evaluationPlan: ReadonlyArray<AllForOneBaselineTaskCategory>;
	environment: {
		cwd: string;
		resourceLoading: "offline-read-only";
		productionPolicyChanged: false;
	};
	scenarios: ContextScenarioReport[];
	limitations: string[];
}

export interface ContextBaselineOptions {
	cwd: string;
}

interface FixtureBuilder {
	entries: SessionEntry[];
	lastId: string | null;
	nextId: number;
	nextTimestamp: number;
}

interface CompactionObservation {
	preparation: CompactionPreparation;
	entriesBefore: SessionEntry[];
	compactionEntryId: string;
	summary: string;
	tokensAfter: number;
}

const COMPACTION_SETTINGS: CompactionSettings = {
	enabled: true,
	reserveTokens: 100,
	keepRecentTokens: 1,
};

const SPLIT_TURN_SETTINGS: CompactionSettings = {
	enabled: true,
	reserveTokens: 100,
	keepRecentTokens: 20,
};

function createBuilder(): FixtureBuilder {
	return {
		entries: [],
		lastId: null,
		nextId: 0,
		nextTimestamp: Date.UTC(2026, 0, 1),
	};
}

function nextEntryMetadata(builder: FixtureBuilder): { id: string; parentId: string | null; timestamp: string } {
	const timestamp = builder.nextTimestamp;
	builder.nextTimestamp += 1_000;
	return {
		id: `context-entry-${String(builder.nextId++).padStart(4, "0")}`,
		parentId: builder.lastId,
		timestamp: new Date(timestamp).toISOString(),
	};
}

function nextMessageTimestamp(builder: FixtureBuilder): number {
	const timestamp = builder.nextTimestamp;
	builder.nextTimestamp += 1_000;
	return timestamp;
}

function createUsage(input: number, output: number): Usage {
	return {
		input,
		output,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: input + output,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function appendMessage(builder: FixtureBuilder, message: AgentMessage): void {
	const metadata = nextEntryMetadata(builder);
	const entry: SessionMessageEntry = {
		type: "message",
		...metadata,
		message,
	};
	builder.entries.push(entry);
	builder.lastId = entry.id;
}

function appendUser(builder: FixtureBuilder, text: string): void {
	appendMessage(builder, {
		role: "user",
		content: text,
		timestamp: nextMessageTimestamp(builder),
	});
}

function createAssistantMessage(
	builder: FixtureBuilder,
	content: AssistantMessage["content"],
	usage: Usage = createUsage(100, 50),
): AssistantMessage {
	return {
		role: "assistant",
		content,
		usage,
		stopReason: "stop",
		timestamp: nextMessageTimestamp(builder),
		api: "anthropic-messages",
		provider: "anthropic",
		model: "context-fixture-model",
	};
}

function appendAssistantText(builder: FixtureBuilder, text: string, usage?: Usage): void {
	appendMessage(builder, createAssistantMessage(builder, [{ type: "text", text }], usage));
}

function appendAssistantToolCall(
	builder: FixtureBuilder,
	toolCallId: string,
	toolName: string,
	argumentsValue: Record<string, unknown>,
	text = "",
): void {
	const content: AssistantMessage["content"] = [];
	if (text.length > 0) content.push({ type: "text", text });
	content.push({ type: "toolCall", id: toolCallId, name: toolName, arguments: argumentsValue });
	appendMessage(builder, createAssistantMessage(builder, content));
}

function appendToolResult(builder: FixtureBuilder, toolCallId: string, toolName: string, text: string): void {
	appendMessage(builder, {
		role: "toolResult",
		toolCallId,
		toolName,
		content: [{ type: "text", text }],
		isError: false,
		timestamp: nextMessageTimestamp(builder),
	});
}

function appendNoise(builder: FixtureBuilder, label: string, count: number): void {
	const detail = "completed implementation detail ".repeat(8);
	for (let index = 0; index < count; index += 1) {
		appendUser(builder, `[${label}:user:${index}] ${detail}`);
		appendAssistantText(builder, `[${label}:assistant:${index}] ${detail}`);
	}
}

function appendCompaction(
	builder: FixtureBuilder,
	settings: CompactionSettings,
	summary: string,
): CompactionObservation {
	const entriesBefore = [...builder.entries];
	const preparation = prepareCompaction(entriesBefore, settings);
	if (!preparation) {
		throw new Error("Context fixture did not produce a native compaction preparation");
	}

	const metadata = nextEntryMetadata(builder);
	const entry: CompactionEntry = {
		type: "compaction",
		...metadata,
		summary,
		firstKeptEntryId: preparation.firstKeptEntryId,
		tokensBefore: preparation.tokensBefore,
		details: {
			readFiles: [...preparation.fileOps.read].sort(),
			modifiedFiles: [...preparation.fileOps.edited, ...preparation.fileOps.written].sort(),
		},
	};
	builder.entries.push(entry);
	builder.lastId = entry.id;

	const tokensAfter = estimateContextTokens(buildSessionContext(builder.entries).messages).tokens;
	return { preparation, entriesBefore, compactionEntryId: entry.id, summary, tokensAfter };
}

function messageContentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	return content
		.map((block) => {
			if (!block || typeof block !== "object") return "";
			if ("text" in block && typeof block.text === "string") return block.text;
			if ("thinking" in block && typeof block.thinking === "string") return block.thinking;
			if ("name" in block && typeof block.name === "string") {
				const argumentsValue = "arguments" in block ? block.arguments : undefined;
				return `${block.name} ${JSON.stringify(argumentsValue)}`;
			}
			return "";
		})
		.join("\n");
}

function messageText(message: AgentMessage): string {
	if (message.role === "user" || message.role === "assistant" || message.role === "toolResult") {
		return messageContentText(message.content);
	}
	if ("content" in message) return messageContentText(message.content);
	return JSON.stringify(message) ?? "";
}

function messagesText(messages: AgentMessage[]): string {
	return messages.map(messageText).join("\n");
}

function entriesText(entries: SessionEntry[]): string {
	return entries
		.filter((entry): entry is SessionMessageEntry => entry.type === "message")
		.map((entry) => messageText(entry.message))
		.join("\n");
}

function markerDisposition(observation: CompactionObservation, marker: string): ContextMarkerDisposition {
	const summarizedText = messagesText([
		...observation.preparation.messagesToSummarize,
		...observation.preparation.turnPrefixMessages,
	]);
	const markerWasSummarized = summarizedText.includes(marker);
	const markerWasInPreviousSummary = observation.preparation.previousSummary?.includes(marker) ?? false;
	const markerWasKeptExact = entriesText(
		observation.entriesBefore.slice(
			observation.entriesBefore.findIndex((entry) => entry.id === observation.preparation.firstKeptEntryId),
		),
	).includes(marker);
	const markerWasWrittenToSummary = observation.summary.includes(marker);

	if (markerWasSummarized || markerWasInPreviousSummary) {
		return markerWasWrittenToSummary ? "summarized" : "not-retained";
	}
	if (markerWasKeptExact) return "recent-exact";
	if (markerWasWrittenToSummary) return "summarized";
	return "not-retained";
}

function resumedMarkerDisposition(
	entries: SessionEntry[],
	observation: CompactionObservation,
	marker: string,
): ContextMarkerDisposition {
	const compactionIndex = entries.findIndex((entry) => entry.id === observation.compactionEntryId);
	if (compactionIndex < 0) return "not-retained";
	return entriesText(entries.slice(compactionIndex + 1)).includes(marker) ? "recent-exact" : "not-retained";
}

function countToolCalls(entries: SessionEntry[]): number {
	return entries.reduce((count, entry) => {
		if (entry.type !== "message" || entry.message.role !== "assistant") return count;
		return count + entry.message.content.filter((block) => block.type === "toolCall").length;
	}, 0);
}

function createScenarioReport(
	id: ContextScenarioId,
	description: string,
	builder: FixtureBuilder,
	observations: CompactionObservation[],
	criticalMarkers: ContextCriticalMarker[],
	limitations: string[] = [],
): ContextScenarioReport {
	return {
		id,
		description,
		executionStatus: "deterministic-fixture",
		compactionCount: observations.length,
		tokensBefore: observations.map((observation) => observation.preparation.tokensBefore),
		tokensAfter: observations.map((observation) => observation.tokensAfter),
		previousSummaryUsed: observations.some((observation) => observation.preparation.previousSummary !== undefined),
		splitTurnObserved: observations.some((observation) => observation.preparation.isSplitTurn),
		interruptedContinuationObserved: false,
		supersessionObserved: false,
		criticalMarkers,
		rawEvidenceChars: 0,
		serializedEvidenceChars: 0,
		evidenceTailMarkerRetained: true,
		truncationCount: 0,
		followUpRetrievals: 0,
		repeatedReads: 0,
		toolCalls: countToolCalls(builder.entries),
		limitations,
	};
}

function collectConstraintSurvival(): ContextScenarioReport {
	const builder = createBuilder();
	appendUser(builder, "[constraint:context] Preserve the exact validation command and do not add a second context manager.");
	appendAssistantText(builder, "Acknowledged [constraint:context].");
	appendNoise(builder, "constraint-noise", 2);
	appendUser(builder, "[constraint-followup] Continue with the approved baseline.");

	const observation = appendCompaction(
		builder,
		COMPACTION_SETTINGS,
		"## Constraints & Preferences\n- [constraint:context] Preserve the exact validation command and do not add a second context manager.\n\n## Critical Context\n- The approved baseline is deterministic and model-free.",
	);

	return createScenarioReport(
		"constraint-survival",
		"A critical Context constraint is summarized while the newest follow-up remains exact.",
		builder,
		[observation],
		[{ marker: "constraint:context", disposition: markerDisposition(observation, "constraint:context") }],
		["The fixture checks marker placement across the native boundary; it does not evaluate model adherence."],
	);
}

function collectSupersededDecision(): ContextScenarioReport {
	const builder = createBuilder();
	appendUser(builder, "[decision:A] Use the original retention rule for this fixture.");
	appendAssistantText(builder, "Recorded [decision:A].");
	appendNoise(builder, "decision-noise", 2);
	appendUser(builder, "[decision:B] Correction: use the newer retention rule instead.");

	const summary =
		"## Key Decisions\n- [decision:A] Superseded: do not use the original retention rule.\n- [decision:B] Active correction: use the newer retention rule instead.\n\n## Progress\n- The correction remains the newest exact user state.";
	const observation = appendCompaction(
		builder,
		COMPACTION_SETTINGS,
		summary,
	);

	const report = createScenarioReport(
		"superseded-decision",
		"An older decision is summarized while a correction remains in the retained exact suffix.",
		builder,
		[observation],
		[
			{ marker: "decision:A", disposition: markerDisposition(observation, "decision:A") },
			{ marker: "decision:B", disposition: markerDisposition(observation, "decision:B") },
		],
		["Supersession is represented structurally; no model-generated conflict resolution is performed."],
	);
	return { ...report, supersessionObserved: summary.includes("Superseded") && summary.includes("Active correction") };
}

function collectRepeatedCompaction(): ContextScenarioReport {
	const builder = createBuilder();
	appendUser(builder, "[repeat:initial] Establish the first context checkpoint.");
	appendAssistantText(builder, "Initial work recorded.");
	appendNoise(builder, "repeat-first", 2);
	appendUser(builder, "[repeat:checkpoint-1] Continue after the first checkpoint.");

	const firstObservation = appendCompaction(
		builder,
		COMPACTION_SETTINGS,
		"## Progress\n- [repeat:checkpoint-1] First deterministic checkpoint created.",
	);
	appendUser(builder, "[repeat:checkpoint-2] Continue after the second checkpoint.");

	const secondObservation = appendCompaction(
		builder,
		COMPACTION_SETTINGS,
		"## Progress\n- [repeat:checkpoint-2] Second checkpoint created.\n\n## Critical Context\n- Preserve [repeat:checkpoint-1] from the previous summary.",
	);
	appendUser(builder, "[repeat:checkpoint-3] Continue after the third checkpoint boundary.");

	const thirdObservation = appendCompaction(
		builder,
		COMPACTION_SETTINGS,
		"## Progress\n- [repeat:checkpoint-3] Third deterministic checkpoint created.\n\n## Critical Context\n- Preserve [repeat:checkpoint-1] and [repeat:checkpoint-2] from prior summaries.",
	);

	return createScenarioReport(
		"repeated-compaction",
		"Three sequential native compaction preparations exercise iterative previous-summary input.",
		builder,
		[firstObservation, secondObservation, thirdObservation],
		[
			{ marker: "repeat:checkpoint-1", disposition: markerDisposition(thirdObservation, "repeat:checkpoint-1") },
			{ marker: "repeat:checkpoint-2", disposition: markerDisposition(thirdObservation, "repeat:checkpoint-2") },
			{ marker: "repeat:checkpoint-3", disposition: markerDisposition(thirdObservation, "repeat:checkpoint-3") },
		],
		["The repeated pass validates three boundary transitions and previous-summary bookkeeping, not summary quality."],
	);
}

function collectSplitTurn(): ContextScenarioReport {
	const builder = createBuilder();
	appendUser(builder, "[split-turn:request] Inspect the file and keep the final suffix available.");
	appendAssistantToolCall(builder, "context-tool-001", "read", { path: "src/example.ts" }, "[split-turn:prefix] Read the requested file.");
	appendToolResult(builder, "context-tool-001", "read", "export const example = true;\n".repeat(12));
	appendAssistantText(builder, "[split-turn:suffix] The retained suffix follows the tool result.");

	const observation = appendCompaction(
		builder,
		SPLIT_TURN_SETTINGS,
		"## Progress\n- [split-turn:request] The turn prefix was summarized while the suffix remained exact.",
	);

	return createScenarioReport(
		"split-turn",
		"A native assistant-boundary cut records a split turn and retains the suffix.",
		builder,
		[observation],
		[
			{ marker: "split-turn:request", disposition: markerDisposition(observation, "split-turn:request") },
			{ marker: "split-turn:suffix", disposition: markerDisposition(observation, "split-turn:suffix") },
		],
		["The fixture observes the existing split-turn algorithm without changing its cut-point policy."],
	);
}

function collectLargeEvidence(cwd: string): ContextScenarioReport {
	const builder = createBuilder();
	const evidence = `${"evidence-line ".repeat(320)}[evidence:tail]`;
	const toolCallId = "context-tool-002";
	appendUser(builder, "[large-evidence:request] Capture and inspect the large evidence output.");
	appendAssistantToolCall(builder, toolCallId, "bash", { command: "capture-evidence" });
	appendToolResult(builder, toolCallId, "bash", evidence);

	const serializedEvidence = serializeConversation(
		convertToLlm([
			{
				role: "toolResult",
				toolCallId,
				toolName: "bash",
				content: [{ type: "text", text: evidence }],
				isError: false,
				timestamp: nextMessageTimestamp(builder),
			},
		]),
	);

	const telemetry = new ToolOutputTelemetryStore(cwd);
	const fullOutputPath = resolve(cwd, ".context-fixtures", "large-evidence.log");
	const returnedEvidence = evidence.slice(0, 2_000);
	telemetry.record(
		"bash",
		{ command: "capture-evidence" },
		[{ type: "text", text: returnedEvidence }],
		{
			truncation: {
				totalBytes: Buffer.byteLength(evidence, "utf8"),
				outputBytes: Buffer.byteLength(returnedEvidence, "utf8"),
				totalLines: evidence.split("\n").length,
				outputLines: returnedEvidence.split("\n").length,
				truncated: true,
				truncatedBy: "bytes",
			},
			fullOutputPath,
		},
		false,
	);
	telemetry.record("read", { path: fullOutputPath }, [{ type: "text", text: "recovered evidence" }], undefined, false);
	const repeatedReadPath = resolve(cwd, ".context-fixtures", "repeated-evidence.log");
	telemetry.record("read", { path: repeatedReadPath }, [{ type: "text", text: "repeated evidence" }], undefined, false);
	telemetry.record("read", { path: repeatedReadPath }, [{ type: "text", text: "repeated evidence again" }], undefined, false);

	const telemetryTotals = telemetry.list().reduce(
		(totals, item) => ({
			truncationCount: totals.truncationCount + item.truncationCount,
			followUpRetrievals: totals.followUpRetrievals + item.followUpRetrievals,
			repeatedReads: totals.repeatedReads + item.repeatedReads,
		}),
		{ truncationCount: 0, followUpRetrievals: 0, repeatedReads: 0 },
	);

	const report = createScenarioReport(
		"large-evidence",
		"A large tool result is serialized with the existing bound and recovered through telemetry-linked follow-up reads.",
		builder,
		[],
		[{ marker: "evidence:tail", disposition: "not-retained" }],
		["The evidence path is offline and synthetic; no filesystem output is created."],
	);
	return {
		...report,
		rawEvidenceChars: evidence.length,
		serializedEvidenceChars: serializedEvidence.length,
		evidenceTailMarkerRetained: serializedEvidence.includes("[evidence:tail]"),
		truncationCount: telemetryTotals.truncationCount,
		followUpRetrievals: telemetryTotals.followUpRetrievals,
		repeatedReads: telemetryTotals.repeatedReads,
	};
}

function collectInterruptedContinuation(): ContextScenarioReport {
	const builder = createBuilder();
	appendUser(builder, "[interrupted:goal] Complete the migration while preserving the public API.");
	appendAssistantText(builder, "[interrupted:progress] The first file was inspected and the validation command was recorded.");
	appendNoise(builder, "interrupted-noise", 2);
	appendUser(builder, "[interrupted:checkpoint] The task stopped after validation failed with TS2322.");

	const observation = appendCompaction(
		builder,
		COMPACTION_SETTINGS,
		"## Goal\n- [interrupted:goal] Complete the migration while preserving the public API.\n\n## Progress\n- [interrupted:checkpoint] The task stopped after validation failed with TS2322.\n\n## Next Steps\n- Resume from the saved validation state without redoing completed file reads.",
	);
	appendUser(
		builder,
		"[interrupted:resume] Resume the interrupted task from the saved session. Address TS2322 without re-reading completed files.",
	);
	appendAssistantText(builder, "[interrupted:response] Resumed from the compaction boundary and kept the recorded validation state.");

	const report = createScenarioReport(
		"interrupted-continuation",
		"An interrupted task resumes after a native compaction boundary with the saved goal and validation state available.",
		builder,
		[observation],
		[
			{ marker: "interrupted:goal", disposition: markerDisposition(observation, "interrupted:goal") },
			{ marker: "interrupted:resume", disposition: resumedMarkerDisposition(builder.entries, observation, "interrupted:resume") },
		],
		["The fixture observes a resumed session entry after compaction; it does not measure a model's rediscovery behavior."],
	);
	return { ...report, interruptedContinuationObserved: true };
}

export function collectContextBaseline(options: ContextBaselineOptions): ContextBaselineReport {
	const cwd = resolve(options.cwd);
	return {
		schemaVersion: 2,
		capability: "context-integrity",
		title: "Context integrity and compaction baseline",
		evaluationPlan: ALLFORONE_BASELINE_TASK_CATEGORIES,
		environment: {
			cwd,
			resourceLoading: "offline-read-only",
			productionPolicyChanged: false,
		},
		scenarios: [
			collectConstraintSurvival(),
			collectSupersededDecision(),
			collectRepeatedCompaction(),
			collectSplitTurn(),
			collectLargeEvidence(cwd),
			collectInterruptedContinuation(),
		],
		limitations: [
			"context is model-free and does not measure model answer quality, latency, or cost.",
			"Summaries are deterministic fixture strings used to observe retention boundaries, not production prompts.",
			"No production compaction policy, session format, or context manager is changed by this baseline.",
		],
	};
}

function parseArguments(argv: string[]): { cwd: string; json: boolean; help: boolean } {
	let cwd = process.cwd();
	let json = false;
	let help = false;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--json") {
			json = true;
			continue;
		}
		if (argument === "--help" || argument === "-h") {
			help = true;
			continue;
		}
		if (argument === "--cwd") {
			const value = argv[index + 1];
			if (!value) throw new Error("--cwd requires a path");
			cwd = value;
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}

	return { cwd, json, help };
}

function printHumanReport(report: ContextBaselineReport): string {
	const lines = [
		`${report.capability}: ${report.title}`,
		`Fixture mode: ${report.environment.resourceLoading}; production policy changed: ${report.environment.productionPolicyChanged}`,
	];
	for (const scenario of report.scenarios) {
		lines.push(
			`${scenario.id}: compactions=${scenario.compactionCount}, before=${scenario.tokensBefore.join(",") || "-"}, after=${scenario.tokensAfter.join(",") || "-"}, split=${scenario.splitTurnObserved}, truncations=${scenario.truncationCount}, follow-ups=${scenario.followUpRetrievals}, repeated-reads=${scenario.repeatedReads}`,
		);
	}
	return `${lines.join("\n")}\n`;
}

function printHelp(): string {
	return [
		"Usage: npm run baseline:context -- [--json] [--cwd PATH]",
		"",
		"Runs the offline, deterministic Context context-integrity fixtures.",
	].join("\n");
}

function isMainModule(): boolean {
	const entrypoint = process.argv[1];
	return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) {
	try {
		const argumentsValue = parseArguments(process.argv.slice(2));
		if (argumentsValue.help) {
			process.stdout.write(`${printHelp()}\n`);
		} else {
			const report = collectContextBaseline({ cwd: argumentsValue.cwd });
			process.stdout.write(argumentsValue.json ? `${JSON.stringify(report, null, 2)}\n` : printHumanReport(report));
		}
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
