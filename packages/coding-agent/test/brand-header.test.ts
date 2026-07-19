import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { BrandHeaderComponent } from "../src/modes/interactive/components/brand-header.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

describe("interactive product branding", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("bundles the supplied PNG without repeating product identity in the transcript", () => {
		const icon = readFileSync(new URL("../src/modes/interactive/assets/all-for-one.png", import.meta.url));
		expect(Array.from(icon.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
		expect(new BrandHeaderComponent().render(80)).toEqual([]);
	});
});
