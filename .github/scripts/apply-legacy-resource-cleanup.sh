#!/usr/bin/env bash
set -euo pipefail

cat > packages/coding-agent/test/bundled-themes.test.ts <<'EOF'
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const ORIGINAL_AGENT_DIR = process.env.PI_CODING_AGENT_DIR;

function gitBlobSha(content: string): string {
	const size = Buffer.byteLength(content, "utf8");
	return createHash("sha1").update(`blob ${size}\0${content}`, "utf8").digest("hex");
}

function restoreAgentDir(): void {
	if (ORIGINAL_AGENT_DIR === undefined) {
		delete process.env.PI_CODING_AGENT_DIR;
	} else {
		process.env.PI_CODING_AGENT_DIR = ORIGINAL_AGENT_DIR;
	}
}

afterAll(() => {
	restoreAgentDir();
	initTheme("dark");
});

describe("native Pi themes", () => {
	test("ships the exact native dark and light palettes", () => {
		const darkContent = readFileSync(DARK_PATH, "utf8");
		const lightContent = readFileSync(LIGHT_PATH, "utf8");
		const dark = JSON.parse(darkContent) as {
			name: string;
			vars: Record<string, string>;
			export: Record<string, string>;
		};
		const light = JSON.parse(lightContent) as {
			name: string;
			vars: Record<string, string>;
			export: Record<string, string>;
		};

		expect(gitBlobSha(darkContent)).toBe("d4d504155fccd62cf7d5a44bfc39822225883153");
		expect(gitBlobSha(lightContent)).toBe("ef0d5c3035926a6f013bc6c6160b38194e7dbe7e");
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

	test("removes deprecated Tokyo Night settings and custom discovery", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "afo-theme-"));
		try {
			process.env.PI_CODING_AGENT_DIR = agentDir;
			const themesDir = join(agentDir, "themes");
			mkdirSync(themesDir, { recursive: true });
			const legacyTheme = JSON.parse(readFileSync(DARK_PATH, "utf8")) as { name: string };
			legacyTheme.name = "tokyonight";
			writeFileSync(join(themesDir, "tokyonight.json"), JSON.stringify(legacyTheme, null, 2));

			expect(normalizeThemeSetting("tokyonight")).toBeUndefined();
			expect(normalizeThemeSetting("Tokyo Night")).toBeUndefined();
			expect(normalizeThemeSetting("tokyonight/dark")).toBe("light/dark");
			expect(normalizeThemeSetting("light/tokyonight")).toBe("light/dark");
			expect(normalizeThemeSetting("light/dark")).toBe("light/dark");
			expect(getAvailableThemes()).not.toContain("tokyonight");
			expect(getThemeByName("tokyonight")).toBeUndefined();
			expect(setTheme("tokyonight").success).toBe(false);
		} finally {
			restoreAgentDir();
			rmSync(agentDir, { recursive: true, force: true });
		}
	});

	test("uses native automatic light and dark selection", () => {
		expect(resolveThemeSetting("light/dark", "light")).toBe("light");
		expect(resolveThemeSetting("light/dark", "dark")).toBe("dark");
	});

	test("does not package a separate downstream theme directory", () => {
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
			pi?: { themes?: string[] };
			files?: string[];
			scripts?: { build?: string };
		};

		expect(packageJson.pi?.themes).toBeUndefined();
		expect(packageJson.files).not.toContain("theme");
		expect(existsSync(REMOVED_PACKAGE_THEME_DIRECTORY)).toBe(false);
		expect(packageJson.scripts?.build?.startsWith("npm run clean && ")).toBe(true);
	});
});
EOF

python <<'PY'
from pathlib import Path

