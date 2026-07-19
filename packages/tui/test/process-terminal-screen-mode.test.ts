import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { ProcessTerminal } from "../src/application-terminal.ts";

const originalAlternateScreen = process.env.PI_TUI_ALTERNATE_SCREEN;

const APPLICATION_SCREEN_ENTER_SEQUENCE = "\x1b[?1049h\x1b[?7l";
const APPLICATION_SCREEN_EXIT_SEQUENCE = "\x1b[?7h\x1b[?1049l";

afterEach(() => {
	if (originalAlternateScreen === undefined) {
		delete process.env.PI_TUI_ALTERNATE_SCREEN;
	} else {
		process.env.PI_TUI_ALTERNATE_SCREEN = originalAlternateScreen;
	}
});

describe("ProcessTerminal alternate screen mode", () => {
	it("owns the application screen and disables terminal autowrap while active", () => {
		const writes: string[] = [];
		const previousWrite = process.stdout.write;
		process.env.PI_TUI_ALTERNATE_SCREEN = "1";
		process.stdout.write = ((chunk: string | Uint8Array) => {
			writes.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;

		try {
			const terminal = new ProcessTerminal();
			terminal.enterAlternateScreen();
			terminal.enterAlternateScreen();
			assert.equal(terminal.consumeScreenReset(), true);
			assert.equal(terminal.consumeScreenReset(), false);
			terminal.exitAlternateScreen();
			terminal.exitAlternateScreen();
			terminal.enterAlternateScreen();
			assert.equal(terminal.consumeScreenReset(), true);
			terminal.exitAlternateScreen();

			assert.deepEqual(writes, [
				APPLICATION_SCREEN_ENTER_SEQUENCE,
				APPLICATION_SCREEN_EXIT_SEQUENCE,
				APPLICATION_SCREEN_ENTER_SEQUENCE,
				APPLICATION_SCREEN_EXIT_SEQUENCE,
			]);
		} finally {
			process.stdout.write = previousWrite;
		}
	});

	it("preserves inline terminal behavior when the product opt-in is absent", () => {
		const writes: string[] = [];
		const previousWrite = process.stdout.write;
		delete process.env.PI_TUI_ALTERNATE_SCREEN;
		process.stdout.write = ((chunk: string | Uint8Array) => {
			writes.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;

		try {
			const terminal = new ProcessTerminal();
			terminal.enterAlternateScreen();
			terminal.exitAlternateScreen();

			assert.equal(terminal.consumeScreenReset(), false);
			assert.deepEqual(writes, []);
		} finally {
			process.stdout.write = previousWrite;
		}
	});
});
