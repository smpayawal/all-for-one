import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { formatProductVersion, PRODUCT, rewriteProductCommandInHelp } from "../src/product.ts";

describe("All-For-One product identity", () => {
	test("uses an independent product version with an explicit Pi baseline", () => {
		expect(formatProductVersion()).toBe("All-For-One 0.1.0 (Pi base 0.80.10)");
		expect(PRODUCT.repository).toBe("https://github.com/smpayawal/all-for-one");
		expect(PRODUCT.aliases).toEqual(["afo", "pi"]);
	});

	test("keeps product metadata and package command aliases aligned", () => {
		const rootPackage = JSON.parse(readFileSync(resolve(__dirname, "../../../package.json"), "utf8")) as {
			name: string;
			version: string;
		};
		const codingAgentPackage = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8")) as {
			version: string;
			bin: Record<string, string>;
			piConfig: { configDir: string };
		};

		expect(rootPackage.name).toBe("all-for-one-monorepo");
		expect(rootPackage.version).toBe(PRODUCT.version);
		expect(codingAgentPackage.version).toBe(PRODUCT.upstream.version);
		expect(codingAgentPackage.bin).toEqual({
			allforone: "dist/allforone-cli.js",
			afo: "dist/allforone-cli.js",
			pi: "dist/cli.js",
		});
		expect(codingAgentPackage.piConfig.configDir).toBe(".pi");
	});

	test("rewrites help command examples without renaming Pi compatibility identifiers", () => {
		const help = [
			"All-For-One",
			"",
			"Usage:",
			"  pi [options]",
			"  pi update [source|self|pi]",
			"  PI_OFFLINE - Disable startup network operations",
		].join("\n");

		const rewritten = rewriteProductCommandInHelp(help);

		expect(rewritten).toContain("  allforone [options]");
		expect(rewritten).toContain("  allforone update [source|self|pi]");
		expect(rewritten).toContain("PI_OFFLINE");
	});
});
