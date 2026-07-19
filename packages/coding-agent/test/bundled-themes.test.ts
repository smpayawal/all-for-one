import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import {
	getAvailableThemes,
	getResolvedThemeColors,
	initTheme,
	loadThemeFromPath,
	resolveThemeSetting,
	setRegisteredThemes,
} from "../src/modes/interactive/theme/theme.ts";

const AFO_MIDNIGHT_PATH = fileURLToPath(new URL("../theme/afo-midnight.json", import.meta.url));
const CATPPUCCIN_MOCHA_PATH = fileURLToPath(new URL("../theme/catppuccin-mocha.json", import.meta.url));
const TOKYO_NIGHT_PATH = fileURLToPath(new URL("../theme/tokyonight.json", import.meta.url));
const PACKAGE_JSON_PATH = fileURLToPath(new URL("../package.json", import.meta.url));

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
	setRegisteredThemes([
		loadThemeFromPath(AFO_MIDNIGHT_PATH),
		loadThemeFromPath(CATPPUCCIN_MOCHA_PATH),
		loadThemeFromPath(TOKYO_NIGHT_PATH),
	]);
}

afterAll(() => {
	setRegisteredThemes([]);
	initTheme("dark");
});

describe("bundled All-For-One themes", () => {
	test("loads and registers every packaged theme resource", () => {
		const themes = [
			loadThemeFromPath(AFO_MIDNIGHT_PATH),
			loadThemeFromPath(CATPPUCCIN_MOCHA_PATH),
			loadThemeFromPath(TOKYO_NIGHT_PATH),
		];
		setRegisteredThemes(themes);

		expect(themes.map((theme) => theme.name)).toEqual(["AFO Midnight", "Catppuccin Mocha", "tokyonight"]);
		expect(getAvailableThemes()).toEqual(
			expect.arrayContaining(["dark", "light", "AFO Midnight", "Catppuccin Mocha", "tokyonight"]),
		);
	});

	test("declares the theme resource directory in package metadata", () => {
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
			pi?: { themes?: string[] };
			files?: string[];
		};

		expect(packageJson.pi?.themes).toContain("theme");
		expect(packageJson.files).toContain("theme");
	});

	test("resolves Automatic to the corrected light or dark palette", () => {
		expect(resolveThemeSetting("light/dark", "light")).toBe("light");
		expect(resolveThemeSetting("light/dark", "dark")).toBe("dark");
	});

	test.each(["dark", "light", "AFO Midnight", "Catppuccin Mocha", "tokyonight"])(
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
