import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai/compat";
import { describe, expect, test } from "vitest";
import {
	buildTranscriptGroups,
	type TranscriptMessageItem,
	type TranscriptRenderItem,
} from "../src/modes/interactive/transcript-turns.ts";

function messageItem(key: string, message: AgentMessage): TranscriptMessageItem {
	return { kind: "message", key, message, parentId: null };
}

function user(key: string, text = key): TranscriptMessageItem {
	return messageItem(key, { role: "user", content: text, timestamp: 1 });
}

function assistant(key: string, text = key, toolCallId?: string): TranscriptMessageItem {
	const content: AssistantMessage["content"] = [{ type: "text", text }];
	if (toolCallId) {
		content.push({ type: "toolCall", id: toolCallId, name: "read", arguments: { path: "file" } });
	}

	return messageItem(key, {
		role: "assistant",
		content,
		api: "openai-completions",
		provider: "openai",
		model: "test-model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 1,
	});
}

function toolResult(key: string, toolCallId: string): TranscriptMessageItem {
	return messageItem(key, {
		role: "toolResult",
		toolCallId,
		toolName: "read",
		content: [{ type: "text", text: "completed" }],
		isError: false,
		timestamp: 1,
	});
}

function roleGroups(items: readonly TranscriptRenderItem[]): Array<{ role?: string; keys: string[] }> {
	return buildTranscriptGroups(items).map((group) => ({
		role: group.kind === "turn" ? group.role : undefined,
		keys: group.items.map((item) => item.key),
	}));
}

describe("transcript turn grouping", () => {
	test("creates one user group and one assistant group for a simple exchange", () => {
		expect(roleGroups([user("u1"), assistant("a1")])).toEqual([
			{ role: "user", keys: ["u1"] },
			{ role: "assistant", keys: ["a1"] },
		]);
	});

	test("keeps thinking/text/tool continuation items under one assistant header", () => {
		const items = [
			user("u1"),
			assistant("a1", "before tool", "call-1"),
			toolResult("r1", "call-1"),
			assistant("a2", "after tool"),
		];

		expect(roleGroups(items)).toEqual([
			{ role: "user", keys: ["u1"] },
			{ role: "assistant", keys: ["a1", "r1", "a2"] },
		]);
	});

	test("starts a fresh assistant group after a new user message", () => {
		expect(roleGroups([user("u1"), assistant("a1"), user("u2"), assistant("a2")])).toEqual([
			{ role: "user", keys: ["u1"] },
			{ role: "assistant", keys: ["a1"] },
			{ role: "user", keys: ["u2"] },
			{ role: "assistant", keys: ["a2"] },
		]);
	});

	test("keeps informational and extension entries outside conversation groups", () => {
		const info: TranscriptRenderItem = {
			kind: "message",
			key: "info",
			message: { role: "custom", customType: "notice", content: [], display: true, timestamp: 1 },
			parentId: null,
		};
		const extensionEntry: TranscriptRenderItem = {
			kind: "custom-entry",
			key: "extension",
			entry: {
				type: "custom",
				id: "extension",
				parentId: null,
				timestamp: new Date(1).toISOString(),
				customType: "notice",
			},
		};

		expect(roleGroups([user("u1"), info, extensionEntry, assistant("a1")])).toEqual([
			{ role: "user", keys: ["u1"] },
			{ role: undefined, keys: ["info", "extension"] },
			{ role: "assistant", keys: ["a1"] },
		]);
	});

	test("renders malformed sequences in order with a nearest valid assistant group", () => {
		expect(roleGroups([toolResult("orphan", "missing"), assistant("a1"), user("u1")])).toEqual([
			{ role: "assistant", keys: ["orphan", "a1"] },
			{ role: "user", keys: ["u1"] },
		]);
	});
});
