from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def edit_block(text: str, start_marker: str, end_marker: str, old: str, new: str, label: str) -> str:
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    block = text[start:end]
    updated = replace_once(block, old, new, label)
    return text[:start] + updated + text[end:]


interactive_path = ROOT / "packages/coding-agent/src/modes/interactive/interactive-mode.ts"
interactive = interactive_path.read_text(encoding="utf-8")

interactive = replace_once(
    interactive,
    'import { getCwdRelativePath } from "../../utils/paths.ts";',
    'import { canonicalizePath, getCwdRelativePath, resolvePath } from "../../utils/paths.ts";',
    "path utility import",
)
interactive = replace_once(
    interactive,
    "\tprivate sessionRailFailedTools = 0;\n",
    "\tprivate sessionRailFailedTools = 0;\n"
    "\tprivate sessionRailUsedSkills = new Set<string>();\n"
    "\tprivate sessionRailPendingSkillReads = new Map<string, string>();\n",
    "rail skill fields",
)
interactive = replace_once(
    interactive,
    "\t\t\tskills: resourceLoader.getSkills().skills.map((skill) => skill.name),",
    "\t\t\tskills: Array.from(this.sessionRailUsedSkills),",
    "used skills rail data",
)

helper_methods = r'''	private normalizeSessionRailPath(filePath: string): string {
		const resolvedPath = canonicalizePath(
			resolvePath(filePath, this.sessionManager.getCwd(), { normalizeUnicodeSpaces: true }),
		);
		return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
	}

	private getSessionRailSkillName(toolName: string, args: unknown): string | undefined {
		if (toolName !== "read" || typeof args !== "object" || args === null) return undefined;
		const readArgs = args as { path?: unknown; file_path?: unknown };
		const rawPath = readArgs.path ?? readArgs.file_path;
		if (typeof rawPath !== "string" || rawPath.trim().length === 0) return undefined;

		const targetPath = this.normalizeSessionRailPath(rawPath);
		for (const skill of this.session.resourceLoader.getSkills().skills) {
			if (this.normalizeSessionRailPath(skill.filePath) === targetPath) return skill.name;
		}
		return undefined;
	}

	private recordSessionRailSkillName(skillName: string): void {
		if (this.sessionRailUsedSkills.has(skillName)) return;
		this.sessionRailUsedSkills.add(skillName);
		this.updateSessionRail();
	}

	private resetSessionRailSession(): void {
		this.sessionRailActiveTools.clear();
		this.sessionRailRecentTools = [];
		this.sessionRailProgress = undefined;
		this.sessionRailCompletedTools = 0;
		this.sessionRailFailedTools = 0;
		this.sessionRailUsedSkills.clear();
		this.sessionRailPendingSkillReads.clear();
		this.sessionRailLifecycle = { kind: "idle" };
		this.updateSessionRail?.();
	}

'''
interactive = replace_once(
    interactive,
    "\tprivate resetSessionRailTurn(): void {\n",
    helper_methods + "\tprivate resetSessionRailTurn(): void {\n",
    "rail helper insertion",
)
interactive = edit_block(
    interactive,
    "\tprivate resetSessionRailTurn(): void {",
    "\n\tprivate startSessionRailTool",
    "\t\tthis.sessionRailRecentTools = [];\n",
    "\t\tthis.sessionRailRecentTools = [];\n\t\tthis.sessionRailPendingSkillReads.clear();\n",
    "turn pending skill reset",
)
interactive = edit_block(
    interactive,
    "\tprivate startSessionRailTool",
    "\n\tprivate finishSessionRailTool",
    "\tprivate startSessionRailTool(toolCallId: string, toolName: string): void {",
    "\tprivate startSessionRailTool(toolCallId: string, toolName: string, args?: unknown): void {",
    "tool start signature",
)
interactive = edit_block(
    interactive,
    "\tprivate startSessionRailTool",
    "\n\tprivate finishSessionRailTool",
    "\t\tthis.sessionRailActiveTools.set(toolCallId, toolName);\n",
    "\t\tthis.sessionRailActiveTools.set(toolCallId, toolName);\n"
    "\t\tthis.sessionRailPendingSkillReads.delete(toolCallId);\n"
    "\t\tconst skillName = this.getSessionRailSkillName(toolName, args);\n"
    "\t\tif (skillName) this.sessionRailPendingSkillReads.set(toolCallId, skillName);\n",
    "tool start skill classification",
)
interactive = edit_block(
    interactive,
    "\tprivate finishSessionRailTool",
    "\n\tprivate showLoadedResources",
    "\t\tthis.sessionRailActiveTools.delete(toolCallId);\n",
    "\t\tthis.sessionRailActiveTools.delete(toolCallId);\n"
    "\t\tconst skillName = this.sessionRailPendingSkillReads.get(toolCallId);\n"
    "\t\tthis.sessionRailPendingSkillReads.delete(toolCallId);\n"
    "\t\tif (!isError && skillName) this.sessionRailUsedSkills.add(skillName);\n",
    "tool completion skill recording",
)
interactive = replace_once(
    interactive,
    "\t\tif (options.renderBeforeBind) {\n\t\t\tthis.renderCurrentSessionState();",
    "\t\tif (options.renderBeforeBind) {\n"
    "\t\t\tthis.resetSessionRailSession();\n"
    "\t\t\tthis.renderCurrentSessionState();",
    "session replacement reset",
)
interactive = replace_once(
    interactive,
    "\t\t\t\t\tif (skillBlock) {\n\t\t\t\t\t\t// Render skill block (collapsible)",
    "\t\t\t\t\tif (skillBlock) {\n"
    "\t\t\t\t\t\tthis.recordSessionRailSkillName(skillBlock.name);\n"
    "\t\t\t\t\t\t// Render skill block (collapsible)",
    "parsed skill message tracking",
)
interactive = replace_once(
    interactive,
    "this.startSessionRailTool?.(event.toolCallId, event.toolName);",
    "this.startSessionRailTool?.(event.toolCallId, event.toolName, event.args);",
    "tool argument forwarding",
)
interactive = replace_once(
    interactive,
    "\t\t\t\tthis.sessionRailActiveTools?.clear();\n",
    "\t\t\t\tthis.sessionRailActiveTools.clear();\n"
    "\t\t\t\tthis.sessionRailPendingSkillReads.clear();\n",
    "agent-end pending skill cleanup",
)
interactive_path.write_text(interactive, encoding="utf-8")

