import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import {
	getAvailableThemes,
	getResolvedThemeColors,
	getThemeByName,
	initTheme,
	loadThemeFromPath,
	resolveThemeSetting,
	setRegisteredThemes,
} from "../src/modes/interactive/theme/theme.ts";

const TOKYO_NIGHT_PATH = fileURLToPath(new URL("../theme/tokyonight.json", import.meta.url));
const PACKAGE_JSON_PATH = fileURLToPath(new URL("../package.json", import.meta.url));

const PACKAGED_THEME_PATHS = [TOKYO_NIGHT_PATH];

const EXPECTED_PACKAGED_THEME_NAMES = ["tokyonight"];

function channelToLinear(channel: number): number {
	const value = channel / 255;
	return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
	const normalized = hex.replace("#", "");
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function contrast(foreground: string, background: string): number {
	const lighter = Math.max(luminance(foreground), luminance(background));
	const darker = Math.min(luminance(foreground), luminance(background));
	return (lighter + 0.05) / (darker + 0.05);
}

function registerPackagedThemes(): void {
	setRegisteredThemes(PACKAGED_THEME_PATHS.map((themePath) => loadThemeFromPath(themePath)));
}

afterAll(() => {
	setRegisteredThemes([]);
	initTheme("dark");
});

describe("bundled All-For-One themes", () => {
	test("loads and registers every packaged theme resource", () => {
		const themes = PACKAGED_THEME_PATHS.map((themePath) => loadThemeFromPath(themePath));
		setRegisteredThemes(themes);

		expect(themes.map((theme) => theme.name)).toEqual(EXPECTED_PACKAGED_THEME_NAMES);
		expect(getAvailableThemes()).toEqual(expect.arrayContaining(["dark", ...EXPECTED_PACKAGED_THEME_NAMES]));
		expect(getAvailableThemes()).not.toContain("light");
	});

	test("declares the theme resource directory in package metadata", () => {
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
			pi?: { themes?: string[] };
			files?: string[];
		};

		expect(packageJson.pi?.themes).toContain("theme");
		expect(packageJson.files).toContain("theme");
	});

	test("removes the Light palette and resolves Automatic to remaining themes", () => {
		registerPackagedThemes();
		expect(getAvailableThemes()).not.toContain("light");
		expect(getThemeByName("light")).toBeUndefined();
		expect(resolveThemeSetting("tokyonight/dark", "light")).toBe("tokyonight");
		expect(resolveThemeSetting("tokyonight/dark", "dark")).toBe("dark");
		expect(resolveThemeSetting("light/dark", "light")).toBe("dark");
		expect(resolveThemeSetting("light/tokyonight", "dark")).toBe("tokyonight");
		expect(resolveThemeSetting("light/GitHub Dark", "light")).toBe("dark");
	});

	test.each(["dark", "tokyonight"])(
		"keeps %s workspace, result, and tool surfaces readable and distinct",
		(themeName) => {
			registerPackagedThemes();
			const colors = getResolvedThemeColors(themeName);
			const workspace = colors.customMessageBg;
			const result = colors.selectedBg;
			const semanticSurfaces = [
				colors.userMessageBg,
				result,
				colors.toolPendingBg,
				colors.toolSuccessBg,
				colors.toolErrorBg,
			];

			expect(contrast(colors.text, workspace)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(colors.text, result)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(colors.muted, workspace)).toBeGreaterThanOrEqual(3);
			expect(result).not.toBe(workspace);
			expect(new Set(semanticSurfaces).size).toBeGreaterThanOrEqual(4);
		},
	);
});
