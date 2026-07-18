import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import {
	getAvailableThemes,
	initTheme,
	loadThemeFromPath,
	setRegisteredThemes,
} from "../src/modes/interactive/theme/theme.ts";

const AFO_MIDNIGHT_PATH = fileURLToPath(new URL("../theme/afo-midnight.json", import.meta.url));
const CATPPUCCIN_MOCHA_PATH = fileURLToPath(new URL("../theme/catppuccin-mocha.json", import.meta.url));
const PACKAGE_JSON_PATH = fileURLToPath(new URL("../package.json", import.meta.url));

afterAll(() => {
	setRegisteredThemes([]);
	initTheme("dark");
});

describe("bundled All-For-One themes", () => {
	test("loads and registers both packaged theme resources", () => {
		const themes = [loadThemeFromPath(AFO_MIDNIGHT_PATH), loadThemeFromPath(CATPPUCCIN_MOCHA_PATH)];
		setRegisteredThemes(themes);

		expect(themes.map((theme) => theme.name)).toEqual(["AFO Midnight", "Catppuccin Mocha"]);
		expect(getAvailableThemes()).toEqual(expect.arrayContaining(["AFO Midnight", "Catppuccin Mocha"]));
	});

	test("declares the theme resource directory in package metadata", () => {
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
			pi?: { themes?: string[] };
			files?: string[];
		};

		expect(packageJson.pi?.themes).toContain("theme");
		expect(packageJson.files).toContain("theme");
	});
});
