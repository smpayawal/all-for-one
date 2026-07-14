import { Container, Text, TUI, visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, test } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import {
	getSessionRailLayout,
	parseRailProgress,
	ResponsiveMainColumn,
	ResponsiveViewport,
	SESSION_RAIL_MAX_WIDTH,
	SESSION_RAIL_MIN_WIDTH,
	SessionRailComponent,
} from "../src/modes/interactive/components/session-rail.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

describe("session rail layout", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("hides below 128 columns and scales between 36 and 44 columns", () => {
		expect(getSessionRailLayout(127)).toEqual({ railVisible: false, railWidth: 0, mainWidth: 127 });
		expect(getSessionRailLayout(128)).toEqual({
			railVisible: true,
			railWidth: SESSION_RAIL_MIN_WIDTH,
			mainWidth: 128 - SESSION_RAIL_MIN_WIDTH - 1,
		});
		expect(getSessionRailLayout(180).railWidth).toBe(36);
		expect(getSessionRailLayout(220).railWidth).toBe(44);
		expect(getSessionRailLayout(240).railWidth).toBe(SESSION_RAIL_MAX_WIDTH);
	});

	test("renders the main column at the reserved width and restores full width when narrow", () => {
		const content = new Container();
		content.addChild(new Text("vanilla Pi transcript", 0, 0));
		const mainColumn = new ResponsiveMainColumn(content);

		const wideLine = mainColumn.render(128)[0] ?? "";
		expect(visibleWidth(wideLine)).toBe(128 - SESSION_RAIL_MIN_WIDTH);
		expect(stripAnsi(wideLine)).toContain("│");

		const narrowLine = mainColumn.render(127)[0] ?? "";
		expect(visibleWidth(narrowLine)).toBe(127);
		expect(stripAnsi(narrowLine)).not.toContain("│");
	});
});

describe("rail progress and activity formatting", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("accepts only valid extension progress ratios", () => {
		expect(parseRailProgress("plan-mode", "📋 2/5")).toEqual({ label: "plan-mode", completed: 2, total: 5 });
		expect(parseRailProgress("plan", "done 5/5")).toEqual({ label: "plan", completed: 5, total: 5 });
		expect(parseRailProgress("plan", "6/5")).toBeUndefined();
		expect(parseRailProgress("plan", "0/0")).toBeUndefined();
		expect(parseRailProgress("status", "working")).toBeUndefined();
	});

	test("prioritizes progress and active tools, then bounds recent history", () => {
		const rail = new SessionRailComponent({
			title: "TEST PRODUCT",
			agents: ["AGENTS.md", "project/AGENTS.md"],
			skills: ["microsoft-foundry", "frontend-skill", "superpowers", "unused"],
			progress: { label: "plan-mode", completed: 2, total: 5 },
			lifecycle: { kind: "agent" },
			activeTools: ["edit", "read"],
			recentTools: [
				{ toolName: "bash", status: "success" },
				{ toolName: "write", status: "error" },
				{ toolName: "find", status: "success" },
				{ toolName: "ls", status: "success" },
			],
			completedTools: 3,
			failedTools: 1,
			getAvailableHeight: () => 32,
		});

		const output = stripAnsi(rail.render(40).join("\n"));
		expect(output).toContain("TEST PRODUCT");
		expect(output).not.toContain("ALL-FOR-ONE");
		expect(output).not.toContain("PROGRESS");
		expect(output).toContain("plan-mode 2/5");
		expect(output).toContain("ACTIVITY");
		expect(output).toContain("edit");
		expect(output).toContain("read");
		expect(output).toContain("× write");
		expect(output).toContain("✓ find");
		expect(output).toContain("✓ ls");
		expect(output).not.toContain("✓ bash");
		expect(output).toContain("+1 more");
		expect(output).not.toContain("PROJECT");
		expect(output).toContain("CONTEXT / AGENTS");
		expect(output).toContain("SKILLS");
	});

	test("handles absent optional values without inventing metadata", () => {
		const rail = new SessionRailComponent({
			title: "TEST PRODUCT",
			agents: [],
			skills: [],
			lifecycle: { kind: "idle" },
			activeTools: [],
			recentTools: [],
			completedTools: 0,
			failedTools: 0,
			getAvailableHeight: () => 32,
		});

		const output = stripAnsi(rail.render(36).join("\n"));
		expect(output).toContain("Idle");
		expect(output).not.toContain("PROJECT");
		expect(output).toContain("—");
		expect(output).not.toContain("gpt-");
	});

	test("renders the configured shortcut summary in the rail", () => {
		const rail = new SessionRailComponent({
			title: "TEST PRODUCT",
			shortcutSummary: "escape interrupt · ctrl+c/ctrl+d clear/exit · / commands · ! bash · ctrl+o more",
			agents: [],
			skills: [],
			lifecycle: { kind: "idle" },
			activeTools: [],
			recentTools: [],
			completedTools: 0,
			failedTools: 0,
			getAvailableHeight: () => 20,
		});

		const lines = stripAnsi(rail.render(36).join("\n")).split("\n");
		const output = lines.join("\n");
		expect(output).toContain("escape interrupt");
		const rendered = rail.render(36).join("\n");
		expect(rendered).toContain(theme.bold(theme.fg("accent", "escape")));
		expect(rendered).toContain(theme.fg("dim", " interrupt"));
		expect(rendered).toContain(theme.bold(theme.fg("accent", "ctrl+o")));
		expect(lines.slice(-3)).toEqual([
			"  escape interrupt · ctrl+c/ctrl+d",
			"  clear/exit · / commands · ! bash ·",
			"  ctrl+o more",
		]);
	});

	test("preserves progress and activity when the rail is height constrained", () => {
		const rail = new SessionRailComponent({
			title: "TEST PRODUCT",
			agents: ["AGENTS.md"],
			skills: ["one", "two", "three"],
			progress: { label: "plan", completed: 1, total: 3 },
			lifecycle: { kind: "retry", attempt: 2, maxAttempts: 3 },
			activeTools: ["bash"],
			recentTools: [],
			completedTools: 0,
			failedTools: 0,
			getAvailableHeight: () => 8,
		});

		const lines = stripAnsi(rail.render(36).join("\n")).split("\n");
		expect(lines).toHaveLength(8);
		expect(lines.join("\n")).not.toContain("PROGRESS");
		expect(lines.join("\n")).toContain("ACTIVITY");
		expect(lines.join("\n")).toContain("Retrying 2/3");
	});
});