rail_path = ROOT / "packages/coding-agent/src/modes/interactive/components/session-rail.ts"
rail = rail_path.read_text(encoding="utf-8")
rail = replace_once(
    rail,
    "\t/** Available skills remain discoverable through commands and are not shown persistently. */\n"
    "\tskills: readonly string[];",
    "\t/** Skills successfully loaded during the current session. */\n\tskills: readonly string[];",
    "rail skill semantics",
)
rail = replace_once(
    rail,
    "\t\tappendWholeSection(lines, createNowSection(this.data, innerWidth), topContentLimit);\n",
    "\t\tappendWholeSection(lines, createNowSection(this.data, innerWidth), topContentLimit);\n"
    "\t\tif (this.data.skills.length > 0) {\n"
    "\t\t\tappendWholeSection(\n"
    "\t\t\t\tlines,\n"
    "\t\t\t\tcreateSection(\"SKILLS USED\", formatResourceList(this.data.skills), innerWidth),\n"
    "\t\t\t\ttopContentLimit,\n"
    "\t\t\t);\n"
    "\t\t}\n",
    "used skills section",
)
rail_path.write_text(rail, encoding="utf-8")

updates = {
    "packages/coding-agent/test/session-rail.test.ts": (
        'expect(output).toContain("ACTIVE INSTRUCTIONS");\n\t\texpect(output).not.toContain("SKILLS");',
        'expect(output).toContain("SKILLS USED");\n'
        '\t\texpect(output).toContain("frontend-skill");\n'
        '\t\texpect(output).toContain("ACTIVE INSTRUCTIONS");',
    ),
    "packages/coding-agent/test/session-rail-enhancement.test.ts": (
        'expect(output).not.toContain("CURRENT TURN");\n\t\texpect(output).not.toContain("SKILLS");',
        'expect(output).not.toContain("CURRENT TURN");\n'
        '\t\texpect(output).toContain("SKILLS USED");\n'
        '\t\texpect(output).toContain("systematic-debugging");',
    ),
    "packages/coding-agent/test/session-rail-style.test.ts": (
        'expect(output).not.toContain("systematic-debugging");\n\t\texpect(output).not.toContain("SKILLS");',
        'expect(output).toContain("SKILLS USED");\n'
        '\t\texpect(output).toContain("systematic-debugging");',
    ),
}
for relative_path, (old, new) in updates.items():
    path = ROOT / relative_path
    content = path.read_text(encoding="utf-8")
    path.write_text(replace_once(content, old, new, relative_path), encoding="utf-8")

regression_path = ROOT / "packages/coding-agent/test/session-rail-skill-state.test.ts"
regression = regression_path.read_text(encoding="utf-8")
regression = replace_once(
    regression,
    'import type { Message } from "@earendil-works/pi-ai/compat";\n',
    "",
    "unused Message import",
)
explicit_start = '\ttest("records an explicitly expanded skill message", () => {'
explicit_end = '\n\ttest("does not record failed or unrelated reads", () => {'
start = regression.index(explicit_start)
end = regression.index(explicit_end, start)
replacement = '''\ttest("records an explicitly expanded skill name", () => {
\t\tconst { mode } = createModeFixture();
\t\tconst runtime = mode as any;

\t\truntime.recordSessionRailSkillName("systematic-debugging");

\t\texpect(Array.from(runtime.sessionRailUsedSkills)).toEqual(["systematic-debugging"]);
\t});
'''
regression = regression[:start] + replacement + regression[end:]
regression_path.write_text(regression, encoding="utf-8")
