import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	analyzeSessionContent,
	analyzeSessionFile,
	formatSessionEfficiencyReport,
	runSessionEfficiencyCli,
} from "./session-efficiency-report.ts";

function line(value: unknown): string {
	return JSON.stringify(value);
}

test("analyzes recorded session evidence without returning content", () => {
	const content = [
		line({ type: "session", version: 3, id: "session", timestamp: "2026-07-18T00:00:00.000Z", cwd: "/private/work" }),
		line({ type: "thinking_level_change", id: "thinking", parentId: null, timestamp: "2026-07-18T00:00:01.000Z", thinkingLevel: "medium" }),
		line({ type: "model_change", id: "model", parentId: "thinking", timestamp: "2026-07-18T00:00:02.000Z", provider: "openai", modelId: "gpt-test" }),
		line({
			type: "message",
			id: "assistant-1",
			parentId: "model",
			timestamp: "2026-07-18T00:00:03.000Z",
			message: {
				role: "assistant",
				provider: "openai",
				model: "gpt-test",
				usage: { input: 100, output: 25, cacheRead: 10, cacheWrite: 5, totalTokens: 140 },
				content: [
					{ type: "toolCall", id: "read-1", name: "read", arguments: { path: "src/index.ts" } },
					{ type: "toolCall", id: "read-2", name: "read", arguments: { path: "src/index.ts" } },
					{ type: "toolCall", id: "edit-1", name: "edit", arguments: { path: "src/index.ts", oldText: "secret", newText: "private" } },
					{ type: "toolCall", id: "bash-1", name: "bash", arguments: { command: "npm test" } },
				],
			},
		}),
		line({
			type: "message",
			id: "result-1",
			parentId: "assistant-1",
			timestamp: "2026-07-18T00:00:04.000Z",
			message: {
				role: "toolResult",
				toolCallId: "read-1",
				toolName: "read",
				isError: false,
				content: [{ type: "text", text: "private source content" }],
				details: {
					truncation: { truncated: true, truncatedBy: "lines" },
					fullOutputPath: "/private/work/.pi/full-output/read-1.txt",
				},
			},
		}),
		line({
			type: "message",
			id: "result-2",
			parentId: "result-1",
			timestamp: "2026-07-18T00:00:05.000Z",
			message: {
				role: "toolResult",
				toolCallId: "bash-1",
				toolName: "bash",
				isError: true,
				content: [{ type: "text", text: "command timed out and was cancelled" }],
				details: { termination: "timeout" },
			},
		}),
		line({ type: "compaction", id: "compact", parentId: "result-2", timestamp: "2026-07-18T00:00:06.000Z", summary: "private summary", firstKeptEntryId: "assistant-1", tokensBefore: 1000 }),
		"not-json",
	].join("\n");

	const report = analyzeSessionContent(content);
	assert.equal(report.schemaVersion, 2);
	assert.equal(report.session.version, 3);
	assert.deepEqual(report.session.model, { provider: "openai", modelId: "gpt-test" });
	assert.equal(report.session.thinkingLevel, "medium");
	assert.equal(report.session.durationMs, 6000);
	assert.equal(report.usage.totalTokens, 140);
	assert.equal(report.activity.assistantTurns, 1);
	assert.equal(report.activity.toolCalls, 4);
	assert.equal(report.activity.toolSuccesses, 1);
	assert.equal(report.activity.toolFailures, 1);
	assert.equal(report.activity.uniqueFilesRead, 1);
	assert.equal(report.activity.repeatedReads, 1);
	assert.equal(report.activity.filesReadBeforeFirstMutation, 1);
	assert.equal(report.activity.mutationCalls, 1);
	assert.equal(report.activity.validationCalls, 1);
	assert.equal(report.activity.truncations, 1);
	assert.equal(report.activity.fullOutputAvailable, 1);
	assert.equal(report.activity.compactions, 1);
	assert.equal(report.activity.cancellations, 0);
	assert.equal(report.activity.timeouts, 1);
	assert.equal(report.heuristics.cancellationTextMentions, 1);
	assert.equal(report.heuristics.timeoutTextMentions, 1);
	assert.equal(report.quality.malformedLines, 1);
	assert.equal(report.tools?.read.calls, 2);
	assert.equal(report.tools?.read.successes, 1);
	assert.equal(report.tools?.bash.failures, 1);

	const serialized = JSON.stringify(report);
	assert.doesNotMatch(serialized, /private source content|private summary|secret/u);
	assert.doesNotMatch(formatSessionEfficiencyReport(report), /private source content|src\/index/u);
});

test("handles partial sessions and derives total tokens", () => {
	const report = analyzeSessionContent(
		line({
			type: "message",
			id: "assistant",
			parentId: null,
			timestamp: "invalid",
			message: { role: "assistant", usage: { inputTokens: 12, outputTokens: 8 }, content: [] },
		}),
		{ includeToolBreakdown: false },
	);
	assert.equal(report.usage.totalTokens, 20);
	assert.equal(report.session.durationMs, null);
	assert.equal(report.tools, undefined);
});


test("streams session files across chunk boundaries", () => {
	const directory = mkdtempSync(join(tmpdir(), "afo-session-stream-"));
	try {
		const path = join(directory, "large-session.jsonl");
		const content = [
			line({
				type: "session",
				version: 3,
				id: "session",
				timestamp: "2026-07-18T00:00:00.000Z",
				padding: "x".repeat(128 * 1_024),
			}),
			line({
				type: "model_change",
				id: "model",
				timestamp: "2026-07-18T00:00:01.000Z",
				provider: "openai",
				modelId: "gpt-stream",
			}),
		].join("\r\n");
		writeFileSync(path, content);
		assert.deepEqual(analyzeSessionFile(path), analyzeSessionContent(content));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("CLI returns safe status codes for help, missing paths, and valid files", () => {
	assert.equal(runSessionEfficiencyCli(["--help"]), 0);
	assert.equal(runSessionEfficiencyCli([]), 2);
	const directory = mkdtempSync(join(tmpdir(), "afo-session-report-"));
	try {
		const path = join(directory, "session.jsonl");
		writeFileSync(path, `${line({ type: "session", version: 3, id: "session", timestamp: "2026-07-18T00:00:00.000Z", cwd: directory })}\n`);
		assert.equal(runSessionEfficiencyCli([path, "--json"]), 0);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
