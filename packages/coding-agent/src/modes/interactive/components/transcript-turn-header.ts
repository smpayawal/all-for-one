import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.ts";
import type { TranscriptTurnRole } from "../transcript-turns.ts";

const USER_LABEL = "YOU";
const ASSISTANT_LABEL = "ALL-FOR-ONE";
const DIVIDER = "─";

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

		const label = this.role === "user" ? USER_LABEL : ASSISTANT_LABEL;
		const labelColor = this.role === "user" ? "userMessageText" : "accent";
		const styledLabel = theme.bold(theme.fg(labelColor, label));
		const labelWidth = visibleWidth(styledLabel);
		const dividerLength = normalizedWidth - labelWidth - 1;
		const content =
			dividerLength >= 2 ? `${styledLabel} ${theme.fg("borderMuted", DIVIDER.repeat(dividerLength))}` : styledLabel;
		const truncated = truncateToWidth(content, normalizedWidth, "");
		return [truncated + " ".repeat(Math.max(0, normalizedWidth - visibleWidth(truncated)))];
	}

	invalidate(): void {}
}
