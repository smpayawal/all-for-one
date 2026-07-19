import { Container, Text, TUI } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, test } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { InteractiveApplicationShell } from "../src/modes/interactive/components/app-shell.ts";
import { SessionRailComponent } from "../src/modes/interactive/components/session-rail.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

describe("TUI scroll regression", () => {
	beforeAll(() => {
		initTheme("dark");
	});

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
});
