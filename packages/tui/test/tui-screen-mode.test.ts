import assert from "node:assert";
import { describe, it } from "node:test";
import { TUI } from "../src/tui.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

class ApplicationScreenTerminal extends VirtualTerminal {
	enterCalls = 0;
	exitCalls = 0;

	enterAlternateScreen(): void {
		this.enterCalls += 1;
	}

	exitAlternateScreen(): void {
		this.exitCalls += 1;
	}
}

describe("TUI application screen lifecycle", () => {
	it("enters the application screen on start and restores the shell screen on stop", () => {
		const terminal = new ApplicationScreenTerminal(80, 24);
		const tui = new TUI(terminal);

		tui.start();
		assert.equal(terminal.enterCalls, 1);

		tui.stop();
		assert.equal(terminal.exitCalls, 1);
	});
});
