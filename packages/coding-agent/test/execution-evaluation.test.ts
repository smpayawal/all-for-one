import { describe, expect, it } from "vitest";
import {
	compareExecutionEvaluationRuns,
	type ExecutionEvaluationMetrics,
	type ExecutionEvaluationRun,
	parseExecutionEvaluationInput,
} from "../../../scripts/execution-evaluation.ts";

function metrics(overrides: Partial<ExecutionEvaluationMetrics> = {}): ExecutionEvaluationMetrics {
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

function run(
	variant: "baseline" | "execution",
	overrides: Partial<ExecutionEvaluationRun> = {},
): ExecutionEvaluationRun {
	return {
		workloadId: "workload-1",
		trialId: "trial-1",
		providerModel: "faux/execution",
		contextWindow: 128_000,
		taskInputHash: "task-hash",
		initialContextHash: "context-hash",
		controlledConfigHash: "controlled-hash",
		variant,
		treatmentConfig: { executionIntegrity: { mode: variant === "execution" ? "enforce" : "off" } },
		metrics: metrics(),
		...overrides,
	};
}

describe("Execution paired evaluator", () => {
	it("pairs runs while keeping treatment settings separate", () => {
		const baseline = run("baseline");
		const execution = run("execution", {
			treatmentConfig: { executionIntegrity: { mode: "enforce", maxContinuationAttempts: 1 } },
		});
		const report = compareExecutionEvaluationRuns([baseline], [execution]);

		expect(report.decision).toBe("pass");
		expect(report.efficiencyClaim).toBe("not-established");
		expect(report.pairs[0]?.execution.treatmentConfig).toEqual({
			executionIntegrity: { mode: "enforce", maxContinuationAttempts: 1 },
		});
	});

	it("blocks correctness and unsupported-success regressions", () => {
		const baseline = run("baseline", { metrics: metrics({ prematureCompletionCount: 1 }) });
		const execution = run("execution", {
			metrics: metrics({ outcome: "fail", prematureCompletionCount: 2, unsupportedSuccessClaimCount: 1 }),
		});
		const report = compareExecutionEvaluationRuns([baseline], [execution]);

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
		const execution = run("execution", {
			metrics: metrics({
				prematureCompletionCount: null,
				unsupportedSuccessClaimCount: null,
				falseCompletionBlockCount: 2,
			}),
		});
		const report = compareExecutionEvaluationRuns([baseline], [execution]);

		expect(report.decision).toBe("inconclusive");
		expect(report.pairs[0]?.falseCompletionBlockCount).toBe(2);
		expect(report.pairs[0]?.limitations.join(" ")).toContain("annotation");
	});

	it("requires paired workload context to match", () => {
		const baseline = run("baseline");
		const execution = run("execution", { contextWindow: 64_000 });

		expect(() => compareExecutionEvaluationRuns([baseline], [execution])).toThrow(/contextWindow differs/);
	});

	it("validates the recorded input schema", () => {
		const valid = {
			schemaVersion: 2,
			evaluationType: "execution-integrity",
			variant: "baseline",
			runs: [run("baseline")],
		};
		const parsed = parseExecutionEvaluationInput(valid);

		expect(parsed.runs).toHaveLength(1);
		expect(() => parseExecutionEvaluationInput({ ...valid, variant: "invalid" })).toThrow(/variant/);
		expect(() => parseExecutionEvaluationInput({ ...valid, runs: [run("baseline"), run("baseline")] })).toThrow(
			/duplicate workload\/trial/,
		);
	});

	it("requires the parent variant, approved treatment mode, and trial identity", () => {
		const valid = {
			schemaVersion: 2,
			evaluationType: "execution-integrity",
			variant: "baseline",
			runs: [run("baseline")],
		};

		expect(() => parseExecutionEvaluationInput({ ...valid, runs: [run("execution")] })).toThrow(
			/variant must match input variant/,
		);
		expect(() =>
			parseExecutionEvaluationInput({ ...valid, runs: [run("baseline", { treatmentConfig: undefined })] }),
		).toThrow(/treatmentConfig is required/);
		expect(() =>
			parseExecutionEvaluationInput({
				...valid,
				runs: [run("baseline", { treatmentConfig: { executionIntegrity: { mode: "enforce" } } })],
			}),
		).toThrow(/baseline treatment must set executionIntegrity.mode to off/);
		expect(() =>
			parseExecutionEvaluationInput({
				...valid,
				runs: [run("baseline", { treatmentConfig: { executionIntegrity: { mode: "off" }, extra: true } as never })],
			}),
		).toThrow(/only approved/);
		expect(() => parseExecutionEvaluationInput({ ...valid, runs: [run("baseline", { trialId: "" })] })).toThrow(
			/trialId/,
		);
	});

	it("migrates the legacy phase-tagged schema to the capability field", () => {
		const parsed = parseExecutionEvaluationInput({
			schemaVersion: 1,
			phase: "execution-live-evaluation",
			variant: "baseline",
			runs: [run("baseline")],
		});

		expect(parsed.schemaVersion).toBe(2);
		expect(parsed.evaluationType).toBe("execution-integrity");
	});

	it("allows repeated workloads when trial identities differ and pairs each trial", () => {
		const baselineTrialOne = run("baseline", { trialId: "trial-1" });
		const baselineTrialTwo = run("baseline", { trialId: "trial-2" });
		const executionTrialOne = run("execution", { trialId: "trial-1" });
		const executionTrialTwo = run("execution", { trialId: "trial-2" });
		const report = compareExecutionEvaluationRuns(
			[baselineTrialOne, baselineTrialTwo],
			[executionTrialOne, executionTrialTwo],
		);

		expect(report.pairs.map((pair) => `${pair.workloadId}:${pair.trialId}`)).toEqual([
			"workload-1:trial-1",
			"workload-1:trial-2",
		]);
	});
});
