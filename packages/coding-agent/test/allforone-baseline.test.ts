import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	ALLFORONE_BASELINE_TASK_CATEGORIES,
	collectAllForOneBaseline,
	createSyntheticSkillCollection,
	measureSkillCollection,
} from "../../../scripts/allforone-baseline.ts";

describe("All-For-One baseline measurements", () => {
	it("reports empty metadata without applying a budget", () => {
		const result = measureSkillCollection([], [16_384, 8_192, 16_384]);

		expect(result.skillCount).toBe(0);
		expect(result.metadataChars).toBe(0);
		expect(result.omittedSkills).toEqual([]);
		expect(result.budgetApplied).toBe(false);
		expect(result.referenceBudgets.map((budget) => budget.contextWindow)).toEqual([8_192, 16_384]);
	});

	it("defines representative workload categories without executing model tasks", () => {
		expect(ALLFORONE_BASELINE_TASK_CATEGORIES.map((task) => task.id)).toEqual([
			"small-bug-fix",
			"multi-file-feature",
			"refactor",
			"test-failure",
			"unfamiliar-repository-exploration",
			"large-command-output",
			"long-session",
			"documentation-task",
			"high-risk-architecture-change",
		]);
		expect(
			ALLFORONE_BASELINE_TASK_CATEGORIES.every((task) => task.executionStatus === "deferred-live-evaluation"),
		).toBe(true);
	});

	it("measures visible metadata against representative context windows", () => {
		const skills = createSyntheticSkillCollection(2);
		const result = measureSkillCollection(skills, [32_768, 8_192]);

		expect(result.skillCount).toBe(2);
		expect(result.metadataTokensEstimate).toBeGreaterThan(0);
		expect(result.referenceBudgets).toEqual([
			expect.objectContaining({ contextWindow: 8_192, referenceBudgetPercent: 2 }),
			expect.objectContaining({ contextWindow: 32_768, referenceBudgetPercent: 2 }),
		]);
		expect(result.omittedSkills).toEqual([]);
		expect(result.budgetApplied).toBe(false);
	});

	it("keeps large synthetic measurements unbounded for the pre-policy comparison", () => {
		const result = measureSkillCollection(createSyntheticSkillCollection(500), [8_192]);

		expect(result.metadataChars).toBeGreaterThan(8_000);
		expect(result.budgetApplied).toBe(false);
		expect(result.omittedSkills).toEqual([]);
	});

	it("collects resource, prompt, tool, and synthetic baseline measurements", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "pi-allforone-baseline-"));
		const cwd = join(tempDir, "project");
		const agentDir = join(tempDir, "agent");
		const skillDir = join(cwd, ".pi", "skills", "baseline-skill");
		mkdirSync(skillDir, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			join(skillDir, "SKILL.md"),
			`---
name: baseline-skill
description: A baseline skill for measurement.
---
Skill content should not appear in the report.
`,
		);
		writeFileSync(join(cwd, "AGENTS.md"), "Do not print this project instruction.\n");

		try {
			const report = await collectAllForOneBaseline({
				cwd,
				agentDir,
				contextWindows: [8_192],
				syntheticSkillCounts: [0, 2],
			});

			expect(report.current.skills.names).toContain("baseline-skill");
			expect(report.current.contextFiles.count).toBe(1);
			expect(report.current.contextFiles.totalBytes).toBeGreaterThan(0);
			expect(report.current.systemPrompt.tokensEstimate).toBeGreaterThan(0);
			expect(report.current.tools.activeNames).toEqual(["read", "bash", "edit", "write", "apply_patch"]);
			expect(report.skillCollections.map((collection) => collection.skillCount)).toEqual([0, 2]);
			expect(JSON.stringify(report)).not.toContain("Do not print this project instruction");
			expect(JSON.stringify(report)).not.toContain("Skill content should not appear");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("exposes a read-only JSON CLI report and help text", () => {
		const scriptPath = resolve(__dirname, "../../../scripts/allforone-baseline.ts");
		const tsconfigPath = resolve(__dirname, "../../../tsconfig.json");
		const repoRoot = resolve(__dirname, "../../..");
		const tsxBin = resolve(
			repoRoot,
			process.platform === "win32" ? "node_modules/.bin/tsx.cmd" : "node_modules/.bin/tsx",
		);
		const tempDir = mkdtempSync(join(tmpdir(), "pi-allforone-cli-"));
		const cwd = join(tempDir, "project");
		const agentDir = join(tempDir, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });

		try {
			const help = execFileSync(tsxBin, ["--tsconfig", tsconfigPath, scriptPath, "--help"], {
				cwd: repoRoot,
				encoding: "utf8",
			});
			expect(help).toContain("baseline:allforone");
			expect(help).toContain("--json");

			const output = execFileSync(
				tsxBin,
				[
					"--tsconfig",
					tsconfigPath,
					scriptPath,
					"--json",
					"--cwd",
					cwd,
					"--agent-dir",
					agentDir,
					"--context-window",
					"8192",
					"--skill-count",
					"0",
				],
				{ cwd: repoRoot, encoding: "utf8" },
			);
			const report = JSON.parse(output) as {
				schemaVersion: number;
				environment: { resourceLoading: string };
			};

			expect(report.schemaVersion).toBe(1);
			expect(report.environment.resourceLoading).toBe("offline-read-only");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
