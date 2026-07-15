import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	collectPhase5EvaluationRunFromSession,
	comparePhase5EvaluationRuns,
	type Phase5EvaluationRun,
	type Phase5SessionRunMetadata,
	parsePhase5EvaluationInput,
} from "../../../scripts/phase5-evaluation.ts";

function createRun(overrides: Partial<Phase5EvaluationRun> = {}): Phase5EvaluationRun {
	return {
		workloadId: "small-bug-fix",
		providerModel: "provider/model",
		contextWindow: 128_000,
		taskInputHash: "task-hash",
		initialContextHash: "context-hash",
		runtimeConfigHash: "config-hash",
		metrics: {
			outcome: "pass",
			tokensBefore: [100, 200],
			tokensAfter: [40, 80],
			summaryTokens: 30,
			compactionLatencyMs: 300,
			compactionCost: 0.001,
			criticalConstraintFailures: 0,
			staleDecisionCount: 0,
			rediscoveryCount: 1,
			turns: 4,
			toolCalls: 8,
			promptTokens: 12_000,
			cumulativeTokens: 18_000,
			compactionCount: 1,
			truncationCount: 0,
			followUpRetrievals: 0,
			repeatedReads: 0,
			latencyMs: 10_000,
			estimatedCost: 0.02,
			cacheReadTokens: 2_000,
			cacheWriteTokens: 500,
			evidenceReferencesResolved: 0,
			evidenceReferencesMissing: 0,
		},
		...overrides,
	};
}

function createAssistantEntry(
	timestamp: string,
	input: number,
	totalTokens: number,
	content: unknown[] = [{ type: "text", text: "ok" }],
): Record<string, unknown> {
	return {
		type: "message",
		timestamp,
		message: {
			role: "assistant",
			provider: "provider",
			model: "model",
			content,
			usage: {
				input,
				output: totalTokens - input,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens,
				cost: { input: 0.01, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.02 },
			},
		},
	};
}

