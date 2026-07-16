import { describe, expect, it } from "vitest";
import {
	comparePhase6EvaluationRuns,
	type Phase6EvaluationMetrics,
	type Phase6EvaluationRun,
	parsePhase6EvaluationInput,
} from "../../../scripts/phase6-evaluation.ts";

function metrics(overrides: Partial<Phase6EvaluationMetrics> = {}): Phase6EvaluationMetrics {
	return {
		outcome: "pass",
		prematureCompletionCount: 0,
		unsupportedSuccessClaimCount: 0,
		userCorrectionTurns: 0,
		relevantValidationCount: 1,
		unnecessaryValidationCount: 0,
		staleValidationCount: 0,
		failedValidationCount: 0,
		completionContinuationCount: 0,
		falseCompletionBlockCount: 0,
		turns: 3,
		toolCalls: 2,
		peakPromptTokens: 100,
		cumulativeTokens: 220,
		wallClockSessionSpanMs: 500,
		estimatedCost: null,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		...overrides,
	};
}

function run(variant: "baseline" | "phase6", overrides: Partial<Phase6EvaluationRun> = {}): Phase6EvaluationRun {
	return {
		workloadId: "workload-1",
		providerModel: "faux/phase6",
		contextWindow: 128_000,
		taskInputHash: "task-hash",
		initialContextHash: "context-hash",
		controlledConfigHash: "controlled-hash",
		variant,
		treatmentConfig: variant === "phase6" ? { executionIntegrity: "enforce" } : undefined,
		metrics: metrics(),
		...overrides,
	};
}

describe("Phase 6 paired evaluator", () => {
	it("pairs runs while keeping treatment settings separate", () => {
		const baseline = run("baseline");
		const phase6 = run("phase6", { treatmentConfig: { executionIntegrity: "enforce", maxContinuationAttempts: 1 } });
		const report = comparePhase6EvaluationRuns([baseline], [phase6]);

		expect(report.decision).toBe("pass");
		expect(report.efficiencyClaim).toBe("not-established");
		expect(report.pairs[0]?.phase6.treatmentConfig).toEqual({
			executionIntegrity: "enforce",
			maxContinuationAttempts: 1,
		});
	});

	it("blocks correctness and unsupported-success regressions", () => {
		const baseline = run("baseline", { metrics: metrics({ prematureCompletionCount: 1 }) });
		const phase6 = run("phase6", {
			metrics: metrics({ outcome: "fail", prematureCompletionCount: 2, unsupportedSuccessClaimCount: 1 }),
		});
		const report = comparePhase6EvaluationRuns([baseline], [phase6]);

		expect(report.decision).toBe("blocked");
		expect(report.pairs[0]).toMatchObject({
			correctnessRegression: true,
			prematureCompletionRegression: true,
			unsupportedSuccessClaimRegression: true,
			status: "blocked",
		});
	});

	it("keeps unknown annotations inconclusive and reports false blocks", () => {
		const baseline = run("baseline", {
			metrics: metrics({ outcome: "unknown", prematureCompletionCount: null, unsupportedSuccessClaimCount: null }),
		});
		const phase6 = run("phase6", {
			metrics: metrics({
				prematureCompletionCount: null,
				unsupportedSuccessClaimCount: null,
				falseCompletionBlockCount: 2,
			}),
		});
		const report = comparePhase6EvaluationRuns([baseline], [phase6]);

		expect(report.decision).toBe("inconclusive");
		expect(report.pairs[0]?.falseCompletionBlockCount).toBe(2);
		expect(report.pairs[0]?.limitations.join(" ")).toContain("annotation");
	});

	it("requires paired workload context to match", () => {
		const baseline = run("baseline");
		const phase6 = run("phase6", { contextWindow: 64_000 });

		expect(() => comparePhase6EvaluationRuns([baseline], [phase6])).toThrow(/contextWindow differs/);
	});

	it("validates the recorded input schema", () => {
		const valid = {
			schemaVersion: 1,
			phase: "P6-live-evaluation",
			variant: "baseline",
			runs: [run("baseline")],
		};
		const parsed = parsePhase6EvaluationInput(valid);

		expect(parsed.runs).toHaveLength(1);
		expect(() => parsePhase6EvaluationInput({ ...valid, variant: "phase5" })).toThrow(/variant/);
		expect(() => parsePhase6EvaluationInput({ ...valid, runs: [run("baseline"), run("baseline")] })).toThrow(
			/duplicate workloadId/,
		);
	});
});
