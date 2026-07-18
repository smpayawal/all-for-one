import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

function read(relativePath: string): string {
	return readFileSync(resolve(__dirname, relativePath), "utf8");
}

describe("validated compaction boundary", () => {
	test("keeps validation and repair policy out of AgentSession", () => {
		const session = read("../src/core/agent-session.ts");

		expect(session).toContain("compactWithValidationAndRepair,");
		expect(session).toContain("await compactWithValidationAndRepair(");
		expect(session).not.toContain("REPAIRABLE_COMPACTION_ISSUES");
		expect(session).not.toContain("The previous native compaction summary failed deterministic structural validation.");
	});

	test("owns the bounded repair policy inside the compaction package", () => {
		const policy = read("../src/core/compaction/validated-compaction.ts");
		const index = read("../src/core/compaction/index.ts");

		expect(policy).toContain("export async function compactWithValidationAndRepair(");
		expect(policy).toContain("const REPAIRABLE_COMPACTION_ISSUES");
		expect(policy).toContain("telemetry?.recordRepairAttempt()");
		expect(policy).toContain("telemetry?.recordRepairSuccess()");
		expect(policy).toContain("telemetry?.recordRepairFailure()");
		expect(index).toContain('export * from "./validated-compaction.ts";');
	});
});
