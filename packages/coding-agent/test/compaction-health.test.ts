import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
	CompactionTelemetryStore,
	collectCompactionHealth,
	getCompactionProviderMetrics,
} from "../src/core/compaction/index.ts";
import type { SessionEntry } from "../src/core/session-manager.ts";

function createMessageEntry(id: string, parentId: string | null, message: AgentMessage): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: new Date(2026, 0, 1, 0, 0, Number(id.slice(1))).toISOString(),
		message,
	};
}

describe("compaction health", () => {
	it("reports the latest boundary, reduction, and retained evidence counts", () => {
		const entries: SessionEntry[] = [
			createMessageEntry("u1", null, { role: "user", content: "old request", timestamp: Date.now() }),
			createMessageEntry("a1", "u1", {
				role: "assistant",
				content: [{ type: "text", text: "old response" }],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "health-test-model",
				usage: {
					input: 10,
					output: 5,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 15,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: Date.now(),
			}),
			{
				type: "compaction",
				id: "c1",
				parentId: "a1",
				timestamp: new Date(2026, 0, 1, 0, 0, 3).toISOString(),
				summary: "## Goal\nKeep the task moving.",
				firstKeptEntryId: "a1",
				tokensBefore: 100,
				details: {
					readFiles: [],
					modifiedFiles: [],
					retainedUserEntryIds: ["u1", "u2"],
					evidenceRefs: [{ kind: "tool-output", label: "bash output", ref: "/tmp/output.log" }],
				},
			},
		];

		const health = collectCompactionHealth(entries, (messages) => messages.length * 10, "/tmp");

		expect(health.count).toBe(1);
		expect(health.latest).toMatchObject({
			tokensBefore: 100,
			tokensAfter: 20,
			reductionPercent: 80,
			retainedUserMessageCount: 2,
			evidenceReferenceCount: 1,
			availableEvidenceReferenceCount: 0,
			missingEvidenceReferenceCount: 1,
			nonLocalEvidenceReferenceCount: 0,
		});
		expect(health.telemetry.compactionCount).toBe(0);
	});

	it("records bounded in-memory validation, repair, duration, and token telemetry", () => {
		const telemetry = new CompactionTelemetryStore();
		telemetry.start(120);
		telemetry.recordStructuralValidationFailure();
		telemetry.recordRepairAttempt();
		telemetry.recordRepairSuccess();
		telemetry.complete({
			durationMs: 42,
			estimatedTokensAfter: 30,
			providerMetrics: { usage: { inputTokens: 10, outputTokens: 5 }, cost: 0.25 },
		});
		telemetry.start(20);
		telemetry.recordRepairAttempt();
		telemetry.recordRepairFailure();
		telemetry.fail(8);

		expect(telemetry.getSnapshot()).toMatchObject({
			compactionCount: 2,
			structuralValidationFailureCount: 1,
			repairAttemptCount: 2,
			repairSuccessCount: 1,
			repairFailureCount: 1,
			totalDurationMs: 50,
			estimatedTokensBefore: 140,
			estimatedTokensAfter: 30,
			providerUsage: { inputTokens: 10, outputTokens: 5 },
			providerCost: 0.25,
		});
		expect(telemetry.getSnapshot().limitations).toEqual([]);
	});

	it("reports missing provider measurements without inventing values", () => {
		const telemetry = new CompactionTelemetryStore();
		telemetry.start(1);
		telemetry.complete({ durationMs: 1 });
		const snapshot = telemetry.getSnapshot();

		expect(snapshot.providerUsage).toBeUndefined();
		expect(snapshot.providerCost).toBeUndefined();
		expect(snapshot.limitations.join(" ")).toMatch(/provider token usage/);
		expect(snapshot.limitations.join(" ")).toMatch(/provider cost/);
		expect(getCompactionProviderMetrics({ usage: { input: 2 }, cost: 0.1 })).toEqual({
			usage: { inputTokens: 2 },
			cost: 0.1,
		});
	});
});
