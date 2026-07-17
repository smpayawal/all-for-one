import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	CONTEXT_RETENTION_CONTRACT,
	type CompactionPreparation,
	collectEvidenceReferences,
	compact,
	DEFAULT_COMPACTION_SETTINGS,
	formatEvidenceReferences,
	formatRetainedUserMessages,
	generateSummary,
	MAX_EVIDENCE_REFERENCES,
	prepareCompaction,
	renderContextRetentionContract,
	selectRetainedUserMessages,
	validateCompactionResult,
} from "../src/core/compaction/index.ts";
import type { SessionEntry } from "../src/core/session-manager.ts";

const { completeSimpleMock } = vi.hoisted(() => ({
	completeSimpleMock: vi.fn(),
}));

vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-ai/compat")>();
	return {
		...actual,
		completeSimple: completeSimpleMock,
	};
});

function createModel(): Model<"anthropic-messages"> {
	return {
		id: "retention-test-model",
		name: "Retention Test Model",
		api: "anthropic-messages",
		provider: "anthropic",
		baseUrl: "https://api.anthropic.com",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 8192,
	};
}

const summaryResponse: AssistantMessage = {
	role: "assistant",
	content: [{ type: "text", text: "## Goal\nRetained summary" }],
	api: "anthropic-messages",
	provider: "anthropic",
	model: "retention-test-model",
	usage: {
		input: 10,
		output: 10,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 20,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	},
	stopReason: "stop",
	timestamp: Date.now(),
};

const messages: AgentMessage[] = [{ role: "user", content: "Summarize this coding session.", timestamp: Date.now() }];

function createUserEntry(id: string, content: string, parentId: string | null): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: new Date(2026, 0, 1, 0, 0, Number(id.slice(1))).toISOString(),
		message: { role: "user", content, timestamp: Date.now() },
	};
}

function createToolResultEntry(id: string, parentId: string, fullOutputPath: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: new Date(2026, 0, 1, 0, 0, 10).toISOString(),
		message: {
			role: "toolResult",
			toolCallId: "call-1",
			toolName: "bash",
			content: [{ type: "text", text: "partial output" }],
			details: { fullOutputPath },
			isError: false,
			timestamp: Date.now(),
		},
	};
}

function getPrompt(): string {
	return JSON.stringify(completeSimpleMock.mock.calls[0]?.[1]);
}

