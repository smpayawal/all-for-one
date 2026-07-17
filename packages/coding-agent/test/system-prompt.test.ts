import { describe, expect, test } from "vitest";
import type { Skill } from "../src/core/skills.ts";
import { createSyntheticSourceInfo } from "../src/core/source-info.ts";
import { buildSystemPrompt } from "../src/core/system-prompt.ts";

function createSkill(name: string, description: string): Skill {
	return {
		name,
		description,
		filePath: `/skills/${name}/SKILL.md`,
		baseDir: `/skills/${name}`,
		sourceInfo: createSyntheticSourceInfo(`/skills/${name}/SKILL.md`, { source: "test" }),
		disableModelInvocation: false,
	};
}

describe("buildSystemPrompt", () => {
	describe("empty tools", () => {
		test("shows (none) for empty tools list", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Available tools:\n(none)");
		});

		test("shows file paths guideline even with no tools", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Show file paths clearly");
		});
	});

	describe("default tools", () => {
		test("includes all default tools when snippets are provided", () => {
			const prompt = buildSystemPrompt({
				toolSnippets: {
					read: "Read file contents",
					bash: "Execute bash commands",
					edit: "Make surgical edits",
					write: "Create or overwrite files",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- bash:");
			expect(prompt).toContain("- edit:");
			expect(prompt).toContain("- write:");
		});

		test("includes the coding contract and only active mutation guidance", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "bash", "edit", "write"],
				toolSnippets: {
					read: "Read file contents",
					bash: "Execute bash commands",
					edit: "Make precise targeted changes in one existing file",
					write: "Create a new file or deliberately replace an entire file",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain(
				"Inspect the relevant implementation, project instructions, and nearby tests before changing code",
			);
			expect(prompt).toContain("Use the narrowest appropriate mutation tool");
			expect(prompt).toContain("Use write only for new files or deliberate full-file replacement");
			expect(prompt).toContain("Use edit for precise targeted replacements in an existing file");
			expect(prompt).not.toContain("Use apply_patch for coherent multi-hunk or multi-file changes");
			expect(prompt).toContain("After code changes, run the smallest relevant validation available");
			expect(prompt).toContain("Report exactly what was validated; never claim an unrun check passed");
		});

		test("instructs models to resolve pi docs and examples under absolute base paths", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain(
				"- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory",
			);
		});
	});

	describe("custom tool snippets", () => {
		test("includes custom tools in available tools section when promptSnippet is provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				toolSnippets: {
					dynamic_tool: "Run dynamic test behavior",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- dynamic_tool: Run dynamic test behavior");
		});

		test("omits custom tools from available tools section when promptSnippet is not provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).not.toContain("dynamic_tool");
		});
	});

	describe("prompt guidelines", () => {
		test("appends promptGuidelines to default guidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for project summaries."],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- Use dynamic_tool for project summaries.");
		});

		test("deduplicates and trims promptGuidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for summaries.", "  Use dynamic_tool for summaries.  ", "   "],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt.match(/- Use dynamic_tool for summaries\./g)).toHaveLength(1);
		});
	});

	describe("skill metadata budgeting", () => {
		test("applies the configured budget and reports formatting diagnostics", () => {
			let diagnostics:
				| {
						budgetChars: number;
						omittedCount: number;
						metadataChars: number;
				  }
				| undefined;
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: Array.from({ length: 6 }, (_, index) =>
					createSkill(
						`budget-skill-${index}`,
						"A long description that should be constrained by the configured budget.".repeat(6),
					),
				),
				cwd: process.cwd(),
				skillMetadataBudget: { maxChars: 500 },
				onSkillMetadataDiagnostics: (value) => {
					diagnostics = value;
				},
			});

			const skillsSection = prompt.slice(
				prompt.lastIndexOf("\n\n", prompt.indexOf("<available_skills>")),
				prompt.indexOf("</available_skills>") + "</available_skills>".length,
			);
			expect(skillsSection.length).toBeLessThanOrEqual(500);
			expect(diagnostics).toMatchObject({ budgetChars: 500, metadataChars: skillsSection.length });
			expect(diagnostics?.omittedCount).toBeGreaterThan(0);
		});
	});
});
