import * as path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { SessionRailComponent } from "../src/modes/interactive/components/session-rail.ts";
import {
	createEmptySessionRailActivityState,
	findSessionRailSkillName,
	SessionRailSkillUsageTracker,
} from "../src/modes/interactive/session-rail-state.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

beforeAll(() => {
	initTheme("dark");
});

describe("session rail skill state", () => {
	test("renders skills used in the current session", () => {
		const rail = new SessionRailComponent({
			title: "All-For-One",
			agents: ["AGENTS.md"],
			skills: ["systematic-debugging"],
			lifecycle: { kind: "idle" },
			activeTools: [],
			recentTools: [],
			completedTools: 0,
			failedTools: 0,
			getAvailableHeight: () => 24,
		});

		const output = stripAnsi(rail.render(40).join("\n"));
		expect(output).toContain("SKILLS USED");
		expect(output).toContain("systematic-debugging");
	});

	test("matches only the exact registered skill file path", () => {
		const cwd = path.resolve("/repo");
		const skillPath = path.join(cwd, ".pi", "skills", "systematic-debugging", "SKILL.md");
		const skills = [{ name: "systematic-debugging", filePath: skillPath }];

		expect(findSessionRailSkillName("read", { path: path.relative(cwd, skillPath) }, cwd, skills)).toBe(
			"systematic-debugging",
		);
		expect(findSessionRailSkillName("read", { path: "README.md" }, cwd, skills)).toBeUndefined();
		expect(
			findSessionRailSkillName(
				"read",
				{ path: path.join(cwd, "other", "systematic-debugging", "SKILL.md") },
				cwd,
				skills,
			),
		).toBeUndefined();
		expect(findSessionRailSkillName("bash", { path: skillPath }, cwd, skills)).toBeUndefined();
	});

	test("records only successful skill loads and deduplicates them", () => {
		const tracker = new SessionRailSkillUsageTracker();
		tracker.start("tool-1", "systematic-debugging");
		expect(tracker.finish("tool-1", true)).toBe(false);
		expect(tracker.usedSkills).toEqual([]);

		tracker.start("tool-2", "systematic-debugging");
		expect(tracker.finish("tool-2", false)).toBe(true);
		expect(tracker.usedSkills).toEqual(["systematic-debugging"]);

		tracker.start("tool-3", "systematic-debugging");
		expect(tracker.finish("tool-3", false)).toBe(false);
		expect(tracker.usedSkills).toEqual(["systematic-debugging"]);
	});

	test("preserves used skills across turns and clears them for a new session", () => {
		const tracker = new SessionRailSkillUsageTracker();
		tracker.record("systematic-debugging");
		tracker.start("tool-1", "security-boundary-review");

		tracker.resetTurn();
		expect(tracker.usedSkills).toEqual(["systematic-debugging"]);
		expect(tracker.finish("tool-1", false)).toBe(false);

		tracker.resetSession();
		expect(tracker.usedSkills).toEqual([]);
	});

	test("creates a clean Side Rail activity state for session replacement", () => {
		expect(createEmptySessionRailActivityState()).toEqual({
			lifecycle: { kind: "idle" },
			recentTools: [],
			progress: undefined,
			completedTools: 0,
			failedTools: 0,
		});
	});
});
