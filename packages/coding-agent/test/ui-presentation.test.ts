import { fileURLToPath } from "node:url";
import { type Component, visibleWidth } from "@earendil-works/pi-tui";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ExecutionGroupComponent } from "../src/modes/interactive/components/execution-group.ts";
import type { ToolExecutionComponent } from "../src/modes/interactive/components/tool-execution.ts";
import { TranscriptTurnHeaderComponent } from "../src/modes/interactive/components/transcript-turn-header.ts";
import { UserMessageComponent } from "../src/modes/interactive/components/user-message.ts";
import { initTheme, loadThemeFromPath, setThemeInstance } from "../src/modes/interactive/theme/theme.ts";
import { getExecutionGroupTarget } from "../src/modes/interactive/tool-action-summary.ts";

const THEME_PATH = fileURLToPath(new URL("../theme/afo-midnight.json", import.meta.url));

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

class FakeToolComponent implements Component {
	expanded = false;

	render(width: number): string[] {
		return ["native tool renderer".slice(0, width)];
	}

	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
	}

	setShowImages(_showImages: boolean): void {}
	setImageWidthCells(_width: number): void {}
	invalidate(): void {}
}

beforeAll(() => {
	setThemeInstance(loadThemeFromPath(THEME_PATH));
});

afterAll(() => {
	initTheme("dark");
});

describe("All-For-One transcript presentation", () => {
	test("uses distinct role accents while keeping turn headers width bounded", () => {
		const userHeader = new TranscriptTurnHeaderComponent("user", "user-1").render(40)[0] ?? "";
		const assistantHeader = new TranscriptTurnHeaderComponent("assistant", "assistant-1").render(40)[0] ?? "";

		expect(stripAnsi(userHeader)).toContain("YOU ─");
		expect(stripAnsi(assistantHeader)).toContain("ALL-FOR-ONE ─");
		expect(visibleWidth(userHeader)).toBe(40);
		expect(visibleWidth(assistantHeader)).toBe(40);
	});

	test("renders user messages with a narrow role border without changing message content", () => {
		const lines = new UserMessageComponent("Keep the runtime unchanged.").render(48);
		const output = stripAnsi(lines.join("\n"));

		expect(output).toContain("▎");
		expect(output).toContain("Keep the runtime unchanged.");
		for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(48);
	});

	test("renders execution summaries with one shared target and semantic status", () => {
		const component = new FakeToolComponent() as unknown as ToolExecutionComponent;
		const group = new ExecutionGroupComponent("turn-1", false);
		group.addAction({
			id: "write-1",
			toolName: "write",
			args: { path: "/tmp/example.txt" },
			status: "success",
			component,
		});
		group.addAction({
			id: "edit-1",
			toolName: "edit",
			args: { path: "/tmp/example.txt" },
			status: "success",
			component,
		});

		const lines = group.render(72);
		const header = stripAnsi(lines[0] ?? "");
		expect(header).toContain("│▸ File changes");
		expect(header).toContain("/tmp/example.txt");
		expect(header).toContain("✓ 2 actions");
		expect(lines).toHaveLength(3);
		for (const line of lines) expect(visibleWidth(line)).toBe(72);
	});

	test("only promotes a target to the group header when every targeted action agrees", () => {
		expect(
			getExecutionGroupTarget([
				{ toolName: "write", args: { path: "a.ts" }, status: "success" },
				{ toolName: "edit", args: { path: "a.ts" }, status: "success" },
			]),
		).toBe("a.ts");
		expect(
			getExecutionGroupTarget([
				{ toolName: "read", args: { path: "a.ts" }, status: "success" },
				{ toolName: "read", args: { path: "b.ts" }, status: "success" },
			]),
		).toBeUndefined();
	});
});
