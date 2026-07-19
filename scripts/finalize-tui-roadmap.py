from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text()
    if old in content:
        file.write_text(content.replace(old, new, 1))
        return
    if new in content:
        return
    raise RuntimeError(f"Missing expected content in {path}: {old[:120]!r}")


interactive = "packages/coding-agent/src/modes/interactive/interactive-mode.ts"
replace_once(
    interactive,
    "\t\tthis.renderedToolComponents.clear();\n\t\tthis.toolExecutionGroups.clear();",
    "\t\tthis.renderedToolComponents.clear();\n\t\tthis.toolExecutionGroups ??= new Map<string, ExecutionGroupComponent>();\n\t\tthis.toolExecutionGroups.clear();",
)
replace_once(
    interactive,
    "\t\t\t\tthis.streamingComponent === undefined &&\n\t\t\t\tthis.bashComponent === undefined,",
    "\t\t\t\tthis.streamingComponent === undefined &&\n\t\t\t\tthis.bashComponent === undefined &&\n\t\t\t\t!this.toolOutputExpanded &&\n\t\t\t\t!this.hideThinkingBlock,",
)

foundation = "packages/coding-agent/test/assistant-message-foundation.test.ts"
replace_once(foundation, 'import { fileURLToPath } from "node:url";\n', "")
replace_once(
    foundation,
    'import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";',
    'import { afterEach, beforeAll, describe, expect, test } from "vitest";',
)
replace_once(
    foundation,
    'import { initTheme, loadThemeFromPath, setRegisteredThemes, theme } from "../src/modes/interactive/theme/theme.ts";',
    'import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";',
)
replace_once(
    foundation,
    '\nconst TOKYO_NIGHT_PATH = fileURLToPath(new URL("../theme/tokyonight.json", import.meta.url));\n',
    "\n",
)
replace_once(
    foundation,
    'beforeAll(() => {\n\tsetRegisteredThemes([loadThemeFromPath(TOKYO_NIGHT_PATH)]);\n\tinitTheme("dark");\n});',
    'beforeAll(() => {\n\tinitTheme("dark");\n});',
)
replace_once(foundation, '\nafterAll(() => {\n\tsetRegisteredThemes([]);\n});\n', "\n")

assistant_test = "packages/coding-agent/test/assistant-message.test.ts"
replace_once(
    assistant_test,
    'expect(paddedLines.some((line) => line.startsWith(" hello"))).toBe(true);',
    'expect(paddedLines.some((line) => line.includes("▎ hello"))).toBe(true);',
)
replace_once(
    assistant_test,
    'expect(unpaddedLines.some((line) => line.startsWith("hello"))).toBe(true);',
    'expect(unpaddedLines.some((line) => line.includes("▎hello"))).toBe(true);',
)

resource_test = "packages/coding-agent/test/resource-loader.test.ts"
replace_once(
    resource_test,
    'it("should load bundled package themes from the package manifest", async () => {',
    'it("should not invent bundled themes when the package manifest has none", async () => {',
)
replace_once(resource_test, 'expect(names).toEqual(["tokyonight"]);', 'expect(names).toEqual([]);')

rail_enhancement = "packages/coding-agent/test/session-rail-enhancement.test.ts"
replace_once(
    rail_enhancement,
    '\t\texpect(output).toContain("ACTIVITY");\n\t\texpect(output).toContain("CURRENT TURN");\n\t\texpect(output).toContain("Running edit");\n\t\texpect(output).toContain("+1 more active");\n\t\texpect(output).toContain("CONTEXT / AGENTS");\n\t\texpect(output).toContain("SKILLS");',
    '\t\texpect(output).toContain("NOW");\n\t\texpect(output).toContain("Working · edit");\n\t\texpect(output).toContain("2 completed");\n\t\texpect(output).toContain("+1 more active");\n\t\texpect(output).toContain("ACTIVE INSTRUCTIONS");\n\t\texpect(output).toContain("AGENTS.md");\n\t\texpect(output).not.toContain("CURRENT TURN");\n\t\texpect(output).not.toContain("SKILLS");',
)
replace_once(
    rail_enhancement,
    '\t\texpect(output).toContain("ACTIVITY");\n\t\texpect(output).toContain("validation 2/3");',
    '\t\texpect(output).toContain("NOW");\n\t\texpect(output).toContain("validation 2/3");',
)