path = Path('packages/coding-agent/test/resource-loader.test.ts')
text = path.read_text()
old = '''\t\tit("should load bundled package themes from the package manifest", async () => {
\t\t\tconst loader = new DefaultResourceLoader({ cwd, agentDir });
\t\t\tawait loader.reload();

\t\t\tconst names = loader
\t\t\t\t.getThemes()
\t\t\t\t.themes.map((theme) => theme.name)
\t\t\t\t.filter((name): name is string => name !== undefined)
\t\t\t\t.sort();
\t\t\texpect(names).toEqual(["tokyonight"]);
\t\t});
'''
new = '''\t\tit("should ignore removed legacy resources discovered from user directories", async () => {
\t\t\tconst themesDir = join(agentDir, "themes");
\t\t\tconst skillDir = join(agentDir, "skills", "microsoft-foundry");
\t\t\tmkdirSync(themesDir, { recursive: true });
\t\t\tmkdirSync(skillDir, { recursive: true });

\t\t\tconst legacyTheme = JSON.parse(
\t\t\t\treadFileSync(join(process.cwd(), "src", "modes", "interactive", "theme", "dark.json"), "utf-8"),
\t\t\t) as { name: string };
\t\t\tlegacyTheme.name = "tokyonight";
\t\t\twriteFileSync(join(themesDir, "tokyonight.json"), JSON.stringify(legacyTheme, null, 2));
\t\t\twriteFileSync(
\t\t\t\tjoin(skillDir, "SKILL.md"),
\t\t\t\t`---\nname: microsoft-foundry\ndescription: Removed legacy skill\n---\nLegacy skill content.`,
\t\t\t);

\t\t\tconst loader = new DefaultResourceLoader({ cwd, agentDir });
\t\t\tawait loader.reload();

\t\t\texpect(loader.getThemes().themes.map((theme) => theme.name)).not.toContain("tokyonight");
\t\t\texpect(loader.getSkills().skills.map((skill) => skill.name)).not.toContain("microsoft-foundry");
\t\t\texpect(loader.getThemes().diagnostics.some((diagnostic) => diagnostic.path?.includes("tokyonight"))).toBe(false);
\t\t\texpect(
\t\t\t\tloader.getSkills().diagnostics.some((diagnostic) => diagnostic.path?.includes("microsoft-foundry")),
\t\t\t).toBe(false);
\t\t});
'''
if old not in text:
    raise SystemExit('obsolete bundled-theme test block not found')
path.write_text(text.replace(old, new, 1))
PY

cat > packages/coding-agent/src/core/deprecated-resources.ts <<'EOF'
const DEPRECATED_THEME_NAMES = new Set(["tokyonight", "tokyo-night"]);
const DEPRECATED_SKILL_NAMES = new Set(["microsoft-foundry", "microsoftfoundry"]);

function normalizeResourceName(name: string): string {
	return name.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}

function resourceNameFromPath(filePath: string): string {
	const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
	const leaf = parts.at(-1) ?? "";
	if (leaf.toLowerCase() === "skill.md") {
		return parts.at(-2) ?? "";
	}
	return leaf.replace(/\.(json|md)$/i, "");
}

export function isDeprecatedThemeName(name: string | undefined): boolean {
	return name !== undefined && DEPRECATED_THEME_NAMES.has(normalizeResourceName(name));
}

export function isDeprecatedThemeResource(resource: { name?: string; sourcePath?: string }): boolean {
	return (
		isDeprecatedThemeName(resource.name) ||
		(resource.sourcePath !== undefined && isDeprecatedThemeName(resourceNameFromPath(resource.sourcePath)))
	);
}

export function isDeprecatedSkillResource(resource: { name?: string; filePath?: string }): boolean {
	if (resource.name !== undefined && DEPRECATED_SKILL_NAMES.has(normalizeResourceName(resource.name))) {
		return true;
	}
	return (
		resource.filePath !== undefined &&
		DEPRECATED_SKILL_NAMES.has(normalizeResourceName(resourceNameFromPath(resource.filePath)))
	);
}

export function normalizeDeprecatedThemeSetting(themeSetting: string | undefined): string | undefined {
	if (!themeSetting) return themeSetting;

	const parts = themeSetting.split("/");
	if (parts.length === 1) {
		return isDeprecatedThemeName(themeSetting) ? undefined : themeSetting;
	}
	if (parts.length !== 2) return themeSetting;

	const lightTheme = parts[0]?.trim();
	const darkTheme = parts[1]?.trim();
	if (!lightTheme || !darkTheme) return themeSetting;

	return `${isDeprecatedThemeName(lightTheme) ? "light" : lightTheme}/${
		isDeprecatedThemeName(darkTheme) ? "dark" : darkTheme
	}`;
}
EOF

