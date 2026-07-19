import { fileURLToPath } from "node:url";
import { visibleWidth } from "@earendil-works/pi-tui";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { SessionRailComponent } from "../src/modes/interactive/components/session-rail.ts";
import { initTheme, loadThemeFromPath, setThemeInstance, theme } from "../src/modes/interactive/theme/theme.ts";

const THEME_PATH = fileURLToPath(new URL("../src/modes/interactive/theme/dark.json", import.meta.url));

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

beforeAll(() => {
	setThemeInstance(loadThemeFromPath(THEME_PATH, "truecolor"));
});

afterAll(() => {
	initTheme("dark");
});

describe("session rail visual hierarchy", () => {
	test("renders inset product branding and indents section values beneath headings", () => {
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
		const plainLines = lines.map(stripAnsi);
		const output = plainLines.join("\n");
		expect(plainLines[0]?.trim()).toBe("");
		expect(plainLines[1]).toContain(" ◆ All-For-One ─");
		for (const line of lines) {
			expect(visibleWidth(line)).toBe(40);
			expect(line).toContain(theme.getBgAnsi("customMessageBg"));
		}
		expect(output.indexOf("Working")).toBeLessThan(output.indexOf("3 succeeded"));
		expect(output.indexOf("3 succeeded")).toBeLessThan(output.indexOf("implementation 2/5"));
		expect(plainLines.find((line) => line.includes("Working"))).toMatch(/^ {3}Working/);
		expect(plainLines.find((line) => line.includes("AGENTS.md"))).toMatch(/^ {3}AGENTS\.md/);
		expect(plainLines.find((line) => line.includes("systematic-debugging"))).toMatch(/^ {3}systematic-debugging/);
		expect(output).toContain("CONTEXT / AGENTS");
		expect(output).toContain("SKILLS");
	});
});