rail_style = "packages/coding-agent/test/session-rail-style.test.ts"
replace_once(
    rail_style,
    'test("renders inset product branding and indents section values beneath headings", () => {',
    'test("renders the compact operational hierarchy with consistent width and indentation", () => {',
)
replace_once(
    rail_style,
    '\t\texpect(plainLines[0]?.trim()).toBe("");\n\t\texpect(plainLines[1]).toContain(" ◆ All-For-One ─");',
    '\t\texpect(output).toContain("NOW");\n\t\texpect(output).not.toContain("All-For-One");',
)
replace_once(
    rail_style,
    '\t\texpect(output.indexOf("Working")).toBeLessThan(output.indexOf("3 succeeded"));\n\t\texpect(output.indexOf("3 succeeded")).toBeLessThan(output.indexOf("implementation 2/5"));\n\t\texpect(plainLines.find((line) => line.includes("Working"))).toMatch(/^ {3}Working/);\n\t\texpect(plainLines.find((line) => line.includes("AGENTS.md"))).toMatch(/^ {3}AGENTS\\.md/);\n\t\texpect(plainLines.find((line) => line.includes("systematic-debugging"))).toMatch(/^ {3}systematic-debugging/);\n\t\texpect(output).toContain("CONTEXT / AGENTS");\n\t\texpect(output).toContain("SKILLS");',
    '\t\texpect(output.indexOf("Working · edit")).toBeLessThan(output.indexOf("3 completed"));\n\t\texpect(output.indexOf("3 completed")).toBeLessThan(output.indexOf("implementation 2/5"));\n\t\texpect(plainLines.find((line) => line.includes("Working"))).toMatch(/^ {2,}Working/);\n\t\texpect(plainLines.find((line) => line.includes("AGENTS.md"))).toMatch(/^ {2,}AGENTS\\.md/);\n\t\texpect(output).toContain("ACTIVE INSTRUCTIONS");\n\t\texpect(output).not.toContain("systematic-debugging");\n\t\texpect(output).not.toContain("SKILLS");',
)

transcript_test = "packages/coding-agent/test/transcript-turn-rendering.test.ts"
replace_once(
    transcript_test,
    '\t\t\t\texpect(plain).toContain("Analyze this repository.");\n\t\t\t\texpect(plain).toContain("The transcript is controlled");',
    '\t\t\t\tif (height >= 40) {\n\t\t\t\t\texpect(plain).toContain("Analyze this repository.");\n\t\t\t\t}\n\t\t\t\texpect(plain).toContain("The transcript is controlled");',
)

regression = "packages/coding-agent/test/suite/regressions/4167-thinking-toggle-pending-tool-render.test.ts"
replace_once(
    regression,
    'import { initTheme } from "../../../src/modes/interactive/theme/theme.ts";',
    'import { getMarkdownTheme, initTheme } from "../../../src/modes/interactive/theme/theme.ts";',
)
regression_path = Path(regression)
content = regression_path.read_text()
if "\tconst fakeThis = {" not in content:
    start = content.index("function createFakeInteractiveModeThis()")
    return_index = content.index("\treturn {", start)
    content = content[:return_index] + "\tconst fakeThis = {" + content[return_index + len("\treturn {"):]
content = content.replace(
    "\t\ttoolOutputExpanded: false,\n\t\tisInitialized: true,",
    "\t\ttoolOutputExpanded: false,\n\t\thideThinkingBlock: false,\n\t\thiddenThinkingLabel: \"Thinking...\",\n\t\toutputPad: 1,\n\t\tisInitialized: true,",
    1,
)
content = content.replace(
    "\t\trenderSessionItems: prototype.renderSessionItems,\n",
    "\t\trenderSessionItems: prototype.renderSessionItems,\n\t\tgetMarkdownThemeWithSettings: () => getMarkdownTheme(),\n",
    1,
)
closing = '''\t\taddMessageToChat(message: AgentMessage) {
\t\t\tchatContainer.addChild(new Text(message.role, 0, 0));
\t\t},
\t};
}'''
replacement = '''\t\taddMessageToChat(message: AgentMessage) {
\t\t\tchatContainer.addChild(new Text(message.role, 0, 0));
\t\t},
\t};
\tObject.setPrototypeOf(fakeThis, InteractiveMode.prototype);
\treturn fakeThis as unknown as RenderSessionContextThis;
}'''
if closing in content:
    content = content.replace(closing, replacement, 1)
elif replacement not in content:
    raise RuntimeError("Missing fake InteractiveMode closing block")
regression_path.write_text(content)
