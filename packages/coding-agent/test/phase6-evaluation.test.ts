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
		trialId: "trial-1",
		providerModel: "faux/phase6",
		contextWindow: 128_000,
		taskInputHash: "task-hash",
		initialContextHash: "context-hash",
		controlledConfigHash: "controlled-hash",
		variant,
		treatmentConfig: { executionIntegrity: { mode: variant === "phase6" ? "enforce" : "off" } },
		metrics: metrics(),
		...overrides,
	};
}

describe("Phase 6 paired evaluator", () => {
	it("pairs runs while keeping treatment settings separate", () => {
		const baseline = run("baseline");
		const phase6 = run("phase6", {
			treatmentConfig: { executionIntegrity: { mode: "enforce", maxContinuationAttempts: 1 } },
		});
		const report = comparePhase6EvaluationRuns([baseline], [phase6]);

		expect(report.decision).toBe("pass");
		expect(report.efficiencyClaim).toBe("not-established");
		expect(report.pairs[0]?.phase6.treatmentConfig).toEqual({
			executionIntegrity: { mode: "enforce", maxContinuationAttempts: 1 },
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
			/duplicate workload\/trial/,
		);
	});

	it("requires the parent variant, approved treatment mode, and trial identity", () => {
		const valid = {
			schemaVersion: 1,
			phase: "P6-live-evaluation",
			variant: "baseline",
			runs: [run("baseline")],
		};

		expect(() => parsePhase6EvaluationInput({ ...valid, runs: [run("phase6")] })).toThrow(
			/variant must match input variant/,
		);
		expect(() =>
			parsePhase6EvaluationInput({ ...valid, runs: [run("baseline", { treatmentConfig: undefined })] }),
		).toThrow(/treatmentConfig is required/);
		expect(() =>
			parsePhase6EvaluationInput({
				...valid,
				runs: [run("baseline", { treatmentConfig: { executionIntegrity: { mode: "enforce" } } })],
			}),
		).toThrow(/baseline treatment must set executionIntegrity.mode to off/);
		expect(() =>
			parsePhase6EvaluationInput({
				...valid,
				runs: [run("baseline", { treatmentConfig: { executionIntegrity: { mode: "off" }, extra: true } as never })],
			}),
		).toThrow(/only approved/);
		expect(() => parsePhase6EvaluationInput({ ...valid, runs: [run("baseline", { trialId: "" })] })).toThrow(
			/trialId/,
		);
	});

	it("allows repeated workloads when trial identities differ and pairs each trial", () => {
		const baselineTrialOne = run("baseline", { trialId: "trial-1" });
		const baselineTrialTwo = run("baseline", { trialId: "trial-2" });
		const phase6TrialOne = run("phase6", { trialId: "trial-1" });
		const phase6TrialTwo = run("phase6", { trialId: "trial-2" });
		const report = comparePhase6EvaluationRuns(
			[baselineTrialOne, baselineTrialTwo],
			[phase6TrialOne, phase6TrialTwo],
		);

		expect(report.pairs.map((pair) => `${pair.workloadId}:${pair.trialId}`)).toEqual([
			"workload-1:trial-1",
			"workload-1:trial-2",
		]);
	});
});
