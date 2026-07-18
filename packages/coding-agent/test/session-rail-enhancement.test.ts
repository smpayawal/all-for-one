import { beforeAll, describe, expect, test } from "vitest";
import { SessionRailComponent } from "../src/modes/interactive/components/session-rail.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

beforeAll(() => {
	initTheme("dark");
});

describe("session rail hierarchy", () => {
	test("shows current-turn context and keeps optional sections whole", () => {
		const rail = new SessionRailComponent({
			title: "All-For-One",
			agents: ["AGENTS.md"],
			skills: ["repository-orientation", "systematic-debugging"],
			lifecycle: { kind: "agent" },
			activeTools: ["edit", "bash"],
			recentTools: [],
			completedTools: 2,
			failedTools: 0,
			getAvailableHeight: () => 24,
		});

		const lines = stripAnsi(rail.render(36).join("\n")).split("\n");
		const output = lines.join("\n");
		expect(output).toContain("ACTIVITY");
		expect(output).toContain("CURRENT TURN");
		expect(output).toContain("Running edit");
		expect(output).toContain("+1 more active");
		expect(output).toContain("CONTEXT / AGENTS");
		expect(output).toContain("SKILLS");
		expect(lines).toHaveLength(24);
	});

	test("preserves activity before lower-priority sections in short terminals", () => {
		const rail = new SessionRailComponent({
			title: "All-For-One",
			agents: ["AGENTS.md"],
			skills: ["one", "two", "three"],
			progress: { label: "validation", completed: 2, total: 3 },
			lifecycle: { kind: "retry", attempt: 2, maxAttempts: 3 },
			activeTools: ["bash"],
			recentTools: [],
			completedTools: 0,
			failedTools: 1,
			getAvailableHeight: () => 8,
		});

		const output = stripAnsi(rail.render(36).join("\n"));
		expect(output).toContain("ACTIVITY");
		expect(output).toContain("validation 2/3");
		expect(output).toContain("Retrying 2/3");
		expect(output).not.toContain("SKILLS");
	});
});
