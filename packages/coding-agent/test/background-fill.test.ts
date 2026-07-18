import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, test } from "vitest";
import { fillBackgroundLine } from "../src/modes/interactive/components/background-fill.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

beforeAll(() => {
	initTheme("dark");
});

describe("semantic background fill", () => {
	test("fills a complete row and restores the outer surface after nested resets", () => {
		const nested = `${theme.bg("userMessageBg", "message")} tail`;
		const rendered = fillBackgroundLine(nested, 24, "toolPendingBg");
		const outerBackground = theme.getBgAnsi("toolPendingBg");

		expect(rendered.startsWith(outerBackground)).toBe(true);
		expect(rendered).toContain(`\x1b[49m${outerBackground}`);
		expect(visibleWidth(rendered)).toBe(24);
		expect(stripAnsi(rendered).trimEnd()).toBe("message tail");
	});

	test("does not alter terminal image protocol rows", () => {
		const image = "\x1b_Ga=T,f=100;AAAA\x1b\\";
		expect(fillBackgroundLine(image, 40, "toolPendingBg")).toBe(image);
	});
});
