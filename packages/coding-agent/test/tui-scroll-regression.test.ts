import { Container, Text, TUI } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, test } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { InteractiveApplicationShell } from "../src/modes/interactive/components/app-shell.ts";
import { SessionRailComponent } from "../src/modes/interactive/components/session-rail.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

class ResettingVirtualTerminal extends VirtualTerminal {
	private screenResetPending = false;

	override start(onInput: (data: string) => void, onResize: () => void): void {
		super.start(onInput, onResize);
		this.clearScreen();
		this.screenResetPending = true;
	}

	consumeScreenReset(): boolean {
		const pending = this.screenResetPending;
		this.screenResetPending = false;
		return pending;
	}
}

describe("TUI scroll regression", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	// The root shell must remain bounded even when a child returns more lines than allocated.
	test("clamps an oversized transcript so the editor and footer remain visible", () => {
		const terminal = new VirtualTerminal(128, 12);
		const tui = new TUI(terminal);
		const transcript = new Container();
		const transcriptText = Array.from({ length: 20 }, (_, index) => `message ${index + 1}`).join("\n");
		transcript.addChild(new Text(transcriptText, 0, 0));
		const shell = new InteractiveApplicationShell({
			tui,
			transcript,
			rail: new Text("RAIL", 0, 0),
			editor: new Text("EDITOR", 0, 0),
			footer: new Text("FOOTER", 0, 0),
			getTerminalHeight: () => terminal.rows,
		});

		const lines = shell.render(terminal.columns);
		expect(lines).toHaveLength(terminal.rows);
		expect(stripAnsi(lines.at(-2) ?? "").trimEnd()).toBe("EDITOR");
		expect(stripAnsi(lines.at(-1) ?? "").trimEnd()).toBe("FOOTER");
		shell.dispose();
	});

	test("renders one product title and one current-status heading in the rail", () => {
		const rail = new SessionRailComponent({
			title: "All-For-One",
			agents: ["AGENTS.md"],
			skills: [],
			lifecycle: { kind: "idle" },
			activeTools: [],
			recentTools: [],
			completedTools: 0,
			failedTools: 0,
			getAvailableHeight: () => 20,
		});

		const output = stripAnsi(rail.render(36).join("\n"));
		expect(output.match(/All-For-One/g)).toHaveLength(1);
		expect(output.match(/NOW/g)).toHaveLength(1);
	});

	test("repaints the complete application after its terminal screen is reset", async () => {
		const terminal = new ResettingVirtualTerminal(128, 12);
		const tui = new TUI(terminal);
		const rail = new SessionRailComponent({
			title: "All-For-One",
			shortcutSummary: "Esc — Interrupt · Ctrl+C / Ctrl+D — Clear / Exit · / — Command",
			agents: ["AGENTS.md"],
			skills: [],
			lifecycle: { kind: "idle" },
			activeTools: [],
			recentTools: [],
			completedTools: 0,
			failedTools: 0,
			getAvailableHeight: () => shell.getAvailableMainHeight(terminal.columns),
		});
		const shell = new InteractiveApplicationShell({
			tui,
			transcript: new Text("TRANSCRIPT", 0, 0),
			rail,
			editor: new Text("EDITOR", 0, 0),
			footer: new Text("FOOTER", 0, 0),
			getTerminalHeight: () => terminal.rows,
		});
		tui.addChild(shell);

		tui.start();
		await terminal.waitForRender();
		tui.stop();
		await terminal.flush();

		tui.start();
		await terminal.waitForRender();
		const screen = stripAnsi(terminal.getViewport().join("\n"));
		expect(screen.match(/All-For-One/g)).toHaveLength(1);
		expect(screen).toContain("EDITOR");
		expect(screen).toContain("FOOTER");
		expect(screen.match(/SHORTCUTS/g)).toHaveLength(1);

		shell.dispose();
		tui.stop();
	});
});
