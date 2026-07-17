import { describe, expect, it } from "vitest";
import { ALLFORONE_BASELINE_TASK_CATEGORIES } from "../../../scripts/allforone-baseline.ts";
import { CONTEXT_SCENARIO_IDS, collectContextBaseline } from "../../../scripts/context-baseline.ts";

describe("Context context-integrity baseline", () => {
	it("exposes the six approved deterministic scenarios", () => {
		const report = collectContextBaseline({ cwd: process.cwd() });

		expect(CONTEXT_SCENARIO_IDS).toEqual([
			"constraint-survival",
			"superseded-decision",
			"repeated-compaction",
			"split-turn",
			"large-evidence",
			"interrupted-continuation",
		]);
		expect(report.schemaVersion).toBe(2);
		expect(report.capability).toBe("context-integrity");
		expect(report.environment.resourceLoading).toBe("offline-read-only");
		expect(report.environment.productionPolicyChanged).toBe(false);
		expect(report.scenarios.map((scenario) => scenario.id)).toEqual(CONTEXT_SCENARIO_IDS);
	});

	it("measures compaction boundaries and keeps constraint content in the summarized fixture", () => {
		const scenario = collectContextBaseline({ cwd: process.cwd() }).scenarios.find(
			(item) => item.id === "constraint-survival",
		);

		expect(scenario).toBeDefined();
		expect(scenario?.compactionCount).toBe(1);
		expect(scenario?.tokensBefore[0]).toBeGreaterThan(scenario?.tokensAfter[0] ?? Number.MAX_SAFE_INTEGER);
		expect(scenario?.criticalMarkers).toContainEqual(
			expect.objectContaining({
				marker: "constraint:context",
				disposition: "summarized",
			}),
		);
	});

	it("reuses the All-For-One live-workload taxonomy", () => {
		const report = collectContextBaseline({ cwd: process.cwd() });

		expect(report.evaluationPlan.map((category) => category.id)).toEqual(
			ALLFORONE_BASELINE_TASK_CATEGORIES.map((category) => category.id),
		);
		expect(report.evaluationPlan).toEqual(ALLFORONE_BASELINE_TASK_CATEGORIES);
	});

	it("records correction supersession as old state summarized and new state recent-exact", () => {
		const scenario = collectContextBaseline({ cwd: process.cwd() }).scenarios.find(
			(item) => item.id === "superseded-decision",
		);

		expect(scenario?.criticalMarkers).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ marker: "decision:A", disposition: "summarized" }),
				expect.objectContaining({ marker: "decision:B", disposition: "recent-exact" }),
			]),
		);
		expect(scenario?.supersessionObserved).toBe(true);
	});

	it("records three repeated compactions and prior-summary use", () => {
		const scenario = collectContextBaseline({ cwd: process.cwd() }).scenarios.find(
			(item) => item.id === "repeated-compaction",
		);

		expect(scenario?.compactionCount).toBe(3);
		expect(scenario?.tokensBefore).toHaveLength(3);
		expect(scenario?.tokensAfter).toHaveLength(3);
		expect(scenario?.previousSummaryUsed).toBe(true);
		expect(scenario?.criticalMarkers).toContainEqual(
			expect.objectContaining({ marker: "repeat:checkpoint-3", disposition: "recent-exact" }),
		);
	});

	it("records split-turn handling without changing the native cut-point algorithm", () => {
		const scenario = collectContextBaseline({ cwd: process.cwd() }).scenarios.find(
			(item) => item.id === "split-turn",
		);

		expect(scenario?.splitTurnObserved).toBe(true);
		expect(scenario?.compactionCount).toBe(1);
	});

	it("measures large evidence truncation and telemetry follow-up retrieval", () => {
		const scenario = collectContextBaseline({ cwd: process.cwd() }).scenarios.find(
			(item) => item.id === "large-evidence",
		);

		expect(scenario?.rawEvidenceChars).toBeGreaterThan(scenario?.serializedEvidenceChars ?? 0);
		expect(scenario?.evidenceTailMarkerRetained).toBe(false);
		expect(scenario?.truncationCount).toBe(1);
		expect(scenario?.followUpRetrievals).toBe(1);
		expect(scenario?.repeatedReads).toBe(1);
	});

	it("records interrupted continuation with the resumed request in the exact suffix", () => {
		const scenario = collectContextBaseline({ cwd: process.cwd() }).scenarios.find(
			(item) => item.id === "interrupted-continuation",
		);

		expect(scenario?.interruptedContinuationObserved).toBe(true);
		expect(scenario?.compactionCount).toBe(1);
		expect(scenario?.criticalMarkers).toContainEqual(
			expect.objectContaining({ marker: "interrupted:resume", disposition: "recent-exact" }),
		);
	});
});
