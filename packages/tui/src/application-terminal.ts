import { ProcessTerminal as InlineProcessTerminal } from "./terminal.ts";

const APPLICATION_SCREEN_ENTER_SEQUENCE = "\x1b[?1049h\x1b[?1000h\x1b[?1006h";
const APPLICATION_SCREEN_EXIT_SEQUENCE = "\x1b[?1006l\x1b[?1000l\x1b[?1049l";

function isApplicationScreenEnabled(): boolean {
	return process.env.PI_TUI_ALTERNATE_SCREEN === "1";
}

/**
 * Process terminal with an opt-in application screen.
 *
 * The standard `ProcessTerminal` remains inline. All-For-One enables this
 * wrapper through its CLI so native Pi-compatible consumers keep their
 * existing scrollback behavior. The application screen owns mouse reporting
 * for its complete lifetime so terminal or tmux scrollback cannot compete with
 * the transcript viewport during startup, suspend/resume, or editor handoff.
 * Entering the application screen reports a one-shot reset signal so the TUI
 * can rebuild its physical frame; stopping restores the shell's original
 * screen buffer and mouse behavior.
 */
export class ProcessTerminal extends InlineProcessTerminal {
	private alternateScreenActive = false;
	private screenResetPending = false;

	enterAlternateScreen(): void {
		if (!isApplicationScreenEnabled() || this.alternateScreenActive) return;
		this.write(APPLICATION_SCREEN_ENTER_SEQUENCE);
		this.alternateScreenActive = true;
		this.screenResetPending = true;
	}

	consumeScreenReset(): boolean {
		const pending = this.screenResetPending;
		this.screenResetPending = false;
		return pending;
	}

	exitAlternateScreen(): void {
		if (!this.alternateScreenActive) return;
		this.write(APPLICATION_SCREEN_EXIT_SEQUENCE);
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
