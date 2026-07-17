import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_TITLE } from "../src/config.ts";
import { applyExportBranding } from "../src/core/export-html/branding.ts";

describe("export HTML product identity", () => {
	it("uses the All-For-One title and bundled icon", () => {
		const template = readFileSync(new URL("../src/core/export-html/template.html", import.meta.url), "utf8");
		const html = applyExportBranding(template);

		expect(html).toContain(`<title>${APP_TITLE} Session</title>`);
		expect(html).toContain(`<span class="brand-name">${APP_TITLE}</span>`);
		expect(html).toContain('<link rel="icon" type="image/png" href="data:image/png;base64,');
		expect(html).toContain('<img class="brand-icon" src="data:image/png;base64,');
		expect(html).not.toContain("<title>Session Export</title>");
	});
});
