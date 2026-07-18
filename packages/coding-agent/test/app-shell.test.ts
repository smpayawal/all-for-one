import { beforeAll, describe, expect, test } from "vitest";
import { Text } from "../../tui/src/components/text.ts";
import { type Component, Container, TUI } from "../../tui/src/tui.ts";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { InteractiveApplicationShell } from "../src/modes/interactive/components/app-shell.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

class RecordingComponent implements Component {
	readonly renderedWidths: number[] = [];
	private readonly lines: string[];

	constructor(lines: string[]) {
		this.lines = lines;
	}

	render(width: number): string[] {
		this.renderedWidths.push(width);
		return this.lines;
	}

	invalidate(): void {}
}

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

async function renderAndFlush(tui: TUI, terminal: VirtualTerminal): Promise<void> {
	tui.requestRender(true);
	await terminal.waitForRender();
}

function createShell(
	tui: TUI,
	terminal: VirtualTerminal,
): {
	shell: InteractiveApplicationShell;
	transcript: RecordingComponent;
	editor: RecordingComponent;
	footer: RecordingComponent;
} {
	const transcript = new RecordingComponent(["TRANSCRIPT"]);
	const rail = new Text("RAIL", 0, 0);
	const editor = new RecordingComponent(["EDITOR"]);
	const footer = new RecordingComponent(["FOOTER"]);
	const shell = new InteractiveApplicationShell({
		tui,
		transcript,
		rail,
		editor,
		footer,
		getTerminalHeight: () => terminal.rows,
	});
	return { shell, transcript, editor, footer };
}

describe("interactive application shell", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("composes transcript, editor, and footer through explicit allocated regions", () => {
		const terminal = new VirtualTerminal(128, 12);
		const tui = new TUI(terminal);
		const { shell, transcript, editor, footer } = createShell(tui, terminal);

		const lines = shell.render(128);
		const layout = shell.getLayout();

		expect(layout.transcript.width).toBe(91);
		expect(layout.rail.visible).toBe(true);
		expect(layout.editor.y).toBe(10);
		expect(layout.footer.y).toBe(11);
		expect(transcript.renderedWidths).toContain(91);
		expect(editor.renderedWidths).toContain(128);
		expect(footer.renderedWidths).toContain(128);
		expect(lines.slice(-2).map((line) => stripAnsi(line).trimEnd())).toEqual(["EDITOR", "FOOTER"]);
		shell.dispose();
	});

	test("keeps the rail passive while modal overlays remain above the shell", async () => {
		const terminal = new VirtualTerminal(127, 12);
		const tui = new TUI(terminal);
		const { shell } = createShell(tui, terminal);
		tui.addChild(shell);
		tui.start();

		try {
			await renderAndFlush(tui, terminal);
			let screen = terminal.getViewport();
			expect(screen.some((line) => line.includes("RAIL"))).toBe(false);

			terminal.resize(128, 12);
			await terminal.waitForRender();
			screen = terminal.getViewport();
			expect(screen.some((line) => line.includes("RAIL"))).toBe(true);
			expect(screen.at(-2)?.trimEnd()).toBe("EDITOR");
			expect(screen.at(-1)?.trimEnd()).toBe("FOOTER");

			const overlay = new Text("DIALOG", 0, 0);
			tui.showOverlay(overlay, { anchor: "center", width: 20 });
			await renderAndFlush(tui, terminal);
			screen = terminal.getViewport();
			expect(screen.some((line) => line.includes("DIALOG"))).toBe(true);

			terminal.resize(127, 12);
			await terminal.waitForRender();
			screen = terminal.getViewport();
			expect(screen.some((line) => line.includes("RAIL"))).toBe(false);
			expect(screen.some((line) => line.includes("DIALOG"))).toBe(true);
		} finally {
			shell.dispose();
			tui.stop();
		}
	});

	test("preserves bottom ordering with a below-editor extension widget", () => {
		const terminal = new VirtualTerminal(80, 8);
		const tui = new TUI(terminal);
		const transcript = new Container();
		transcript.addChild(new Text("TRANSCRIPT", 0, 0));
		const shell = new InteractiveApplicationShell({
			tui,
			transcript,
			rail: new Text("RAIL", 0, 0),
			editor: new Text("EDITOR", 0, 0),
			bottomAccessory: new Text("WIDGET", 0, 0),
			footer: new Text("FOOTER", 0, 0),
			getTerminalHeight: () => terminal.rows,
		});

		const lines = shell.render(80).map((line) => stripAnsi(line).trimEnd());
		expect(lines.slice(-3)).toEqual(["EDITOR", "WIDGET", "FOOTER"]);
		expect(shell.getLayout().bottomAccessory.y).toBe(6);
		expect(shell.getLayout().footer.y).toBe(7);
		shell.dispose();
	});
});
