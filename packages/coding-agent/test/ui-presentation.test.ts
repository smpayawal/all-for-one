import { fileURLToPath } from "node:url";
import { type Component, visibleWidth } from "@earendil-works/pi-tui";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ExecutionGroupComponent } from "../src/modes/interactive/components/execution-group.ts";
import type { ToolExecutionComponent } from "../src/modes/interactive/components/tool-execution.ts";
import { TranscriptTurnHeaderComponent } from "../src/modes/interactive/components/transcript-turn-header.ts";
import { UserMessageComponent } from "../src/modes/interactive/components/user-message.ts";
import { initTheme, loadThemeFromPath, setThemeInstance, theme } from "../src/modes/interactive/theme/theme.ts";
import { getExecutionGroupTarget } from "../src/modes/interactive/tool-action-summary.ts";

const THEME_PATH = fileURLToPath(new URL("../theme/afo-midnight.json", import.meta.url));

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

class FakeToolComponent implements Component {
	expanded = false;

	render(width: number): string[] {
		return ["native tool renderer".slice(0, width), "native output detail".slice(0, width)];
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
	test("uses distinct role accents, turn spacing, and width-bounded headers", () => {
		const userLines = new TranscriptTurnHeaderComponent("user", "user-1").render(40);
		const assistantLines = new TranscriptTurnHeaderComponent("assistant", "assistant-1").render(40);

		expect(userLines[0]?.trim()).toBe("");
		expect(assistantLines[0]?.trim()).toBe("");
		expect(stripAnsi(userLines[1] ?? "")).toContain(" YOU ─");
		expect(stripAnsi(assistantLines[1] ?? "")).toContain(" ALL-FOR-ONE ─");
		for (const line of [...userLines, ...assistantLines]) expect(visibleWidth(line)).toBe(40);
	});

	test("renders user messages as inset cards without changing message content", () => {
		const lines = new UserMessageComponent("Keep the runtime unchanged.").render(48);
		const output = stripAnsi(lines.join("\n"));

		expect(output).toContain(" ▎");
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
		const header = stripAnsi(lines[1] ?? "");
		expect(lines[0]?.trim()).toBe("");
		expect(header).toContain(" │▸ File changes");
		expect(header).toContain("/tmp/example.txt");
		expect(header).toContain("✓ 2 actions");
		expect(lines).toHaveLength(4);
		for (const line of lines) expect(visibleWidth(line)).toBe(72);
	});

	test("layers expanded action headers above darker native output cards", () => {
		const first = new FakeToolComponent() as unknown as ToolExecutionComponent;
		const second = new FakeToolComponent() as unknown as ToolExecutionComponent;
		const group = new ExecutionGroupComponent("turn-2", true);
		group.addAction({
			id: "read-1",
			toolName: "read",
			args: { path: "README.md" },
			status: "success",
			component: first,
		});
		group.addAction({
			id: "read-2",
			toolName: "read",
			args: { path: "package.json" },
			status: "running",
			component: second,
		});

		const lines = group.render(64);
		const plain = lines.map(stripAnsi);
		expect(lines[0]?.trim()).toBe("");
		expect(plain[1]).toContain("│▾ Repository inspection");
		expect(plain.some((line) => line.includes("✓ Read  README.md"))).toBe(true);
		expect(plain.some((line) => line.includes("◐ Read  package.json"))).toBe(true);
		expect(plain.filter((line) => line.includes("native tool renderer"))).toHaveLength(2);
		expect(lines.some((line) => line.includes(theme.getBgAnsi("selectedBg")) && stripAnsi(line).includes("Read"))).toBe(
			true,
		);
		expect(
			lines.some(
				(line) => line.includes(theme.getBgAnsi("customMessageBg")) && stripAnsi(line).includes("native output detail"),
			),
		).toBe(true);
		for (const line of lines) expect(visibleWidth(line)).toBe(64);
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