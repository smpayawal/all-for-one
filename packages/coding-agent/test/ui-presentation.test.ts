import { fileURLToPath } from "node:url";
import { type Component, visibleWidth } from "@earendil-works/pi-tui";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ExecutionGroupComponent } from "../src/modes/interactive/components/execution-group.ts";
import type { ToolExecutionComponent } from "../src/modes/interactive/components/tool-execution.ts";
import { TranscriptTurnHeaderComponent } from "../src/modes/interactive/components/transcript-turn-header.ts";
import { UserMessageComponent } from "../src/modes/interactive/components/user-message.ts";
import { initTheme, loadThemeFromPath, setThemeInstance, theme } from "../src/modes/interactive/theme/theme.ts";
import { getExecutionGroupTarget } from "../src/modes/interactive/tool-action-summary.ts";

const THEME_PATH = fileURLToPath(new URL("../src/modes/interactive/theme/dark.json", import.meta.url));

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

class FakeToolComponent implements Component {
	expanded = false;
	private readonly lines: string[];

	constructor(lines = ["native tool renderer", "native output detail"]) {
		this.lines = lines;
	}

	render(width: number): string[] {
		return this.lines.map((line) => line.slice(0, width));
	}

	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
	}

	setShowImages(_showImages: boolean): void {}
	setImageWidthCells(_width: number): void {}
	invalidate(): void {}
}

beforeAll(() => {
	setThemeInstance(loadThemeFromPath(THEME_PATH, "truecolor"));
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

	test("uses the native heading once and prefixes it with action status in expanded groups", () => {
		const first = new FakeToolComponent(["read README.md", "README contents"]) as unknown as ToolExecutionComponent;
		const second = new FakeToolComponent([
			"read package.json",
			"package metadata",
		]) as unknown as ToolExecutionComponent;
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
		expect(plain.filter((line) => line.includes("read README.md"))).toHaveLength(1);
		expect(plain.filter((line) => line.includes("read package.json"))).toHaveLength(1);
		expect(plain.some((line) => line.includes("✓ read README.md"))).toBe(true);
		expect(plain.some((line) => line.includes("◐ read package.json"))).toBe(true);
		expect(plain.some((line) => line.includes("README contents"))).toBe(true);
		expect(plain.some((line) => line.includes("package metadata"))).toBe(true);
		expect(lines.some((line) => line.includes(theme.getBgAnsi("selectedBg")))).toBe(false);
		expect(
			lines.some(
				(line) => line.includes(theme.getBgAnsi("customMessageBg")) && stripAnsi(line).includes("README contents"),
			),
		).toBe(true);
		for (const line of lines) expect(visibleWidth(line)).toBe(64);
	});

	test("places the status marker inside the native tool background", () => {
		const nativeBackground = theme.getBgAnsi("toolSuccessBg");
		const component = new FakeToolComponent([
			theme.bg("toolSuccessBg", "write /tmp/example.txt"),
			"written content",
		]) as unknown as ToolExecutionComponent;
		const group = new ExecutionGroupComponent("turn-background", true);
		group.addAction({
			id: "write-background",
			toolName: "write",
			args: { path: "/tmp/example.txt" },
			status: "success",
			component,
		});

		const lines = group.render(56);
		const actionLine = lines.find((line) => stripAnsi(line).includes("✓ write /tmp/example.txt"));
		expect(actionLine).toBeDefined();
		const backgroundIndex = actionLine?.indexOf(nativeBackground) ?? -1;
		const markerIndex = actionLine?.indexOf("✓") ?? -1;
		const resetIndex = actionLine?.indexOf("\x1b[49m", markerIndex) ?? -1;
		expect(backgroundIndex).toBeGreaterThanOrEqual(0);
		expect(markerIndex).toBeGreaterThan(backgroundIndex);
		expect(resetIndex).toBeGreaterThan(markerIndex);
		for (const line of lines) expect(visibleWidth(line)).toBe(56);
	});

	test("retains structured action summaries when a group is collapsed", () => {
		const component = new FakeToolComponent([
			"read README.md",
			"README contents",
		]) as unknown as ToolExecutionComponent;
		const group = new ExecutionGroupComponent("turn-3", false);
		group.addAction({
			id: "read-1",
			toolName: "read",
			args: { path: "README.md" },
			status: "success",
			component,
		});

		const output = stripAnsi(group.render(56).join("\n"));
		expect(output).toContain("✓ Read  README.md");
		expect(output).not.toContain("README contents");
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
