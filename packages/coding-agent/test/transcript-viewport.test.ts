import { beforeAll, describe, expect, test } from "vitest";
import { Text } from "../../tui/src/components/text.ts";
import { type Component, TUI, visibleWidth } from "../../tui/src/tui.ts";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { InteractiveApplicationShell } from "../src/modes/interactive/components/app-shell.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { parseTranscriptMouseWheel, TranscriptViewport } from "../src/modes/interactive/transcript-viewport.ts";

class MutableTranscript implements Component {
	lines: string[];

	constructor(lines: string[]) {
		this.lines = lines;
	}

	render(_width: number): string[] {
		return [...this.lines];
	}

	invalidate(): void {}
}

describe("transcript viewport", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("renders only the allocated rows and preserves a detached historical top", () => {
		const content = new MutableTranscript(Array.from({ length: 20 }, (_, index) => `row ${index + 1}`));
		const viewport = new TranscriptViewport({ content, getViewportHeight: () => 5 });

		expect(viewport.render(40)).toEqual(["row 16", "row 17", "row 18", "row 19", "row 20"]);

		viewport.pageUp();
		expect(viewport.render(40)).toEqual(["row 13", "row 14", "row 15", "row 16", "row 17"]);

		content.lines.push("row 21");
		const detached = viewport.render(40);
		expect(detached.slice(0, 4)).toEqual(["row 13", "row 14", "row 15", "row 16"]);
		expect(detached[4]).toContain("1 new updates");
		expect(viewport.getState()).toMatchObject({ followLatest: false, unseenUpdates: 1, scrollTop: 12 });

		viewport.end();
		expect(viewport.render(40)).toEqual(["row 17", "row 18", "row 19", "row 20", "row 21"]);
		expect(viewport.getState()).toMatchObject({ followLatest: true, unseenUpdates: 0, scrollTop: 16 });
	});

	test("keeps short and empty transcripts bounded without duplicate content", () => {
		const content = new MutableTranscript(["short"]);
		const viewport = new TranscriptViewport({ content, getViewportHeight: () => 4 });

		expect(viewport.render(20)).toEqual(["short", "", "", ""]);
		viewport.pageUp();
		viewport.pageDown();
		viewport.end();
		expect(viewport.render(20)).toEqual(["short", "", "", ""]);

		content.lines = [];
		viewport.reset();
		expect(viewport.render(20)).toEqual(["", "", "", ""]);
	});

	test("suppresses unseen output while width changes rewrap the transcript", () => {
		const content = new MutableTranscript(Array.from({ length: 30 }, (_, index) => `row ${index + 1}`));
		const viewport = new TranscriptViewport({ content, getViewportHeight: () => 5 });

		viewport.render(20);
		viewport.pageUp();
		viewport.render(20);
		content.lines = Array.from({ length: 15 }, (_, index) => `rewrapped ${index + 1}`);

		const resized = viewport.render(40);
		expect(resized).toHaveLength(5);
		expect(viewport.getState().unseenUpdates).toBe(0);
		expect(viewport.getState().scrollTop).toBe(10);
	});

	test("handles SGR and legacy wheel events only inside the transcript bounds", () => {
		const content = new MutableTranscript(Array.from({ length: 20 }, (_, index) => `row ${index + 1}`));
		const viewport = new TranscriptViewport({ content, getViewportHeight: () => 5 });
		viewport.render(20);

		expect(parseTranscriptMouseWheel("\x1b[<64;2;3M")).toEqual({ direction: "up", x: 1, y: 2 });
		expect(parseTranscriptMouseWheel("\x1b[<65;2;3M")).toEqual({ direction: "down", x: 1, y: 2 });
		expect(parseTranscriptMouseWheel('\x1b[M`!"')).toEqual({ direction: "up", x: 0, y: 1 });

		expect(viewport.handleMouseWheel("\x1b[<64;2;3M", { x: 0, y: 0, width: 20, height: 5 })).toBe(true);
		expect(viewport.getState().followLatest).toBe(false);
		expect(viewport.handleMouseWheel("\x1b[<65;21;3M", { x: 0, y: 0, width: 20, height: 5 })).toBe(false);
	});

	test("preserves ANSI and wide-character width constraints", () => {
		const content = new MutableTranscript(["\x1b[31m世界 wide content\x1b[0m"]);
		const viewport = new TranscriptViewport({ content, getViewportHeight: () => 3 });

		for (const line of viewport.render(10)) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(10);
		}
	});

	test("renders inside the Phase 1 shell across resize and rail thresholds", async () => {
		const terminal = new VirtualTerminal(80, 8);
		const tui = new TUI(terminal);
		const content = new MutableTranscript(Array.from({ length: 20 }, (_, index) => `row ${index + 1}`));
		let shell: InteractiveApplicationShell;
		const viewport = new TranscriptViewport({
			content,
			getViewportHeight: () => shell.getAvailableMainHeight(),
		});
		shell = new InteractiveApplicationShell({
			tui,
			transcript: viewport,
			rail: new Text("RAIL", 0, 0),
			editor: new Text("EDITOR", 0, 0),
			footer: new Text("FOOTER", 0, 0),
			getTerminalHeight: () => terminal.rows,
		});
		tui.addChild(shell);
		tui.start();

		try {
			await terminal.waitForRender();
			let screen = terminal.getViewport();
			expect(screen.slice(0, 6)).toEqual(["row 15", "row 16", "row 17", "row 18", "row 19", "row 20"]);
			expect(screen.slice(-2).map((line) => line.trimEnd())).toEqual(["EDITOR", "FOOTER"]);

			viewport.pageUp();
			tui.requestRender();
			await terminal.waitForRender();
			screen = terminal.getViewport();
			expect(screen[0]).toBe("row 11");

			content.lines.push("row 21");
			tui.requestRender();
			await terminal.waitForRender();
			screen = terminal.getViewport();
			expect(screen.some((line) => line.includes("new updates"))).toBe(true);
			expect(screen.slice(-2).map((line) => line.trimEnd())).toEqual(["EDITOR", "FOOTER"]);

			terminal.resize(128, 8);
			await terminal.waitForRender();
			screen = terminal.getViewport();
			expect(shell.getLayout().rail.visible).toBe(true);
			expect(screen.slice(-2).map((line) => line.trimEnd())).toEqual(["EDITOR", "FOOTER"]);
			expect(screen.some((line) => line.includes("RAIL"))).toBe(true);
		} finally {
			shell.dispose();
			tui.stop();
		}
	});

	test("keeps rendered regions bounded at representative sizes in both built-in themes", async () => {
		const terminal = new VirtualTerminal(80, 8);
		const tui = new TUI(terminal);
		const content = new MutableTranscript(Array.from({ length: 80 }, (_, index) => `row ${index + 1}`));
		let shell: InteractiveApplicationShell;
		const viewport = new TranscriptViewport({
			content,
			getViewportHeight: () => shell.getAvailableMainHeight(),
		});
		shell = new InteractiveApplicationShell({
			tui,
			transcript: viewport,
			rail: new Text("RAIL", 0, 0),
			editor: new Text("EDITOR", 0, 0),
			footer: new Text("FOOTER", 0, 0),
			getTerminalHeight: () => terminal.rows,
		});
		tui.addChild(shell);
		tui.start();

		try {
			for (const themeName of ["dark", "light"] as const) {
				initTheme(themeName);
				for (const [width, height] of [
					[80, 8],
					[100, 12],
					[127, 24],
					[128, 12],
					[160, 12],
					[220, 24],
				] as const) {
					terminal.resize(width, height);
					await terminal.waitForRender();

					const layout = shell.getLayout();
					const screen = terminal.getViewport();
					expect(screen).toHaveLength(height);
					expect(layout.transcript.width + layout.divider.width + layout.rail.width).toBe(width);
					expect(layout.editor.y).toBe(layout.transcript.height);
					expect(layout.footer.y).toBe(layout.bottomAccessory.y + layout.bottomAccessory.height);
					expect(layout.footer.y + layout.footer.height).toBe(height);
					expect(layout.rail.height).toBe(layout.transcript.height);
					expect(layout.rail.visible).toBe(width >= 128);
					expect(screen.some((line) => line.includes("EDITOR"))).toBe(true);
					expect(screen.some((line) => line.includes("FOOTER"))).toBe(true);
					expect(screen.some((line) => line.includes("RAIL"))).toBe(width >= 128);

					for (const line of screen) {
						expect(visibleWidth(line)).toBeLessThanOrEqual(width);
						expect(line).not.toContain("\x1b");
					}
				}
			}
		} finally {
			initTheme("dark");
			shell.dispose();
			tui.stop();
		}
	});
});
