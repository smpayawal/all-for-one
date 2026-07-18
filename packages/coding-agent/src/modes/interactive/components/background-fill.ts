import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { type ThemeBg, theme } from "../theme/theme.ts";

const BACKGROUND_RESET = "\x1b[49m";
const KITTY_IMAGE_PREFIX = "\x1b_G";
const ITERM_IMAGE_PREFIX = "\x1b]1337;File=";

function isTerminalImageLine(line: string): boolean {
	return line.includes(KITTY_IMAGE_PREFIX) || line.includes(ITERM_IMAGE_PREFIX);
}

/**
 * Fill one terminal row with a semantic background while preserving nested
 * component background resets. Image protocol rows are left untouched.
 */
export function fillBackgroundLine(line: string, width: number, background: ThemeBg): string {
	const normalizedWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
	if (normalizedWidth === 0) return "";
	if (isTerminalImageLine(line)) return line;

	const truncated = truncateToWidth(line, normalizedWidth, "");
	const backgroundAnsi = theme.getBgAnsi(background);
	const restored = truncated.split(BACKGROUND_RESET).join(`${BACKGROUND_RESET}${backgroundAnsi}`);
	const padding = " ".repeat(Math.max(0, normalizedWidth - visibleWidth(truncated)));
	return `${backgroundAnsi}${restored}${padding}${BACKGROUND_RESET}`;
}

export function fillBackgroundLines(lines: readonly string[], width: number, background: ThemeBg): string[] {
	return lines.map((line) => fillBackgroundLine(line, width, background));
}
