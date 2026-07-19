import { TUI, visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, test } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import { CustomEditor } from "../src/modes/interactive/components/custom-editor.ts";
import { getEditorTheme, initTheme } from "../src/modes/interactive/theme/theme.ts";

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

describe("editor visual foundation", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("renders a width-bounded prompt and purpose in the empty editor", () => {
		const terminal = new VirtualTerminal(80, 24);
		const tui = new TUI(terminal);
		const editor = new CustomEditor(tui, getEditorTheme(), KeybindingsManager.create());
		const lines = editor.render(80);
		const content = stripAnsi(lines[1] ?? "");

		expect(content).toContain("›");
		expect(content).toContain("Ask All-For-One to inspect, change, or verify the repository");
		for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(80);
	});
});
