import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import {
	getAvailableThemes,
	getResolvedThemeColors,
	getThemeByName,
	initTheme,
	normalizeThemeSetting,
	resolveThemeSetting,
	setTheme,
} from "../src/modes/interactive/theme/theme.ts";

const DARK_PATH = fileURLToPath(new URL("../src/modes/interactive/theme/dark.json", import.meta.url));
const LIGHT_PATH = fileURLToPath(new URL("../src/modes/interactive/theme/light.json", import.meta.url));
const PACKAGE_JSON_PATH = fileURLToPath(new URL("../package.json", import.meta.url));
const REMOVED_PACKAGE_THEME_DIRECTORY = fileURLToPath(new URL("../theme", import.meta.url));

afterAll(() => {
	initTheme("dark");
});

describe("native Pi themes", () => {
	test("ships the original dark and light palettes", () => {
		const dark = JSON.parse(readFileSync(DARK_PATH, "utf8")) as {
			name: string;
			vars: Record<string, string>;
			export: Record<string, string>;
		};
		const light = JSON.parse(readFileSync(LIGHT_PATH, "utf8")) as {
			name: string;
			vars: Record<string, string>;
			export: Record<string, string>;
		};

		expect(dark).toMatchObject({
			name: "dark",
			vars: {
				cyan: "#00d7ff",
				blue: "#5f87ff",
				text: "#d4d4d4",
				accent: "#8abeb7",
				userMsgBg: "#343541",
			},
			export: { pageBg: "#18181e", cardBg: "#1e1e24", infoBg: "#3c3728" },
		});
		expect(light).toMatchObject({
			name: "light",
			vars: {
				teal: "#5a8080",
				blue: "#547da7",
				text: "#1f2328",
				userMsgBg: "#e8e8e8",
			},
			export: { pageBg: "#f8f8f8", cardBg: "#ffffff", infoBg: "#fffae6" },
		});
	});

	test("lists and switches between both native themes", () => {
		expect(getAvailableThemes()).toEqual(expect.arrayContaining(["dark", "light"]));
		expect(getThemeByName("dark")).toBeDefined();
		expect(getThemeByName("light")).toBeDefined();

		expect(setTheme("light").success).toBe(true);
		expect(getResolvedThemeColors("light")).toMatchObject({ text: "#1f2328", userMessageBg: "#e8e8e8" });
		expect(setTheme("dark").success).toBe(true);
		expect(getResolvedThemeColors("dark")).toMatchObject({ text: "#d4d4d4", userMessageBg: "#343541" });
	});

	test("uses native automatic light and dark selection", () => {
		expect(normalizeThemeSetting("light")).toBe("light");
		expect(normalizeThemeSetting("light/dark")).toBe("light/dark");
		expect(resolveThemeSetting("light/dark", "light")).toBe("light");
		expect(resolveThemeSetting("light/dark", "dark")).toBe("dark");
	});

	test("does not package a separate downstream theme directory", () => {
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
			pi?: { themes?: string[] };
			files?: string[];
		};

		expect(packageJson.pi?.themes).toBeUndefined();
		expect(packageJson.files).not.toContain("theme");
		expect(existsSync(REMOVED_PACKAGE_THEME_DIRECTORY)).toBe(false);
	});
});