describe("viewport composition", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("anchors a short transcript above a full-width bottom group", () => {
		const content = new Container();
		content.addChild(new Text("short transcript", 0, 0));
		const bottom = new Container();
		bottom.addChild(new Text("EDITOR", 0, 0));
		bottom.addChild(new Text("FOOTER", 0, 0));
		const viewport = new ResponsiveViewport(content, bottom, () => 12);

		const lines = viewport.render(128);
		expect(lines).toHaveLength(12);
		expect(stripAnsi(lines[10] ?? "").trimEnd()).toBe("EDITOR");
		expect(stripAnsi(lines[11] ?? "").trimEnd()).toBe("FOOTER");
		expect(visibleWidth(lines[9] ?? "")).toBe(128 - SESSION_RAIL_MIN_WIDTH);
	});

	test("keeps long transcript content intact and places the bottom group last", () => {
		const content = new Container();
		content.addChild(new Text(Array.from({ length: 20 }, (_, index) => `message ${index + 1}`).join("\n"), 0, 0));
		const bottom = new Container();
		bottom.addChild(new Text("EDITOR", 0, 0));
		bottom.addChild(new Text("FOOTER", 0, 0));
		const viewport = new ResponsiveViewport(content, bottom, () => 12);

		const lines = viewport.render(127);
		expect(lines.slice(-2).map((line) => stripAnsi(line).trimEnd())).toEqual(["EDITOR", "FOOTER"]);
		expect(lines.length).toBeGreaterThan(12);
	});

	test("keeps the passive rail out of the editor and footer rows through resize", async () => {
		const terminal = new VirtualTerminal(128, 12);
		const tui = new TUI(terminal);
		const content = new Container();
		content.addChild(new Text("short transcript", 0, 0));
		const bottom = new Container();
		bottom.addChild(new Text("EDITOR", 0, 0));
		bottom.addChild(new Text("FOOTER", 0, 0));
		const viewport = new ResponsiveViewport(content, bottom, () => terminal.rows);
		const rail = new SessionRailComponent({
			title: "TEST PRODUCT",
			agents: ["AGENTS.md"],
			skills: ["frontend-skill"],
			lifecycle: { kind: "idle" },
			activeTools: [],
			recentTools: [],
			completedTools: 0,
			failedTools: 0,
			getAvailableHeight: () => viewport.getAvailableMainHeight(terminal.columns),
		});

		tui.addChild(viewport);
		for (let railWidth = SESSION_RAIL_MIN_WIDTH; railWidth <= SESSION_RAIL_MAX_WIDTH; railWidth += 1) {
			tui.showOverlay(rail, {
				anchor: "top-right",
				nonCapturing: true,
				visible: (width) => getSessionRailLayout(width).railWidth === railWidth,
				width: railWidth,
			});
		}
		tui.start();
		await terminal.waitForRender();

		let screen = terminal.getViewport();
		expect(screen.some((line) => line.includes("TEST PRODUCT"))).toBe(true);
		expect(screen[10]?.trimEnd()).toBe("EDITOR");
		expect(screen[11]?.trimEnd()).toBe("FOOTER");

		terminal.resize(127, 12);
		await terminal.waitForRender();
		screen = terminal.getViewport();
		expect(screen.some((line) => line.includes("TEST PRODUCT"))).toBe(false);
		expect(screen[10]?.trimEnd()).toBe("EDITOR");
		expect(screen[11]?.trimEnd()).toBe("FOOTER");
		tui.stop();
	});
});
