import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPhase4Doctor } from "../../../scripts/phase4-doctor.ts";

describe("Phase 4 doctor", () => {
	it("passes deterministic structural checks", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "pi-phase4-doctor-test-"));
		try {
			const report = await runPhase4Doctor({ cwd: process.cwd(), agentDir });

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
		} finally {
			rmSync(agentDir, { recursive: true, force: true });
		}
	});
});
