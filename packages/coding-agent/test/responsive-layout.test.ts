import { describe, expect, test } from "vitest";
import {
	calculateResponsiveLayout,
	SESSION_RAIL_MAX_WIDTH,
	SESSION_RAIL_MIN_WIDTH,
} from "../src/modes/interactive/responsive-layout.ts";

function expectNormalRegionsDoNotOverlap(layout: ReturnType<typeof calculateResponsiveLayout>): void {
	const normalRegions = [layout.editor, layout.bottomAccessory, layout.footer];
	for (let index = 1; index < normalRegions.length; index += 1) {
		const previous = normalRegions[index - 1]!;
		const current = normalRegions[index]!;
		expect(current.y).toBeGreaterThanOrEqual(previous.y + previous.height);
	}

	expect(layout.transcript.y + layout.transcript.height).toBeLessThanOrEqual(layout.editor.y);
	expect(layout.transcript.width + layout.divider.width + layout.rail.width).toBe(layout.terminal.width);
}

describe("responsive interactive layout", () => {
	test.each([80, 100, 127])("keeps the rail hidden at %i columns", (terminalWidth) => {
		const layout = calculateResponsiveLayout({
			terminalWidth,
			terminalHeight: 24,
			editorHeight: 2,
			footerHeight: 2,
		});

		expect(layout.rail.visible).toBe(false);
		expect(layout.rail.width).toBe(0);
		expect(layout.divider.width).toBe(0);
		expect(layout.transcript.width).toBe(terminalWidth);
		expectNormalRegionsDoNotOverlap(layout);
	});

	test.each([128, 160, 220])("allocates explicit transcript and rail bounds at %i columns", (terminalWidth) => {
		const layout = calculateResponsiveLayout({
			terminalWidth,
			terminalHeight: 24,
			editorHeight: 3,
			bottomAccessoryHeight: 1,
			footerHeight: 2,
		});

		expect(layout.rail.visible).toBe(true);
		expect(layout.rail.width).toBeGreaterThanOrEqual(SESSION_RAIL_MIN_WIDTH);
		expect(layout.rail.width).toBeLessThanOrEqual(SESSION_RAIL_MAX_WIDTH);
		expect(layout.divider.width).toBe(1);
		expect(layout.rail.x).toBe(layout.transcript.width + layout.divider.width);
		expect(layout.transcript.height).toBe(18);
		expectNormalRegionsDoNotOverlap(layout);
	});

	test("changes editor and footer bounds without changing transcript width", () => {
		const first = calculateResponsiveLayout({
			terminalWidth: 128,
			terminalHeight: 20,
			editorHeight: 2,
			footerHeight: 2,
		});
		const second = calculateResponsiveLayout({
			terminalWidth: 128,
			terminalHeight: 20,
			editorHeight: 5,
			bottomAccessoryHeight: 2,
			footerHeight: 3,
		});

		expect(second.transcript.width).toBe(first.transcript.width);
		expect(second.transcript.height).toBe(first.transcript.height - 6);
		expect(second.editor.height).toBe(5);
		expect(second.footer.height).toBe(3);
		expectNormalRegionsDoNotOverlap(second);
	});

	test("honors explicit rail visibility while keeping the default threshold centralized", () => {
		const disabled = calculateResponsiveLayout({
			terminalWidth: 220,
			terminalHeight: 24,
			editorHeight: 2,
			footerHeight: 2,
			railVisible: false,
		});
		const enabled = calculateResponsiveLayout({
			terminalWidth: 128,
			terminalHeight: 24,
			editorHeight: 2,
			footerHeight: 2,
			railVisible: true,
			railWidth: 40,
		});

		expect(disabled.rail.visible).toBe(false);
		expect(disabled.transcript.width).toBe(220);
		expect(enabled.rail.visible).toBe(true);
		expect(enabled.rail.width).toBe(40);
		expect(enabled.transcript.width).toBe(87);
	});

	test("keeps short terminals non-negative and exposes overlay bounds", () => {
		const layout = calculateResponsiveLayout({
			terminalWidth: 2,
			terminalHeight: 1,
			editorHeight: 4,
			bottomAccessoryHeight: 2,
			footerHeight: 3,
			overlayVisible: true,
		});

		for (const region of [
			layout.transcript,
			layout.divider,
			layout.rail,
			layout.editor,
			layout.bottomAccessory,
			layout.footer,
		]) {
			expect(region.x).toBeGreaterThanOrEqual(0);
			expect(region.y).toBeGreaterThanOrEqual(0);
			expect(region.width).toBeGreaterThanOrEqual(0);
			expect(region.height).toBeGreaterThanOrEqual(0);
		}
		expect(layout.overlay).toEqual({ x: 0, y: 0, width: 2, height: 1 });
		expectNormalRegionsDoNotOverlap(layout);
	});
});
