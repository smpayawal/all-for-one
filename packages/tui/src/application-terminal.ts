import { ProcessTerminal as InlineProcessTerminal } from "./terminal.ts";

const ALTERNATE_SCREEN_ENTER_SEQUENCE = "\x1b[?1049h";
const ALTERNATE_SCREEN_EXIT_SEQUENCE = "\x1b[?1049l";

function isApplicationScreenEnabled(): boolean {
	return process.env.PI_TUI_ALTERNATE_SCREEN === "1";
}

/**
 * Process terminal with an opt-in application screen.
 *
 * The standard `ProcessTerminal` remains inline. All-For-One enables this
 * wrapper through its CLI so native Pi-compatible consumers keep their
 * existing scrollback behavior.
 */
export class ProcessTerminal extends InlineProcessTerminal {
	private alternateScreenActive = false;

	enterAlternateScreen(): void {
		if (!isApplicationScreenEnabled() || this.alternateScreenActive) return;
		this.write(ALTERNATE_SCREEN_ENTER_SEQUENCE);
		this.alternateScreenActive = true;
	}

	exitAlternateScreen(): void {
		if (!this.alternateScreenActive) return;
		this.write(ALTERNATE_SCREEN_EXIT_SEQUENCE);
		this.alternateScreenActive = false;
	}

	override start(onInput: (data: string) => void, onResize: () => void): void {
		this.enterAlternateScreen();
		try {
			super.start(onInput, onResize);
		} catch (error) {
			this.exitAlternateScreen();
			throw error;
		}
	}

	override stop(): void {
		try {
			super.stop();
		} finally {
			this.exitAlternateScreen();
		}
	}
}
