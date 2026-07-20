import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DefaultResourceLoader } from "../src/core/resource-loader.ts";
import {
	DEFAULT_SKILL_METADATA_MAX_CHARS,
	formatSkillsForPromptWithDiagnostics,
} from "../src/core/skills.ts";

const expectedAdaptiveSkills = [
	"change-review",
	"design-complex-change",
	"project-context-maintenance",
	"security-boundary-review",
	"systematic-debugging",
];

const expectedManualOnlySkills = ["project-bootstrap"];

describe("native coding skills", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const directory of tempDirs.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("loads the approved bundled inventory with adaptive and manual visibility", async () => {
		const directory = join(tmpdir(), `pi-native-skills-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		tempDirs.push(directory);
		mkdirSync(directory, { recursive: true });

		const loader = new DefaultResourceLoader({ cwd: directory, agentDir: directory });
		await loader.reload();
		const bundled = loader
			.getSkills()
			.skills.filter((skill) => skill.filePath.replaceAll("\\", "/").includes("packages/coding-agent/skills/"));

		expect(bundled.map((skill) => skill.name).sort()).toEqual(
			[...expectedAdaptiveSkills, ...expectedManualOnlySkills].sort(),
		);
		expect(
			bundled
				.filter((skill) => !skill.disableModelInvocation)
				.map((skill) => skill.name)
				.sort(),
		).toEqual(expectedAdaptiveSkills);
		expect(
			bundled
				.filter((skill) => skill.disableModelInvocation)
				.map((skill) => skill.name)
				.sort(),
		).toEqual(expectedManualOnlySkills);

		const { prompt, diagnostics } = formatSkillsForPromptWithDiagnostics(bundled);
		expect(diagnostics.visibleCount).toBe(expectedAdaptiveSkills.length);
		expect(diagnostics.manualOnlyCount).toBe(expectedManualOnlySkills.length);
		expect(diagnostics.renderedCount).toBe(expectedAdaptiveSkills.length);
		expect(diagnostics.omittedCount).toBe(0);
		expect(diagnostics.duplicateNames).toEqual([]);
		expect(diagnostics.duplicatePaths).toEqual([]);
		expect(diagnostics.budgetChars).toBe(DEFAULT_SKILL_METADATA_MAX_CHARS);
		expect(diagnostics.metadataChars).toBeLessThan(DEFAULT_SKILL_METADATA_MAX_CHARS);
		expect(prompt).not.toContain("<name>project-bootstrap</name>");
		for (const name of expectedAdaptiveSkills) {
			expect(prompt).toContain(`<name>${name}</name>`);
		}
	});

	it("keeps the bundled skills out when skills are disabled", async () => {
		const directory = join(tmpdir(), `pi-native-skills-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		tempDirs.push(directory);
		mkdirSync(directory, { recursive: true });

		const loader = new DefaultResourceLoader({ cwd: directory, agentDir: directory, noSkills: true });
		await loader.reload();

		expect(loader.getSkills().skills).toEqual([]);
	});
});
