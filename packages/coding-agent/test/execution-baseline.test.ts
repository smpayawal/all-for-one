import { describe, expect, it } from "vitest";
import {
	collectExecutionBaseline,
	EXECUTION_SCENARIO_IDS,
	type ExecutionBaselineReport,
} from "../../../scripts/execution-baseline.ts";

describe("Execution deterministic baseline", () => {
	it("emits the required offline scenarios and schema", () => {
		const report: ExecutionBaselineReport = collectExecutionBaseline({ cwd: process.cwd() });

		expect(report.schemaVersion).toBe(1);
		expect(report.phase).toBe("execution");
		expect(report.environment.resourceLoading).toBe("offline-deterministic-fixture");
		expect(report.environment.productionPolicyChanged).toBe(false);
		expect(report.settings).toEqual({ mode: "enforce", maxContinuationAttempts: 1 });
		expect(report.scenarios.map((scenario) => scenario.id)).toEqual([...EXECUTION_SCENARIO_IDS]);
	});

	it("records the completion policy scenarios", () => {
		const report = collectExecutionBaseline({ cwd: process.cwd() });
		const scenarios = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));

		expect(scenarios.get("read-only-completion")).toMatchObject({
			decision: { action: "allow", reason: "no-known-mutation" },
			mutationCount: 0,
		});
		expect(scenarios.get("mutation-without-validation")).toMatchObject({
			decision: { action: "continue", reason: "validation-missing" },
			mutationCount: 1,
		});
		expect(scenarios.get("mutation-then-pass")).toMatchObject({
			decision: { action: "allow", reason: "fresh-validation-passed" },
			freshPassingValidationCount: 1,
		});
		expect(scenarios.get("pass-then-mutation")).toMatchObject({
			decision: { action: "continue", reason: "validation-stale" },
			staleValidationCount: 1,
		});
		expect(scenarios.get("mutation-then-failure")).toMatchObject({
			decision: { action: "continue", reason: "validation-failed" },
			freshFailingValidationCount: 1,
		});
		expect(scenarios.get("parallel-mutation-validation")).toMatchObject({
			decision: { action: "continue", reason: "validation-concurrent-with-mutation" },
			concurrentValidationCount: 1,
		});
		expect(scenarios.get("unknown-project")).toMatchObject({
			decision: { action: "observe", reason: "no-validation-command" },
			mutationCount: 1,
		});
		expect(scenarios.get("compound-command")).toMatchObject({
			decision: { action: "continue", reason: "validation-missing" },
			recordedValidationCount: 0,
		});
		expect(scenarios.get("bounded-continuation")).toMatchObject({
			firstDecision: { action: "continue" },
			decision: { action: "allow", reason: "continuation-limit-reached" },
			continuationAttempts: 1,
		});
	});

	it("reports bounded paths and validation records", () => {
		const report = collectExecutionBaseline({ cwd: process.cwd() });
		const scenario = report.scenarios.find((item) => item.id === "bounded-records");

		expect(scenario).toBeDefined();
		expect(scenario).toMatchObject({
			modifiedPathCount: 128,
			recordedValidationCount: 16,
		});
		expect(scenario?.limitations.join(" ")).toContain("bound");
	});
});
