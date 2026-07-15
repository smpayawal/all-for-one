import { describe, expect, it } from "vitest";
import { createStructuredHandoff, formatStructuredHandoff, validateStructuredHandoff } from "../src/core/handoff.ts";

describe("structured handoff", () => {
	it("keeps a partial continuation on the same task id", () => {
		const first = createStructuredHandoff(
			{
				status: "partial",
				goal: "Inspect the provider boundary",
				acceptanceCriteria: ["Identify the request path."],
				constraints: ["Do not change provider behavior."],
				summary: "The request path is isolated in the model registry.",
				remainingWork: ["Run the focused regression test."],
			},
			"2026-07-15T00:00:00.000Z",
		);
		const continued = createStructuredHandoff(
			{
				status: "complete",
				goal: first.goal,
				summary: "The focused regression test passes.",
				previousId: first.id,
				completed: ["Ran the focused regression test."],
			},
			"2026-07-15T00:01:00.000Z",
		);

		expect(continued.id).toBe(first.id);
		expect(validateStructuredHandoff(first)).toEqual([]);
		expect(formatStructuredHandoff(continued)).toContain("Handoff");
		expect(formatStructuredHandoff(first)).toContain("Acceptance: Identify the request path.");
		expect(formatStructuredHandoff(first)).toContain("Constraints: Do not change provider behavior.");
	});

	it("requires remaining work for partial results", () => {
		const handoff = createStructuredHandoff({
			status: "partial",
			goal: "Investigate the issue",
			summary: "Investigation stopped before validation.",
		});

		expect(validateStructuredHandoff(handoff)).toContain("partial handoffs must state remaining work");
		expect(() => formatStructuredHandoff(handoff)).toThrow(/Invalid structured handoff/);
	});
});
