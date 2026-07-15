import { describe, expect, it } from "vitest";
import { runPhase4Doctor } from "../../../scripts/phase4-doctor.ts";

describe("Phase 4 doctor", () => {
	it("passes deterministic structural checks", async () => {
		const report = await runPhase4Doctor({ cwd: process.cwd(), agentDir: "/tmp/pi-phase4-doctor-test-agent" });

		expect(report.passed).toBe(true);
		expect(report.checks.every((check) => check.status !== "fail")).toBe(true);
		expect(report.checks.map((check) => check.name)).toEqual([
			"tool registry integrity",
			"default capability exposure",
			"skill metadata budget enforcement",
			"unsupported budget fallback",
			"skill metadata diagnostics",
			"baseline comparison",
			"context hash deduplication",
			"oversized context warning",
			"memory location and secret scan",
			"structured handoff contract",
			"path-scoped context",
		]);
	});
});