python <<'PY'
from pathlib import Path

theme = Path('packages/coding-agent/src/modes/interactive/theme/theme.ts')
text = theme.read_text()
text = text.replace(
    'import { getCustomThemesDir, getThemesDir } from "../../../config.ts";\nimport type { SourceInfo } from "../../../core/source-info.ts";',
    'import { getCustomThemesDir, getThemesDir } from "../../../config.ts";\nimport {\n\tisDeprecatedThemeName,\n\tisDeprecatedThemeResource,\n\tnormalizeDeprecatedThemeSetting,\n} from "../../../core/deprecated-resources.ts";\nimport type { SourceInfo } from "../../../core/source-info.ts";',
    1,
)
text = text.replace(
    '''\tconst addTheme = (themeInfo: ThemeInfo) => {
\t\tif (seen.has(themeInfo.name)) {
''',
    '''\tconst addTheme = (themeInfo: ThemeInfo) => {
\t\tif (isDeprecatedThemeResource({ name: themeInfo.name, sourcePath: themeInfo.path })) return;
\t\tif (seen.has(themeInfo.name)) {
''',
    1,
)
text = text.replace(
    '''function loadThemeJson(name: string): ThemeJson {
\tconst builtinThemes = getBuiltinThemes();
''',
    '''function loadThemeJson(name: string): ThemeJson {
\tif (isDeprecatedThemeName(name)) throw new Error(`Theme not found: ${name}`);
\tconst builtinThemes = getBuiltinThemes();
''',
    1,
)
text = text.replace(
    '''function loadTheme(name: string, mode?: ColorMode): Theme {
\tconst registeredTheme = registeredThemes.get(name);
''',
    '''function loadTheme(name: string, mode?: ColorMode): Theme {
\tif (isDeprecatedThemeName(name)) throw new Error(`Theme not found: ${name}`);
\tconst registeredTheme = registeredThemes.get(name);
''',
    1,
)
old_normalize = '''/**
 * Compatibility hook retained for downstream callers that previously
 * migrated removed theme names. Native Pi themes now pass through unchanged.
 */
export function normalizeThemeSetting(themeSetting: string | undefined): string | undefined {
\treturn themeSetting;
}
'''
new_normalize = '''/** Normalize settings that still refer to themes removed from All-For-One. */
export function normalizeThemeSetting(themeSetting: string | undefined): string | undefined {
\treturn normalizeDeprecatedThemeSetting(themeSetting);
}
'''
if old_normalize not in text:
    raise SystemExit('theme normalization block not found')
text = text.replace(old_normalize, new_normalize, 1)
old_registry = '''export function setRegisteredThemes(themes: Theme[]): void {
\tregisteredThemes.clear();
\tfor (const theme of themes) {
\t\tif (theme.name) {
\t\t\tassertThemeNameIsValid(theme.name);
\t\t\tregisteredThemes.set(theme.name, theme);
\t\t}
\t}
}
'''
new_registry = '''export function setRegisteredThemes(themes: Theme[]): void {
\tregisteredThemes.clear();
\tfor (const theme of themes) {
\t\tif (theme.name && !isDeprecatedThemeResource({ name: theme.name, sourcePath: theme.sourcePath })) {
\t\t\tassertThemeNameIsValid(theme.name);
\t\t\tregisteredThemes.set(theme.name, theme);
\t\t}
\t}
}
'''
if old_registry not in text:
    raise SystemExit('registered theme block not found')
theme.write_text(text.replace(old_registry, new_registry, 1))

