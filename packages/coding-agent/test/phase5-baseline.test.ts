import { describe, expect, it } from "vitest";
import { collectPhase5Baseline, PHASE5_SCENARIO_IDS } from "../../../scripts/phase5-baseline.ts";

describe("Phase 5.0 context-integrity baseline", () => {
	it("exposes the five approved deterministic scenarios", () => {
		const report = collectPhase5Baseline({ cwd: process.cwd() });

		expect(PHASE5_SCENARIO_IDS).toEqual([
			"constraint-survival",
			"superseded-decision",
			"repeated-compaction",
			"split-turn",
			"large-evidence",
		]);
		expect(report.schemaVersion).toBe(1);
		expect(report.phase).toBe("P5.0");
		expect(report.environment.resourceLoading).toBe("offline-read-only");
		expect(report.environment.productionPolicyChanged).toBe(false);
		expect(report.scenarios.map((scenario) => scenario.id)).toEqual(PHASE5_SCENARIO_IDS);
	});

	it("measures compaction boundaries and keeps constraint content in the summarized fixture", () => {
		const scenario = collectPhase5Baseline({ cwd: process.cwd() }).scenarios.find(
			(item) => item.id === "constraint-survival",
		);

		expect(scenario).toBeDefined();
		expect(scenario?.compactionCount).toBe(1);
		expect(scenario?.tokensBefore[0]).toBeGreaterThan(scenario?.tokensAfter[0] ?? Number.MAX_SAFE_INTEGER);
		expect(scenario?.criticalMarkers).toContainEqual(
			expect.objectContaining({
				marker: "constraint:phase5",
				disposition: "summarized",
			}),
		);
	});

	it("records correction supersession as old state summarized and new state recent-exact", () => {
		const scenario = collectPhase5Baseline({ cwd: process.cwd() }).scenarios.find(
			(item) => item.id === "superseded-decision",
		);

		expect(scenario?.criticalMarkers).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ marker: "decision:A", disposition: "summarized" }),
				expect.objectContaining({ marker: "decision:B", disposition: "recent-exact" }),
			]),
		);
	});

	it("records repeated compaction and prior-summary use", () => {
		const scenario = collectPhase5Baseline({ cwd: process.cwd() }).scenarios.find(
			(item) => item.id === "repeated-compaction",
		);

		expect(scenario?.compactionCount).toBe(2);
		expect(scenario?.tokensBefore).toHaveLength(2);
		expect(scenario?.tokensAfter).toHaveLength(2);
		expect(scenario?.previousSummaryUsed).toBe(true);
	});

	it("records split-turn handling without changing the native cut-point algorithm", () => {
		const scenario = collectPhase5Baseline({ cwd: process.cwd() }).scenarios.find((item) => item.id === "split-turn");

		expect(scenario?.splitTurnObserved).toBe(true);
		expect(scenario?.compactionCount).toBe(1);
	});

	it("measures large evidence truncation and telemetry follow-up retrieval", () => {
		const scenario = collectPhase5Baseline({ cwd: process.cwd() }).scenarios.find(
			(item) => item.id === "large-evidence",
		);

		expect(scenario?.rawEvidenceChars).toBeGreaterThan(scenario?.serializedEvidenceChars ?? 0);
		expect(scenario?.evidenceTailMarkerRetained).toBe(false);
		expect(scenario?.truncationCount).toBe(1);
		expect(scenario?.followUpRetrievals).toBe(1);
		expect(scenario?.repeatedReads).toBe(1);
	});
});
