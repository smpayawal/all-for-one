import assert from "node:assert";
import { describe, it } from "node:test";
import { ProcessTerminal } from "../src/terminal.ts";

describe("ProcessTerminal alternate screen mode", () => {
	it("enters and exits the alternate screen exactly once when enabled", () => {
		const writes: string[] = [];
		const previousWrite = process.stdout.write;
		process.stdout.write = ((chunk: string | Uint8Array) => {
			writes.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;

		try {
			const terminal = new ProcessTerminal({ alternateScreen: true });
			terminal.enterAlternateScreen();
			terminal.enterAlternateScreen();
			terminal.exitAlternateScreen();
			terminal.exitAlternateScreen();

			assert.deepEqual(writes, ["\x1b[?1049h", "\x1b[?1049l"]);
		} finally {
			process.stdout.write = previousWrite;
		}
	});

	it("preserves inline terminal behavior by default", () => {
		const writes: string[] = [];
		const previousWrite = process.stdout.write;
		process.stdout.write = ((chunk: string | Uint8Array) => {
			writes.push(String(chunk));
			return true;
		}) as typeof process.stdout.write;

		try {
			const terminal = new ProcessTerminal();
			terminal.enterAlternateScreen();
			terminal.exitAlternateScreen();

			assert.deepEqual(writes, []);
		} finally {
			process.stdout.write = previousWrite;
		}
	});
});
