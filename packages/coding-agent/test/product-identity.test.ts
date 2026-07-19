import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { formatProductVersion, PRODUCT, rewriteProductCommandInHelp } from "../src/allforone/index.ts";

function runProductCli(...args: string[]) {
	const cliPath = resolve(__dirname, "../dist/allforone-cli.js");
	expect(existsSync(cliPath)).toBe(true);
	return spawnSync(process.execPath, [cliPath, ...args], {
		cwd: resolve(__dirname, "../../.."),
		encoding: "utf8",
		env: {
			...process.env,
			AFO_OFFLINE: "1",
		},
	});
}

describe("All-For-One product identity", () => {
	test("uses an independent product version with an explicit Pi baseline", () => {
		expect(formatProductVersion()).toBe(`All-For-One ${PRODUCT.version} (Pi base ${PRODUCT.upstream.version})`);
		expect(PRODUCT.upstream.version).toBe("0.80.10");
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

	test("keeps product identity in the All-For-One-owned source boundary", () => {
		expect(existsSync(resolve(__dirname, "../src/allforone/product.ts"))).toBe(true);
		expect(existsSync(resolve(__dirname, "../src/product.ts"))).toBe(false);
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

	test("fails closed instead of using Pi's self-update channel", () => {
		const result = runProductCli("update", "--self");
		const output = `${result.stdout}\n${result.stderr}`;

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("All-For-One cannot self-update this installation yet.");
		expect(result.stderr).toContain(`${PRODUCT.repository}/releases/latest`);
		expect(output).not.toContain("Could not determine latest pi version");
		expect(output).not.toContain("earendil-works/pi-mono/releases");
	});

	test("shows All-For-One-specific update help", () => {
		const result = runProductCli("update", "--help");

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("Update All-For-One, installed packages, or model catalogs.");
		expect(result.stdout).toContain("Update All-For-One only");
		expect(result.stdout).not.toContain("Update pi");
	});
});
