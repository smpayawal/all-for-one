import { fileURLToPath } from "node:url";
import { visibleWidth } from "@earendil-works/pi-tui";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { SessionRailComponent } from "../src/modes/interactive/components/session-rail.ts";
import { initTheme, loadThemeFromPath, setThemeInstance } from "../src/modes/interactive/theme/theme.ts";

const THEME_PATH = fileURLToPath(new URL("../theme/afo-midnight.json", import.meta.url));

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

beforeAll(() => {
	setThemeInstance(loadThemeFromPath(THEME_PATH));
});

afterAll(() => {
	initTheme("dark");
});

describe("session rail visual hierarchy", () => {
	test("renders inset product branding and prioritizes live state before progress", () => {
		const rail = new SessionRailComponent({
			title: "All-For-One",
			agents: ["project/AGENTS.md"],
			skills: ["systematic-debugging"],
			progress: { label: "implementation", completed: 2, total: 5 },
			lifecycle: { kind: "agent" },
			activeTools: ["edit"],
			recentTools: [{ toolName: "read", status: "success" }],
			completedTools: 3,
			failedTools: 0,
			getAvailableHeight: () => 24,
		});

		const lines = rail.render(40);
		const output = stripAnsi(lines.join("\n"));
		expect(lines[0]?.trim()).toBe("");
		expect(stripAnsi(lines[1] ?? "")).toContain(" ◆ All-For-One ─");
		for (const line of lines) expect(visibleWidth(line)).toBe(40);
		expect(output.indexOf("Working")).toBeLessThan(output.indexOf("3 succeeded"));
		expect(output.indexOf("3 succeeded")).toBeLessThan(output.indexOf("implementation 2/5"));
		expect(output).toContain("CONTEXT / AGENTS");
		expect(output).toContain("AGENTS.md");
		expect(output).toContain("SKILLS");
		expect(output).toContain("systematic-debugging");
	});
});