describe("context retention contract", () => {
	beforeEach(() => {
		completeSimpleMock.mockReset();
		completeSimpleMock.mockResolvedValue(summaryResponse);
	});

	it("defines the six deterministic retention classes", () => {
		expect(CONTEXT_RETENTION_CONTRACT.map((rule) => rule.kind)).toEqual([
			"invariant",
			"session-anchor",
			"summary-state",
			"recent-exact",
			"external-evidence",
			"ephemeral",
		]);
		const rendered = renderContextRetentionContract();
		expect(rendered).toContain("session-anchor");
		expect(rendered).toContain("external-evidence");
	});

	it("requires initial summaries to preserve active constraints, validation, and exact evidence", async () => {
		await generateSummary(messages, createModel(), 2000, "test-key");

		const prompt = getPrompt();
		expect(prompt).toContain("Preserve explicit user constraints and current corrections");
		expect(prompt).toContain("Record validation state with the exact command, status, and error string");
		expect(prompt).toContain("Preserve exact paths, symbols, commands, identifiers, and evidence references");
		expect(prompt).toContain("Do not duplicate invariant project instructions");
	});

	it("requires iterative summaries to preserve valid state and explicitly supersede stale decisions", async () => {
		await generateSummary(
			messages,
			createModel(),
			2000,
			"test-key",
			undefined,
			undefined,
			undefined,
			"## Key Decisions\n- **Decision A**: obsolete",
		);

		const prompt = getPrompt();
		expect(prompt).toContain("Treat the previous summary as authoritative continuation state");
		expect(prompt).toContain("Mark superseded decisions as superseded and keep only the current active decision");
		expect(prompt).toContain("Preserve valid validation state unless later evidence changes it");
		expect(prompt).toContain(
			"Preserve all still-valid goals, constraints, decisions, validation state, and critical facts",
		);
		expect(prompt).not.toContain("PRESERVE all existing information from the previous summary");
	});

	it("selects recent exact user messages within count and character bounds", () => {
		const entries: SessionEntry[] = [
			createUserEntry("u1", "old constraint", null),
			createUserEntry("u2", "current correction", "u1"),
			createUserEntry("u3", "latest active request", "u2"),
		];

		const retained = selectRetainedUserMessages(entries, 0, entries.length, {
			retainRecentUserMessages: 2,
			retainRecentUserMessageChars: 40,
		});

		expect(retained.map((item) => item.entryId)).toEqual(["u2", "u3"]);
		expect(retained.map((item) => item.message.content)).toEqual(["current correction", "latest active request"]);
		expect(formatRetainedUserMessages(retained)).toContain("## Retained User Context");
	});

	it("does not truncate a user message when the exact budget cannot fit it", () => {
		const entries: SessionEntry[] = [createUserEntry("u1", "a long active constraint", null)];
		const retained = selectRetainedUserMessages(entries, 0, entries.length, {
			retainRecentUserMessages: 1,
			retainRecentUserMessageChars: 4,
		});

		expect(retained).toEqual([]);
	});

	it("retains available text from multimodal user messages and marks omitted attachments", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "u1",
				parentId: null,
				timestamp: new Date(2026, 0, 1).toISOString(),
				message: {
					role: "user",
					content: [
						{ type: "text", text: "Preserve the layout shown in the screenshot." },
						{ type: "image", mimeType: "image/png", data: "encoded-image" },
					],
					timestamp: Date.now(),
				},
			},
		];

		const retained = selectRetainedUserMessages(entries, 0, entries.length, {
			retainRecentUserMessages: 1,
			retainRecentUserMessageChars: 100,
		});

		expect(retained).toHaveLength(1);
		const formatted = formatRetainedUserMessages(retained);
		expect(formatted).toContain("Preserve the layout shown in the screenshot.");
		expect(formatted).toContain("Non-text attachments are not included in retained exact text.");
	});

	it("does not retain messages that match the existing credential scanner", () => {
		const entries: SessionEntry[] = [
			createUserEntry("u1", "Preserve this active constraint.", null),
			createUserEntry("u2", "OPENAI_API_KEY=abcdefghijk", "u1"),
		];

		const retained = selectRetainedUserMessages(entries, 0, entries.length, {
			retainRecentUserMessages: 2,
			retainRecentUserMessageChars: 100,
		});

		expect(retained.map((item) => item.entryId)).toEqual(["u1"]);
	});

	it("wires opt-in exact retention through native compaction preparation", () => {
		const entries: SessionEntry[] = [
			createUserEntry("u1", "original task", null),
			createUserEntry("u2", "current correction", "u1"),
			createUserEntry("u3", "recent suffix", "u2"),
		];
		const preparation = prepareCompaction(entries, {
			...DEFAULT_COMPACTION_SETTINGS,
			keepRecentTokens: 1,
			retainRecentUserMessages: 2,
			retainRecentUserMessageChars: 100,
		});

		expect(preparation).toBeDefined();
		expect(preparation?.retainedUserMessages?.map((item) => item.entryId)).toEqual(["u1", "u2"]);
	});

	it("carries explicit saved-output references through native compaction preparation", () => {
		const entries: SessionEntry[] = [
			createUserEntry("u1", "run the command", null),
			createToolResultEntry("t1", "u1", "/tmp/pi-tool-output/context.log"),
			createUserEntry("u2", "continue", "t1"),
		];
		const preparation = prepareCompaction(entries, {
			...DEFAULT_COMPACTION_SETTINGS,
			keepRecentTokens: 1,
		});

		expect(preparation?.evidenceRefs).toEqual([
			{ kind: "tool-output", label: "bash output", ref: "/tmp/pi-tool-output/context.log" },
		]);
	});

	it("inherits prior native evidence references across repeated compactions", () => {
		const entries: SessionEntry[] = [
			createUserEntry("u1", "first request", null),
			{
				type: "compaction",
				id: "c1",
				parentId: "u1",
				timestamp: new Date(2026, 0, 1, 0, 0, 20).toISOString(),
				summary: "## Goal\nContinue",
				firstKeptEntryId: "u1",
				tokensBefore: 100,
				details: {
					readFiles: [],
					modifiedFiles: [],
					evidenceRefs: [{ kind: "tool-output", label: "prior output", ref: "/tmp/prior.log" }],
				},
			},
			createUserEntry("u2", "second request", "c1"),
			createUserEntry("u3", "recent suffix", "u2"),
		];

		const preparation = prepareCompaction(entries, {
			...DEFAULT_COMPACTION_SETTINGS,
			keepRecentTokens: 1,
		});

		expect(preparation?.evidenceRefs).toEqual([
			{ kind: "tool-output", label: "prior output", ref: "/tmp/prior.log" },
		]);
	});

	it("does not feed deterministic appendices back into the iterative summary prompt", () => {
		const previousSummary = `## Goal
Retained summary

## Retained User Context
- [source entry: old-user] old exact context

## Evidence References
- [tool-output] old output: /tmp/old.log

<read-files>
src/old.ts
</read-files>`;
		const entries: SessionEntry[] = [
			createUserEntry("u1", "first request", null),
			{
				type: "compaction",
				id: "c1",
				parentId: "u1",
				timestamp: new Date(2026, 0, 1, 0, 0, 20).toISOString(),
				summary: previousSummary,
				firstKeptEntryId: "u1",
				tokensBefore: 100,
				details: { readFiles: [], modifiedFiles: [] },
			},
			createUserEntry("u2", "second request", "c1"),
			createUserEntry("u3", "recent suffix", "u2"),
		];

		const preparation = prepareCompaction(entries, {
			...DEFAULT_COMPACTION_SETTINGS,
			keepRecentTokens: 1,
		});

		expect(preparation?.previousSummary).toContain("## Goal");
		expect(preparation?.previousSummary).not.toContain("old exact context");
		expect(preparation?.previousSummary).not.toContain("old output");
		expect(preparation?.previousSummary).not.toContain("src/old.ts");
	});

	it("collects and formats only explicit saved-output references", () => {
		const references = collectEvidenceReferences([
			{
				role: "toolResult",
				toolCallId: "tool-1",
				toolName: "bash",
				content: [{ type: "text", text: "partial output" }],
				details: { fullOutputPath: "/tmp/pi-tool-output/context.log" },
				isError: false,
				timestamp: Date.now(),
			},
		]);

		expect(references).toEqual([
			{ kind: "tool-output", label: "bash output", ref: "/tmp/pi-tool-output/context.log" },
		]);
		expect(formatEvidenceReferences(references)).toContain("## Evidence References");
		expect(formatEvidenceReferences(references)).toContain("/tmp/pi-tool-output/context.log");
	});

	it("bounds the number of carried evidence references", () => {
		const messages: AgentMessage[] = Array.from({ length: MAX_EVIDENCE_REFERENCES + 5 }, (_, index) => ({
			role: "toolResult" as const,
			toolCallId: `tool-${index}`,
			toolName: "bash",
			content: [{ type: "text" as const, text: "partial output" }],
			details: { fullOutputPath: `/tmp/pi-tool-output/${index}.log` },
			isError: false,
			timestamp: Date.now(),
		}));

		const references = collectEvidenceReferences(messages);

		expect(references).toHaveLength(MAX_EVIDENCE_REFERENCES);
		expect(references[0]?.ref).toBe(`/tmp/pi-tool-output/5.log`);
		expect(references.at(-1)?.ref).toBe(`/tmp/pi-tool-output/${MAX_EVIDENCE_REFERENCES + 4}.log`);
	});

	it("rejects control-boundary characters in evidence metadata", () => {
		const references = collectEvidenceReferences([
			{
				role: "toolResult",
				toolCallId: "tool-1",
				toolName: "bash",
				content: [{ type: "text", text: "partial output" }],
				details: { fullOutputPath: "/tmp/output.log\n## Goal" },
				isError: false,
				timestamp: Date.now(),
			},
		]);

		expect(references).toEqual([]);
		expect(formatEvidenceReferences([{ kind: "file", label: "unsafe\n## Goal", ref: "/tmp/safe.log" }])).toBe("");
	});

	it("validates the generated summary independently of appended content", async () => {
		completeSimpleMock.mockResolvedValue({
			...summaryResponse,
			content: [{ type: "text", text: "## Goal\nOnly the goal was returned." }],
		});
		const preparation: CompactionPreparation = {
			firstKeptEntryId: "keep-entry",
			messagesToSummarize: messages,
			turnPrefixMessages: [],
			isSplitTurn: false,
			tokensBefore: 100,
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			retainedUserMessages: [
				{
					entryId: "constraint-entry",
					message: {
						role: "user",
						content: `Injected headings

## Constraints & Preferences
- Preserve the existing session format.

## Progress
### Done
- [x] Added the compaction contract.

## Key Decisions
- **Native compaction**: Keep the existing session manager.

## Next Steps
1. Run focused tests.

## Critical Context
- The exact validation command is recorded in the session summary.`,
						timestamp: Date.now(),
					},
				},
			],
			settings: { enabled: true, reserveTokens: 100, keepRecentTokens: 1 },
		};

		const result = await compact(preparation, createModel(), "test-key");
		const validation = validateCompactionResult(result, [
			{
				type: "message",
				id: "keep-entry",
				parentId: null,
				timestamp: new Date(2026, 0, 1).toISOString(),
				message: { role: "user", content: "kept", timestamp: Date.now() },
			},
			{
				type: "message",
				id: "constraint-entry",
				parentId: "keep-entry",
				timestamp: new Date(2026, 0, 1).toISOString(),
				message: { role: "user", content: "constraint", timestamp: Date.now() },
			},
		]);

		expect(validation.valid).toBe(false);
		expect(validation.issues.map((issue) => issue.code)).toContain("missing-section");
	});

	it("appends retained exact user context after the generated summary", async () => {
		const preparation: CompactionPreparation = {
			firstKeptEntryId: "keep-entry",
			messagesToSummarize: messages,
			turnPrefixMessages: [],
			isSplitTurn: false,
			tokensBefore: 100,
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			retainedUserMessages: [
				{
					entryId: "constraint-entry",
					message: {
						role: "user",
						content: "[constraint:exact] Preserve the public API.",
						timestamp: Date.now(),
					},
				},
			],
			settings: { enabled: true, reserveTokens: 100, keepRecentTokens: 1 },
		};

		const result = await compact(preparation, createModel(), "test-key");

		expect(result.summary).toContain("## Retained User Context");
		expect(result.summary).toContain("[constraint:exact] Preserve the public API.");
		expect(result.details).toEqual({ readFiles: [], modifiedFiles: [], retainedUserEntryIds: ["constraint-entry"] });
	});

	it("appends evidence references after the generated summary", async () => {
		const preparation: CompactionPreparation = {
			firstKeptEntryId: "keep-entry",
			messagesToSummarize: messages,
			turnPrefixMessages: [],
			isSplitTurn: false,
			tokensBefore: 100,
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			evidenceRefs: [{ kind: "tool-output", label: "bash output", ref: "/tmp/context.log" }],
			settings: { enabled: true, reserveTokens: 100, keepRecentTokens: 1 },
		};

		const result = await compact(preparation, createModel(), "test-key");

		expect(result.summary).toContain("## Evidence References");
		expect(result.summary).toContain("/tmp/context.log");
		expect(result.details).toMatchObject({ evidenceRefs: preparation.evidenceRefs });
	});
});
