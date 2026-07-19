import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { applyProductEnvAliases, PRODUCT_ENV_ALIASES } from "../src/allforone/index.ts";

describe("All-For-One environment aliases", () => {
	test("maps every product variable to its Pi-compatible runtime variable", () => {
		const env: Record<string, string | undefined> = {};

		for (const [index, [productName]] of PRODUCT_ENV_ALIASES.entries()) {
			env[productName] = `value-${index}`;
		}

		expect(applyProductEnvAliases(env)).toEqual([]);
		for (const [index, [, compatibilityName]] of PRODUCT_ENV_ALIASES.entries()) {
			expect(env[compatibilityName]).toBe(`value-${index}`);
		}
	});

	test("preserves Pi-compatible variables when no product alias is defined", () => {
		const env = { PI_OFFLINE: "1", PI_TELEMETRY: "0" };

		expect(applyProductEnvAliases(env)).toEqual([]);
		expect(env).toEqual({ PI_OFFLINE: "1", PI_TELEMETRY: "0" });
	});

	test("prefers the product alias and reports a conflict without exposing values", () => {
		const env = { AFO_OFFLINE: "1", PI_OFFLINE: "0" };

		expect(applyProductEnvAliases(env)).toEqual([
			{
				type: "warning",
				message: "Both AFO_OFFLINE and PI_OFFLINE are set with different values; using AFO_OFFLINE.",
			},
		]);
		expect(env.PI_OFFLINE).toBe("1");
	});

	test("does not warn when both variable names contain the same value", () => {
		const env = { AFO_TELEMETRY: "1", PI_TELEMETRY: "1" };

		expect(applyProductEnvAliases(env)).toEqual([]);
		expect(env.PI_TELEMETRY).toBe("1");
	});

	test("treats an explicitly empty product value as defined", () => {
		const env = { AFO_SHARE_VIEWER_URL: "", PI_SHARE_VIEWER_URL: "https://pi.dev/session/" };

		expect(applyProductEnvAliases(env)).toHaveLength(1);
		expect(env.PI_SHARE_VIEWER_URL).toBe("");
	});

	test("does not create reverse aliases", () => {
		const env: Record<string, string | undefined> = { PI_PACKAGE_DIR: "/pi/package" };

		applyProductEnvAliases(env);

		expect(env.AFO_PACKAGE_DIR).toBeUndefined();
	});

	test("normalizes aliases before either CLI loads Pi runtime configuration", () => {
		for (const relativePath of ["../src/cli.ts", "../src/allforone-cli.ts"]) {
			const source = readFileSync(resolve(__dirname, relativePath), "utf8");
			const normalizationIndex = source.indexOf("applyProductEnvAliases()");
			const runtimeImportIndex = source.indexOf('await import("./main.ts")');

			expect(normalizationIndex).toBeGreaterThan(-1);
			expect(runtimeImportIndex).toBeGreaterThan(normalizationIndex);
			expect(source).not.toContain('from "./main.ts"');
		}

		const piEntrypoint = readFileSync(resolve(__dirname, "../src/cli.ts"), "utf8");
		expect(piEntrypoint).not.toContain('from "./config.ts"');
	});
});
