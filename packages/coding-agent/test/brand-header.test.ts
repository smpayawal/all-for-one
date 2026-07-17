import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { APP_TITLE } from "../src/config.ts";
import { BrandHeaderComponent } from "../src/modes/interactive/components/brand-header.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

describe("interactive product branding", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("bundles the supplied PNG and renders the product title", () => {
		const icon = readFileSync(new URL("../src/modes/interactive/assets/all-for-one.png", import.meta.url));
		expect(Array.from(icon.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

		const output = new BrandHeaderComponent()
			.render(80)
			.join("\n")
			.replace(/\u001b\[[0-9;]*m/g, "");
		expect(output).toContain(APP_TITLE);
	});
});
