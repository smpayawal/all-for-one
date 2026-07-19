import { beforeAll, describe, expect, test } from "vitest";
import { visibleWidth } from "../../tui/src/tui.ts";
import { TranscriptTurnHeaderComponent } from "../src/modes/interactive/components/transcript-turn-header.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

describe("transcript turn headers", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test.each([
		[80, "YOU"],
		[100, "ALL-FOR-ONE"],
		[160, "YOU"],
		[220, "ALL-FOR-ONE"],
	] as const)("renders a spaced, inset labelled divider at %i columns", (width, label) => {
		const header = new TranscriptTurnHeaderComponent(label === "YOU" ? "user" : "assistant", "turn-1");
		const [gap, line] = header.render(width);

		expect(gap.trim()).toBe("");
		expect(stripAnsi(line)).toContain(` ${label}`);
		expect(stripAnsi(line)).toContain("─");
		expect(visibleWidth(gap)).toBe(width);
		expect(visibleWidth(line)).toBe(width);
	});

	test("falls back to truncated label-only output when a divider cannot fit", () => {
		const header = new TranscriptTurnHeaderComponent("assistant", "turn-1");
		const [, line] = header.render(12);

		expect(stripAnsi(line)).toContain("ALL-FOR-ON");
		expect(stripAnsi(line)).not.toContain("─");
		expect(visibleWidth(line)).toBe(12);
	});

	test("never produces negative widths or overflow", () => {
		const header = new TranscriptTurnHeaderComponent("user", "turn-1");

		for (const width of [0, 1, 2, 3, 4, 5, 11, 12, 13]) {
			const lines = header.render(width);
			expect(lines.length).toBe(width === 0 ? 0 : 2);
			for (const line of lines) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(width);
			}
		}
	});

	test("keeps stable presentation identity separate from its visible label", () => {
		const header = new TranscriptTurnHeaderComponent("assistant", "session-entry-42");
		expect(header.turnKey).toBe("session-entry-42");
		expect(stripAnsi(header.render(40)[1] ?? "")).toContain("ALL-FOR-ONE");
	});
});