describe("Phase 5 live-evaluation report", () => {
	it("rejects a run input with the wrong variant", () => {
		expect(() =>
			parsePhase5EvaluationInput({
				schemaVersion: 1,
				phase: "P5-live-evaluation",
				variant: "phase4",
				runs: [createRun()],
			}),
		).toThrow("variant must be baseline or phase5");
	});

	it("rejects a non-positive context window", () => {
		expect(() =>
			parsePhase5EvaluationInput({
				schemaVersion: 1,
				phase: "P5-live-evaluation",
				variant: "baseline",
				runs: [createRun({ contextWindow: 0 })],
			}),
		).toThrow("contextWindow must be a positive integer");
	});

	it("blocks a paired evaluation when Phase 5 regresses correctness", () => {
		const baseline = createRun();
		const phase5 = createRun({ metrics: { ...baseline.metrics, outcome: "fail" } });

		const report = comparePhase5EvaluationRuns([baseline], [phase5]);

		expect(report.decision).toBe("blocked");
		expect(report.pairs[0]?.status).toBe("blocked");
		expect(report.pairs[0]?.correctnessRegression).toBe(true);
	});

	it("marks a pair inconclusive when the outcome cannot establish correctness", () => {
		const baseline = createRun({ metrics: { ...createRun().metrics, outcome: "unknown" } });
		const phase5 = createRun({ metrics: { ...baseline.metrics, outcome: "unknown" } });

		const report = comparePhase5EvaluationRuns([baseline], [phase5]);

		expect(report.decision).toBe("inconclusive");
		expect(report.pairs[0]?.status).toBe("inconclusive");
		expect(report.pairs[0]?.deltas.turns).toBe(0);
	});

	it("does not pass a pair with unresolved measurement limitations", () => {
		const baseline = createRun({ limitations: ["correctness annotation missing"] });
		const phase5 = createRun({ limitations: ["correctness annotation missing"] });

		const report = comparePhase5EvaluationRuns([baseline], [phase5]);

		expect(report.decision).toBe("inconclusive");
		expect(report.pairs[0]?.status).toBe("inconclusive");
	});

	it("reports efficiency deltas without turning them into a quality claim", () => {
		const baseline = createRun();
		const phase5 = createRun({
			metrics: {
				...baseline.metrics,
				turns: 3,
				promptTokens: 10_000,
				cumulativeTokens: 15_000,
			},
		});

		const report = comparePhase5EvaluationRuns([baseline], [phase5]);

		expect(report.decision).toBe("pass");
		expect(report.efficiencyClaim).toBe("not-established");
		expect(report.pairs[0]?.deltas).toMatchObject({ turns: -1, promptTokens: -2_000 });
	});

	it("reports compaction token, latency, and cost deltas", () => {
		const baseline = createRun();
		const phase5 = createRun({
			metrics: {
				...baseline.metrics,
				tokensBefore: [100, 180],
				tokensAfter: [30, 70],
				summaryTokens: 20,
				compactionLatencyMs: 250,
				compactionCost: 0.002,
			},
		});

		const report = comparePhase5EvaluationRuns([baseline], [phase5]);

		expect(report.pairs[0]?.deltas).toMatchObject({
			lastTokensBefore: -20,
			lastTokensAfter: -10,
			summaryTokens: -10,
			compactionLatencyMs: -50,
			compactionCost: 0.001,
		});
	});

	it("rejects pairs that do not use the same model and task context", () => {
		const baseline = createRun();
		const phase5 = createRun({ providerModel: "provider/other-model" });

		expect(() => comparePhase5EvaluationRuns([baseline], [phase5])).toThrow(
			"provider/model differs between baseline and phase5",
		);
	});

	it("rejects pairs that do not use the same initial context", () => {
		const baseline = createRun();
		const phase5 = createRun({ initialContextHash: "different-context-hash" });

		expect(() => comparePhase5EvaluationRuns([baseline], [phase5])).toThrow(
			"initialContextHash differs between baseline and phase5",
		);
	});

	it("derives measurable session fields without fabricating correctness or compaction cost", () => {
		const entries: unknown[] = [
			{ type: "session", cwd: "/tmp/phase5-session", timestamp: "2026-07-15T00:00:00.000Z" },
			{
				type: "message",
				timestamp: "2026-07-15T00:00:00.000Z",
				message: { role: "user", content: "Preserve the exact constraint." },
			},
			createAssistantEntry("2026-07-15T00:00:01.000Z", 500, 520),
			{
				type: "compaction",
				timestamp: "2026-07-15T00:00:02.000Z",
				tokensBefore: 500,
				summary: "## Goal\n- Preserve the exact constraint.",
				details: { readFiles: [], modifiedFiles: [] },
			},
			createAssistantEntry("2026-07-15T00:00:03.000Z", 80, 100, [
				{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "src/example.ts" } },
			]),
		];
		const metadata: Phase5SessionRunMetadata = {
			workloadId: "long-session",
			contextWindow: 128_000,
			taskInputHash: "task-hash",
			initialContextHash: "context-hash",
			runtimeConfigHash: "config-hash",
		};

		const run = collectPhase5EvaluationRunFromSession(entries, metadata);

		expect(run.providerModel).toBe("provider/model");
		expect(run.metrics.tokensBefore).toEqual([500]);
		expect(run.metrics.tokensAfter).toEqual([80]);
		expect(run.metrics.summaryTokens).toBeGreaterThan(0);
		expect(run.metrics.turns).toBe(2);
		expect(run.metrics.toolCalls).toBe(1);
		expect(run.metrics.promptTokens).toBe(500);
		expect(run.metrics.cumulativeTokens).toBe(620);
		expect(run.metrics.compactionLatencyMs).toBeNull();
		expect(run.metrics.compactionCost).toBeNull();
		expect(run.metrics.outcome).toBe("unknown");
		expect(run.limitations).toEqual(expect.arrayContaining([expect.stringContaining("Correctness")]));
	});

	it("rejects invalid session correctness annotations", () => {
		expect(() =>
			collectPhase5EvaluationRunFromSession([], {
				workloadId: "annotated-session",
				providerModel: "provider/model",
				contextWindow: 128_000,
				taskInputHash: "task-hash",
				initialContextHash: "context-hash",
				runtimeConfigHash: "config-hash",
				annotations: { outcome: "invalid" as never },
			}),
		).toThrow("annotations.outcome");
	});

	it("documents the session-recording CLI mode", () => {
		const repoRoot = resolve(process.cwd(), "../..");
		const output = execFileSync(
			resolve(repoRoot, "node_modules/.bin/tsx"),
			[
				"--tsconfig",
				resolve(repoRoot, "tsconfig.json"),
				resolve(repoRoot, "scripts/phase5-evaluation.ts"),
				"--help",
			],
			{ cwd: repoRoot, encoding: "utf8" },
		);

		expect(output).toContain("--session PATH");
		expect(output).toContain("--workload-id ID");
		expect(output).toContain("--annotations PATH");
	});

	it("passes JSON annotations through the session-recording CLI", () => {
		const root = mkdtempSync(join(tmpdir(), "pi-phase5-evaluation-"));
		try {
			const sessionPath = join(root, "session.jsonl");
			const annotationsPath = join(root, "annotations.json");
			writeFileSync(sessionPath, `${JSON.stringify({ type: "session", cwd: root })}\n`);
			writeFileSync(
				annotationsPath,
				JSON.stringify({ outcome: "pass", criticalConstraintFailures: 0, rediscoveryCount: 2 }),
			);

			const repoRoot = resolve(process.cwd(), "../..");
			const output = execFileSync(
				resolve(repoRoot, "node_modules/.bin/tsx"),
				[
					"--tsconfig",
					resolve(repoRoot, "tsconfig.json"),
					resolve(repoRoot, "scripts/phase5-evaluation.ts"),
					"--session",
					sessionPath,
					"--variant",
					"baseline",
					"--workload-id",
					"annotated-session",
					"--context-window",
					"128000",
					"--task-input-hash",
					"task-hash",
					"--initial-context-hash",
					"context-hash",
					"--runtime-config-hash",
					"config-hash",
					"--provider-model",
					"provider/model",
					"--annotations",
					annotationsPath,
					"--json",
				],
				{ cwd: repoRoot, encoding: "utf8" },
			);

			expect(output).toContain('"outcome": "pass"');
			expect(output).toContain('"rediscoveryCount": 2');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
