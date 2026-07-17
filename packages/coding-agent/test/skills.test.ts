import { homedir } from "os";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";
import type { ResourceDiagnostic } from "../src/core/diagnostics.ts";
import {
	formatSkillsForPrompt,
	formatSkillsForPromptWithDiagnostics,
	loadSkills,
	loadSkillsFromDir,
	type Skill,
} from "../src/core/skills.ts";
import { createSyntheticSourceInfo } from "../src/core/source-info.ts";

const fixturesDir = resolve(__dirname, "fixtures/skills");
const collisionFixturesDir = resolve(__dirname, "fixtures/skills-collision");

function createTestSkill(options: {
	name: string;
	description: string;
	filePath: string;
	baseDir: string;
	disableModelInvocation?: boolean;
	source?: string;
	scope?: "user" | "project" | "temporary";
	origin?: "package" | "top-level";
}): Skill {
	return {
		name: options.name,
		description: options.description,
		filePath: options.filePath,
		baseDir: options.baseDir,
		sourceInfo: createSyntheticSourceInfo(options.filePath, {
			source: options.source ?? "test",
			scope: options.scope,
			origin: options.origin,
		}),
		disableModelInvocation: options.disableModelInvocation ?? false,
	};
}

describe("skills", () => {
	describe("loadSkillsFromDir", () => {
		it("should load a valid skill", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "valid-skill"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("valid-skill");
			expect(skills[0].description).toBe("A valid skill for testing purposes.");
			expect(skills[0].sourceInfo.source).toBe("test");
			expect(diagnostics).toHaveLength(0);
		});

		it("should allow names that don't match parent directory", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "name-mismatch"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("different-name");
			expect(
				diagnostics.some((d: ResourceDiagnostic) => d.message.includes("does not match parent directory")),
			).toBe(false);
		});

		it("should warn when name contains invalid characters", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "invalid-name-chars"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("invalid characters"))).toBe(true);
		});

		it("should warn when name exceeds 64 characters", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "long-name"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("exceeds 64 characters"))).toBe(true);
		});

		it("should warn and skip skill when description is missing", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "missing-description"),
				source: "test",
			});

			expect(skills).toHaveLength(0);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("description is required"))).toBe(true);
		});

		it("should ignore unknown frontmatter fields", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "unknown-field"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(diagnostics).toHaveLength(0);
		});

		it("should load nested skills recursively", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "nested"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("child-skill");
			expect(diagnostics).toHaveLength(0);
		});

		it("should prefer a directory's root SKILL.md over nested SKILL.md files", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "root-skill-preferred"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("root-skill-preferred");
			expect(skills[0].description).toBe("Root skill should win.");
			expect(diagnostics).toHaveLength(0);
		});

		it("should skip files without frontmatter", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "no-frontmatter"),
				source: "test",
			});

			// no-frontmatter has no description, so it should be skipped
			expect(skills).toHaveLength(0);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("description is required"))).toBe(true);
		});

		it("should warn and skip skill when YAML frontmatter is invalid", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "invalid-yaml"),
				source: "test",
			});

			expect(skills).toHaveLength(0);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("at line"))).toBe(true);
		});

		it("should preserve multiline descriptions from YAML", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "multiline-description"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].description).toContain("\n");
			expect(skills[0].description).toContain("This is a multiline description.");
			expect(diagnostics).toHaveLength(0);
		});

		it("should warn when name contains consecutive hyphens", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "consecutive-hyphens"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("consecutive hyphens"))).toBe(true);
		});

		it("should load all skills from fixture directory", () => {
			const { skills } = loadSkillsFromDir({
				dir: fixturesDir,
				source: "test",
			});

			// Should load all skills that have descriptions (even with warnings)
			// valid-skill, name-mismatch, invalid-name-chars, long-name, unknown-field, nested/child-skill, consecutive-hyphens
			// NOT: missing-description, no-frontmatter (both missing descriptions)
			expect(skills.length).toBeGreaterThanOrEqual(6);
		});

		it("should return empty for non-existent directory", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: "/non/existent/path",
				source: "test",
			});

			expect(skills).toHaveLength(0);
			expect(diagnostics).toHaveLength(0);
		});

		it("should use parent directory name when name not in frontmatter", () => {
			// The no-frontmatter fixture has no name in frontmatter, so it should use "no-frontmatter"
			// But it also has no description, so it won't load
			// Let's test with a valid skill that relies on directory name
			const { skills } = loadSkillsFromDir({
				dir: join(fixturesDir, "valid-skill"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("valid-skill");
		});

		it("should parse disable-model-invocation frontmatter field", () => {
			const { skills, diagnostics } = loadSkillsFromDir({
				dir: join(fixturesDir, "disable-model-invocation"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("disable-model-invocation");
			expect(skills[0].disableModelInvocation).toBe(true);
			// Should not warn about unknown field
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("unknown frontmatter field"))).toBe(
				false,
			);
		});

		it("should default disableModelInvocation to false when not specified", () => {
			const { skills } = loadSkillsFromDir({
				dir: join(fixturesDir, "valid-skill"),
				source: "test",
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].disableModelInvocation).toBe(false);
		});
	});

	describe("formatSkillsForPrompt", () => {
		it("should return empty string for no skills", () => {
			const result = formatSkillsForPrompt([]);
			expect(result).toBe("");
		});

		it("should format skills as XML", () => {
			const skills: Skill[] = [
				createTestSkill({
					name: "test-skill",
					description: "A test skill.",
					filePath: "/path/to/skill/SKILL.md",
					baseDir: "/path/to/skill",
				}),
			];

			const result = formatSkillsForPrompt(skills);

			expect(result).toContain("<available_skills>");
			expect(result).toContain("</available_skills>");
			expect(result).toContain("<skill>");
			expect(result).toContain("<name>test-skill</name>");
			expect(result).toContain("<description>A test skill.</description>");
			expect(result).toContain("<location>/path/to/skill/SKILL.md</location>");
		});

		it("should include intro text before XML", () => {
			const skills: Skill[] = [
				createTestSkill({
					name: "test-skill",
					description: "A test skill.",
					filePath: "/path/to/skill/SKILL.md",
					baseDir: "/path/to/skill",
				}),
			];

			const result = formatSkillsForPrompt(skills);
			const xmlStart = result.indexOf("<available_skills>");
			const introText = result.substring(0, xmlStart);

			expect(introText).toContain("The following skills provide specialized instructions");
			expect(introText).toContain("Use the read tool to load a skill's file");
		});

		it("should escape XML special characters", () => {
			const skills: Skill[] = [
				createTestSkill({
					name: "test-skill",
					description: 'A skill with <special> & "characters".',
					filePath: "/path/to/skill/SKILL.md",
					baseDir: "/path/to/skill",
				}),
			];

			const result = formatSkillsForPrompt(skills);

			expect(result).toContain("&lt;special&gt;");
			expect(result).toContain("&amp;");
			expect(result).toContain("&quot;characters&quot;");
		});

		it("should format multiple skills", () => {
			const skills: Skill[] = [
				createTestSkill({
					name: "skill-one",
					description: "First skill.",
					filePath: "/path/one/SKILL.md",
					baseDir: "/path/one",
				}),
				createTestSkill({
					name: "skill-two",
					description: "Second skill.",
					filePath: "/path/two/SKILL.md",
					baseDir: "/path/two",
				}),
			];

			const result = formatSkillsForPrompt(skills);

			expect(result).toContain("<name>skill-one</name>");
			expect(result).toContain("<name>skill-two</name>");
			expect((result.match(/<skill>/g) || []).length).toBe(2);
		});

		it("should exclude skills with disableModelInvocation from prompt", () => {
			const skills: Skill[] = [
				createTestSkill({
					name: "visible-skill",
					description: "A visible skill.",
					filePath: "/path/visible/SKILL.md",
					baseDir: "/path/visible",
				}),
				createTestSkill({
					name: "hidden-skill",
					description: "A hidden skill.",
					filePath: "/path/hidden/SKILL.md",
					baseDir: "/path/hidden",
					disableModelInvocation: true,
				}),
			];

			const result = formatSkillsForPrompt(skills);

			expect(result).toContain("<name>visible-skill</name>");
			expect(result).not.toContain("<name>hidden-skill</name>");
			expect((result.match(/<skill>/g) || []).length).toBe(1);
		});

		it("should return empty string when all skills have disableModelInvocation", () => {
			const skills: Skill[] = [
				createTestSkill({
					name: "hidden-skill",
					description: "A hidden skill.",
					filePath: "/path/hidden/SKILL.md",
					baseDir: "/path/hidden",
					disableModelInvocation: true,
				}),
			];

			const result = formatSkillsForPrompt(skills);
			expect(result).toBe("");
		});

		it("orders model-visible metadata deterministically and removes duplicate names", () => {
			const result = formatSkillsForPromptWithDiagnostics([
				createTestSkill({
					name: "zeta-skill",
					description: "Zeta skill.",
					filePath: "/skills/zeta/SKILL.md",
					baseDir: "/skills/zeta",
				}),
				createTestSkill({
					name: "alpha-skill",
					description: "Alpha skill.",
					filePath: "/skills/alpha/SKILL.md",
					baseDir: "/skills/alpha",
				}),
				createTestSkill({
					name: "alpha-skill",
					description: "Duplicate alpha skill.",
					filePath: "/other/alpha/SKILL.md",
					baseDir: "/other/alpha",
				}),
				createTestSkill({
					name: "manual-skill",
					description: "Manual skill.",
					filePath: "/skills/manual/SKILL.md",
					baseDir: "/skills/manual",
					disableModelInvocation: true,
				}),
			]);

			expect(result.prompt.indexOf("alpha-skill")).toBeLessThan(result.prompt.indexOf("zeta-skill"));
			expect(result.prompt).not.toContain("manual-skill");
			expect((result.prompt.match(/<skill>/g) || []).length).toBe(2);
			expect(result.diagnostics).toMatchObject({
				discoveredCount: 4,
				visibleCount: 2,
				manualOnlyCount: 1,
				renderedCount: 2,
				omittedCount: 0,
				duplicateNames: ["alpha-skill"],
			});
		});

		it("reports duplicate canonical paths without hiding the diagnostic", () => {
			const result = formatSkillsForPromptWithDiagnostics([
				createTestSkill({
					name: "same-path-one",
					description: "First path entry.",
					filePath: "/skills/shared/SKILL.md",
					baseDir: "/skills/shared",
				}),
				createTestSkill({
					name: "same-path-two",
					description: "Second path entry.",
					filePath: "/skills/shared/SKILL.md",
					baseDir: "/skills/shared",
				}),
			]);

			expect(result.diagnostics.duplicatePaths).toEqual(["/skills/shared/SKILL.md"]);
			expect(result.prompt).toContain("same-path-one");
			expect(result.prompt).not.toContain("same-path-two");
		});

		it.each([
			[
				"project over user",
				{ scope: "project" as const, origin: "top-level" as const },
				{ scope: "user" as const, origin: "top-level" as const },
			],
			[
				"project over package",
				{ scope: "project" as const, origin: "top-level" as const },
				{ scope: "user" as const, origin: "package" as const },
			],
			[
				"project over project-scoped package",
				{ scope: "project" as const, origin: "top-level" as const },
				{ scope: "project" as const, origin: "package" as const },
			],
			[
				"user over package",
				{ scope: "user" as const, origin: "top-level" as const },
				{ scope: "user" as const, origin: "package" as const },
			],
			[
				"explicit temporary over project",
				{ scope: "temporary" as const, origin: "top-level" as const },
				{ scope: "project" as const, origin: "top-level" as const },
			],
		])("keeps the higher-priority $0 skill when names collide", (_label, winner, loser) => {
			const result = formatSkillsForPromptWithDiagnostics([
				createTestSkill({
					name: "collision-skill",
					description: "Higher-priority skill.",
					filePath: "/zzz/lower-alphabetical-path/SKILL.md",
					baseDir: "/zzz/lower-alphabetical-path",
					...winner,
				}),
				createTestSkill({
					name: "collision-skill",
					description: "Lower-priority skill.",
					filePath: "/aaa/earlier-alphabetical-path/SKILL.md",
					baseDir: "/aaa/earlier-alphabetical-path",
					...loser,
				}),
			]);

			expect(result.prompt).toContain("Higher-priority skill.");
			expect(result.prompt).not.toContain("Lower-priority skill.");
		});

		it("uses canonical path as the deterministic tie-breaker within one priority", () => {
			const result = formatSkillsForPromptWithDiagnostics([
				createTestSkill({
					name: "same-priority",
					description: "Later path.",
					filePath: "/zzz/skill/SKILL.md",
					baseDir: "/zzz/skill",
					scope: "project",
				}),
				createTestSkill({
					name: "same-priority",
					description: "Earlier path.",
					filePath: "/aaa/skill/SKILL.md",
					baseDir: "/aaa/skill",
					scope: "project",
				}),
			]);

			expect(result.prompt).toContain("Earlier path.");
			expect(result.prompt).not.toContain("Later path.");
		});

		it("sorts by source priority before applying the metadata budget", () => {
			const highPriority = createTestSkill({
				name: "priority-skill",
				description: "High-priority description. ".repeat(10),
				filePath: "/project/priority/SKILL.md",
				baseDir: "/project/priority",
				scope: "project",
			});
			const result = formatSkillsForPromptWithDiagnostics(
				[
					highPriority,
					createTestSkill({
						name: "alpha-skill",
						description: "Low-priority description. ".repeat(10),
						filePath: "/user/alpha/SKILL.md",
						baseDir: "/user/alpha",
						scope: "user",
						origin: "package",
					}),
				],
				{ maxChars: 214 },
			);

			expect(result.prompt).toContain("priority-skill");
			expect(result.prompt).not.toContain("alpha-skill");
		});

		it("fits metadata within a character budget and reports omitted skills", () => {
			const skills = Array.from({ length: 6 }, (_, index) =>
				createTestSkill({
					name: `budget-skill-${index}`,
					description: `A deliberately long description for budget skill ${index}. `.repeat(8),
					filePath: `/skills/budget-${index}/SKILL.md`,
					baseDir: `/skills/budget-${index}`,
				}),
			);

			const result = formatSkillsForPromptWithDiagnostics(skills, { maxChars: 500 });

			expect(result.prompt.length).toBeLessThanOrEqual(500);
			expect(result.diagnostics.budgetChars).toBe(500);
			expect(result.diagnostics.budgetSource).toBe("maxChars");
			expect(result.diagnostics.omittedCount).toBeGreaterThan(0);
			expect(result.diagnostics.omittedSkills.length).toBe(result.diagnostics.omittedCount);
			expect(result.diagnostics.omittedSkills).toContain("budget-skill-5");
			expect(result.prompt).toContain("omitted");
		});

		it("does not exceed a budget smaller than the metadata wrapper", () => {
			const result = formatSkillsForPromptWithDiagnostics(
				[
					createTestSkill({
						name: "tiny-budget-skill",
						description: "This entry cannot fit in a one-character budget.",
						filePath: "/skills/tiny/SKILL.md",
						baseDir: "/skills/tiny",
					}),
				],
				{ maxChars: 1 },
			);

			expect(result.prompt.length).toBeLessThanOrEqual(1);
			expect(result.diagnostics.metadataChars).toBeLessThanOrEqual(1);
			expect(result.diagnostics.omittedSkills).toEqual(["tiny-budget-skill"]);
		});

		it("reports every visible skill when the configured budget is zero", () => {
			const result = formatSkillsForPromptWithDiagnostics(
				[
					createTestSkill({
						name: "zero-budget-one",
						description: "First zero-budget skill.",
						filePath: "/skills/zero-one/SKILL.md",
						baseDir: "/skills/zero-one",
					}),
					createTestSkill({
						name: "zero-budget-two",
						description: "Second zero-budget skill.",
						filePath: "/skills/zero-two/SKILL.md",
						baseDir: "/skills/zero-two",
					}),
				],
				{ maxChars: 0 },
			);

			expect(result.prompt).toBe("");
			expect(result.diagnostics.omittedCount).toBe(2);
			expect(result.diagnostics.omittedSkills).toEqual(["zero-budget-one", "zero-budget-two"]);
		});

		it("derives a character budget from an explicit context percentage", () => {
			const result = formatSkillsForPromptWithDiagnostics(
				[
					createTestSkill({
						name: "percent-skill",
						description: "A skill whose budget is derived from context.",
						filePath: "/skills/percent/SKILL.md",
						baseDir: "/skills/percent",
					}),
				],
				{ contextWindow: 1_000, maxContextPercent: 10 },
			);

			expect(result.diagnostics.budgetChars).toBe(400);
			expect(result.diagnostics.budgetSource).toBe("maxContextPercent");
			expect(result.prompt.length).toBeLessThanOrEqual(400);
		});

		it("preserves fractional context percentages and falls back for invalid values", () => {
			const fractional = formatSkillsForPromptWithDiagnostics([], {
				contextWindow: 1_000,
				maxContextPercent: 1.5,
			});
			expect(fractional.diagnostics.budgetChars).toBe(60);
			expect(fractional.diagnostics.budgetSource).toBe("maxContextPercent");

			for (const maxContextPercent of [0, -1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
				const result = formatSkillsForPromptWithDiagnostics([], { contextWindow: 1_000, maxContextPercent });
				expect(result.diagnostics.budgetSource).toBe("default");
				expect(result.diagnostics.budgetChars).toBe(8_000);
			}
		});

		it("uses the fixed default when the model context window is unknown", () => {
			const result = formatSkillsForPromptWithDiagnostics(
				[
					createTestSkill({
						name: "unknown-context-skill",
						description: "A skill with an unknown model context window.",
						filePath: "/skills/unknown-context/SKILL.md",
						baseDir: "/skills/unknown-context",
					}),
				],
				{ maxContextPercent: 2 },
			);

			expect(result.diagnostics.budgetSource).toBe("default");
			expect(result.diagnostics.budgetChars).toBe(8_000);
		});
	});

	describe("loadSkills with options", () => {
		const emptyAgentDir = resolve(__dirname, "fixtures/empty-agent");
		const emptyCwd = resolve(__dirname, "fixtures/empty-cwd");

		it("should load from explicit skillPaths", () => {
			const { skills, diagnostics } = loadSkills({
				agentDir: emptyAgentDir,
				cwd: emptyCwd,
				skillPaths: [join(fixturesDir, "valid-skill")],
				includeDefaults: true,
			});
			expect(skills).toHaveLength(1);
			expect(skills[0].sourceInfo.scope).toBe("temporary");
			expect(diagnostics).toHaveLength(0);
		});

		it("should warn when skill path does not exist", () => {
			const { skills, diagnostics } = loadSkills({
				agentDir: emptyAgentDir,
				cwd: emptyCwd,
				skillPaths: ["/non/existent/path"],
				includeDefaults: true,
			});
			expect(skills).toHaveLength(0);
			expect(diagnostics.some((d: ResourceDiagnostic) => d.message.includes("does not exist"))).toBe(true);
		});

		it("should expand ~ in skillPaths", () => {
			const homeSkillsDir = join(homedir(), ".pi/agent/skills");
			const { skills: withTilde } = loadSkills({
				agentDir: emptyAgentDir,
				cwd: emptyCwd,
				skillPaths: ["~/.pi/agent/skills"],
				includeDefaults: true,
			});
			const { skills: withoutTilde } = loadSkills({
				agentDir: emptyAgentDir,
				cwd: emptyCwd,
				skillPaths: [homeSkillsDir],
				includeDefaults: true,
			});
			expect(withTilde.length).toBe(withoutTilde.length);
		});
	});

	describe("collision handling", () => {
		it("should detect name collisions and keep first skill", () => {
			// Load from first directory
			const first = loadSkillsFromDir({
				dir: join(collisionFixturesDir, "first"),
				source: "first",
			});

			const second = loadSkillsFromDir({
				dir: join(collisionFixturesDir, "second"),
				source: "second",
			});

			// Simulate the collision behavior from loadSkills()
			const skillMap = new Map<string, Skill>();
			const collisionWarnings: Array<{ skillPath: string; message: string }> = [];

			for (const skill of first.skills) {
				skillMap.set(skill.name, skill);
			}

			for (const skill of second.skills) {
				const existing = skillMap.get(skill.name);
				if (existing) {
					collisionWarnings.push({
						skillPath: skill.filePath,
						message: `name collision: "${skill.name}" already loaded from ${existing.filePath}`,
					});
				} else {
					skillMap.set(skill.name, skill);
				}
			}

			expect(skillMap.size).toBe(1);
			expect(skillMap.get("calendar")?.sourceInfo.source).toBe("first");
			expect(collisionWarnings).toHaveLength(1);
			expect(collisionWarnings[0].message).toContain("name collision");
		});
	});
});
