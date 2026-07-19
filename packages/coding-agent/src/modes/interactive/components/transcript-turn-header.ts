import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.ts";
import type { TranscriptTurnRole } from "../transcript-turns.ts";

const USER_LABEL = "YOU";
const ASSISTANT_LABEL = "ALL-FOR-ONE";
const DIVIDER = "─";
const HORIZONTAL_INSET = 1;

function insetLine(content: string, width: number): string {
	const inset = width >= 4 ? HORIZONTAL_INSET : 0;
	const innerWidth = Math.max(0, width - inset * 2);
	const clipped = truncateToWidth(content, innerWidth, "");
	const rightPadding = Math.max(0, width - inset - visibleWidth(clipped));
	return `${" ".repeat(inset)}${clipped}${" ".repeat(rightPadding)}`;
}

export class TranscriptTurnHeaderComponent implements Component {
	readonly role: TranscriptTurnRole;
	readonly turnKey: string;

	constructor(role: TranscriptTurnRole, turnKey: string) {
		this.role = role;
		this.turnKey = turnKey;
	}

	render(width: number): string[] {
		const normalizedWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
		if (normalizedWidth === 0) return [];

		const inset = normalizedWidth >= 4 ? HORIZONTAL_INSET : 0;
		const contentWidth = Math.max(0, normalizedWidth - inset * 2);
		const label = this.role === "user" ? USER_LABEL : ASSISTANT_LABEL;
		const labelColor = this.role === "user" ? "customMessageLabel" : "accent";
		const styledLabel = theme.bold(theme.fg(labelColor, label));
		const labelWidth = visibleWidth(styledLabel);
		const dividerLength = contentWidth - labelWidth - 1;
		const content =
			dividerLength >= 2 ? `${styledLabel} ${theme.fg("borderMuted", DIVIDER.repeat(dividerLength))}` : styledLabel;

		return [" ".repeat(normalizedWidth), insetLine(content, normalizedWidth)];
	}

	invalidate(): void {}
}