loader = Path('packages/coding-agent/src/core/resource-loader.ts')
text = loader.read_text()
text = text.replace(
    'import { DefaultPackageManager, type PathMetadata, type ResolvedResource } from "./package-manager.ts";',
    'import { isDeprecatedSkillResource, isDeprecatedThemeResource } from "./deprecated-resources.ts";\nimport { DefaultPackageManager, type PathMetadata, type ResolvedResource } from "./package-manager.ts";',
    1,
)
old_skills = '''\t\tconst resolvedSkills = this.skillsOverride ? this.skillsOverride(skillsResult) : skillsResult;
\t\tthis.skills = resolvedSkills.skills.map((skill) => ({
\t\t\t...skill,
\t\t\tsourceInfo:
\t\t\t\tthis.findSourceInfoForPath(skill.filePath, this.extensionSkillSourceInfos, metadataByPath) ??
\t\t\t\tskill.sourceInfo ??
\t\t\t\tthis.getDefaultSourceInfoForPath(skill.filePath),
\t\t}));
\t\tthis.skillDiagnostics = resolvedSkills.diagnostics;
'''
new_skills = '''\t\tconst filteredSkillsResult = {
\t\t\tskills: skillsResult.skills.filter(
\t\t\t\t(skill) => !isDeprecatedSkillResource({ name: skill.name, filePath: skill.filePath }),
\t\t\t),
\t\t\tdiagnostics: skillsResult.diagnostics.filter(
\t\t\t\t(diagnostic) => !isDeprecatedSkillResource({ filePath: diagnostic.path }),
\t\t\t),
\t\t};
\t\tconst resolvedSkills = this.skillsOverride ? this.skillsOverride(filteredSkillsResult) : filteredSkillsResult;
\t\tthis.skills = resolvedSkills.skills.map((skill) => ({
\t\t\t...skill,
\t\t\tsourceInfo:
\t\t\t\tthis.findSourceInfoForPath(skill.filePath, this.extensionSkillSourceInfos, metadataByPath) ??
\t\t\t\tskill.sourceInfo ??
\t\t\t\tthis.getDefaultSourceInfoForPath(skill.filePath),
\t\t}));
\t\tthis.skillDiagnostics = resolvedSkills.diagnostics;
'''
if old_skills not in text:
    raise SystemExit('skill result block not found')
text = text.replace(old_skills, new_skills, 1)
old_themes = '''\t\t\tconst loaded = this.loadThemes(themePaths, false);
\t\t\tconst deduped = this.dedupeThemes(loaded.themes);
\t\t\tthemesResult = { themes: deduped.themes, diagnostics: [...loaded.diagnostics, ...deduped.diagnostics] };
'''
new_themes = '''\t\t\tconst loaded = this.loadThemes(themePaths, false);
\t\t\tconst filteredThemes = loaded.themes.filter(
\t\t\t\t(theme) => !isDeprecatedThemeResource({ name: theme.name, sourcePath: theme.sourcePath }),
\t\t\t);
\t\t\tconst filteredDiagnostics = loaded.diagnostics.filter(
\t\t\t\t(diagnostic) => !isDeprecatedThemeResource({ sourcePath: diagnostic.path }),
\t\t\t);
\t\t\tconst deduped = this.dedupeThemes(filteredThemes);
\t\t\tthemesResult = {
\t\t\t\tthemes: deduped.themes,
\t\t\t\tdiagnostics: [...filteredDiagnostics, ...deduped.diagnostics],
\t\t\t};
'''
if old_themes not in text:
    raise SystemExit('theme result block not found')
loader.write_text(text.replace(old_themes, new_themes, 1))

package = Path('packages/coding-agent/package.json')
text = package.read_text()
old_build = '"build": "tsgo -p tsconfig.build.json && shx chmod +x dist/cli.js dist/allforone-cli.js dist/rpc-entry.js && npm run copy-assets"'
new_build = '"build": "npm run clean && tsgo -p tsconfig.build.json && shx chmod +x dist/cli.js dist/allforone-cli.js dist/rpc-entry.js && npm run copy-assets"'
if old_build not in text:
    raise SystemExit('coding-agent build script not found')
package.write_text(text.replace(old_build, new_build, 1))
PY
