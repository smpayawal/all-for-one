import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_SKILL_METADATA_MAX_CHARS,
	formatSkillsForPromptWithDiagnostics,
	loadSkillsFromDir,
} from "../src/core/skills.ts";

const bundledSkillsDir = resolve(__dirname, "../skills");

const expectedAdaptiveSkills = [
	"change-review",
	"design-complex-change",
	"project-context-maintenance",
	"security-boundary-review",
	"systematic-debugging",
];

const expectedManualOnlySkills = ["project-bootstrap"];

describe("bundled first-party skills", () => {
	it("ships the approved adaptive and manual-only inventory without overlaps", () => {
		const { skills, diagnostics } = loadSkillsFromDir({
			dir: bundledSkillsDir,
			source: "bundled-test",
		});

		expect(diagnostics).toEqual([]);
		expect(skills.map((skill) => skill.name).sort()).toEqual(
			[...expectedAdaptiveSkills, ...expectedManualOnlySkills].sort(),
		);
		expect(
			skills
				.filter((skill) => !skill.disableModelInvocation)
				.map((skill) => skill.name)
				.sort(),
		).toEqual(expectedAdaptiveSkills);
		expect(
			skills
				.filter((skill) => skill.disableModelInvocation)
				.map((skill) => skill.name)
				.sort(),
		).toEqual(expectedManualOnlySkills);
	});

	it("keeps manual bootstrap out of the prompt and adaptive metadata within budget", () => {
		const { skills } = loadSkillsFromDir({
			dir: bundledSkillsDir,
			source: "bundled-test",
		});
		const { prompt, diagnostics } = formatSkillsForPromptWithDiagnostics(skills);

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
});
