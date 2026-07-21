from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


state_path = ROOT / "packages/coding-agent/src/modes/interactive/session-rail-state.ts"
state_path.write_text(
    r'''import { canonicalizePath, resolvePath } from "../../utils/paths.ts";
import type {
	SessionRailLifecycle,
	SessionRailProgress,
	SessionRailToolEvent,
} from "./components/session-rail.ts";

export interface SessionRailSkillReference {
	name: string;
	filePath: string;
}

export interface EmptySessionRailActivityState {
	lifecycle: SessionRailLifecycle;
	recentTools: SessionRailToolEvent[];
	progress: SessionRailProgress | undefined;
	completedTools: number;
	failedTools: number;
}

export function createEmptySessionRailActivityState(): EmptySessionRailActivityState {
	return {
		lifecycle: { kind: "idle" },
		recentTools: [],
		progress: undefined,
		completedTools: 0,
		failedTools: 0,
	};
}

function normalizeComparablePath(filePath: string, cwd: string): string {
	const resolvedPath = canonicalizePath(resolvePath(filePath, cwd, { normalizeUnicodeSpaces: true }));
	return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
}

export function findSessionRailSkillName(
	toolName: string,
	args: unknown,
	cwd: string,
	skills: readonly SessionRailSkillReference[],
): string | undefined {
	if (toolName !== "read" || typeof args !== "object" || args === null) return undefined;
	const readArgs = args as { path?: unknown; file_path?: unknown };
	const rawPath = readArgs.path ?? readArgs.file_path;
	if (typeof rawPath !== "string" || rawPath.trim().length === 0) return undefined;

	const targetPath = normalizeComparablePath(rawPath, cwd);
	for (const skill of skills) {
		if (normalizeComparablePath(skill.filePath, cwd) === targetPath) return skill.name;
	}
	return undefined;
}

export class SessionRailSkillUsageTracker {
	private readonly usedSkillNames = new Set<string>();
	private readonly pendingSkillReads = new Map<string, string>();

	get usedSkills(): string[] {
		return Array.from(this.usedSkillNames);
	}

	start(toolCallId: string, skillName: string | undefined): void {
		this.pendingSkillReads.delete(toolCallId);
		if (skillName) this.pendingSkillReads.set(toolCallId, skillName);
	}

	finish(toolCallId: string, isError: boolean): boolean {
		const skillName = this.pendingSkillReads.get(toolCallId);
		this.pendingSkillReads.delete(toolCallId);
		if (isError || !skillName || this.usedSkillNames.has(skillName)) return false;
		this.usedSkillNames.add(skillName);
		return true;
	}

	record(skillName: string): boolean {
		if (!skillName || this.usedSkillNames.has(skillName)) return false;
		this.usedSkillNames.add(skillName);
		return true;
	}

	clearPending(): void {
		this.pendingSkillReads.clear();
	}

	resetTurn(): void {
		this.clearPending();
	}

	resetSession(): void {
		this.clearPending();
		this.usedSkillNames.clear();
	}
}
''',
    encoding="utf-8",
)

interactive_path = ROOT / "packages/coding-agent/src/modes/interactive/interactive-mode.ts"
interactive = interactive_path.read_text(encoding="utf-8")
interactive = replace_once(
    interactive,
    'import { getSessionRailLayout } from "./responsive-layout.ts";',
    'import { getSessionRailLayout } from "./responsive-layout.ts";\n'
    'import {\n'
    '\tcreateEmptySessionRailActivityState,\n'
    '\tfindSessionRailSkillName,\n'
    '\tSessionRailSkillUsageTracker,\n'
    '} from "./session-rail-state.ts";',
    "session rail state import",
)
interactive = replace_once(
    interactive,
    "\tprivate sessionRailFailedTools = 0;\n",
    "\tprivate sessionRailFailedTools = 0;\n"
    "\tprivate readonly sessionRailSkillUsage = new SessionRailSkillUsageTracker();\n",
    "skill usage tracker field",
)
interactive = replace_once(
    interactive,
    "\t\t\tskills: resourceLoader.getSkills().skills.map((skill) => skill.name),",
    "\t\t\tskills: this.sessionRailSkillUsage.usedSkills,",
    "used skills rail data",
)

reset_method = r'''	private resetSessionRailSession(): void {
		const resetState = createEmptySessionRailActivityState();
		this.sessionRailActiveTools.clear();
		this.sessionRailRecentTools = resetState.recentTools;
		this.sessionRailProgress = resetState.progress;
		this.sessionRailCompletedTools = resetState.completedTools;
		this.sessionRailFailedTools = resetState.failedTools;
		this.sessionRailLifecycle = resetState.lifecycle;
		this.sessionRailSkillUsage.resetSession();
		this.updateSessionRail?.();
	}

'''
interactive = replace_once(
    interactive,
    "\tprivate resetSessionRailTurn(): void {\n",
    reset_method + "\tprivate resetSessionRailTurn(): void {\n",
    "session reset method",
)
interactive = replace_once(
    interactive,
    "\t\tthis.sessionRailRecentTools = [];\n\t\tthis.sessionRailCompletedTools = 0;",
    "\t\tthis.sessionRailRecentTools = [];\n"
    "\t\tthis.sessionRailSkillUsage.resetTurn();\n"
    "\t\tthis.sessionRailCompletedTools = 0;",
    "turn skill reset",
)
interactive = replace_once(
    interactive,
    "\tprivate startSessionRailTool(toolCallId: string, toolName: string): void {",
    "\tprivate startSessionRailTool(toolCallId: string, toolName: string, args?: unknown): void {",
    "tool start signature",
)
interactive = replace_once(
    interactive,
    "\t\tthis.sessionRailActiveTools.set(toolCallId, toolName);\n\t\tthis.updateSessionRail();",
    "\t\tthis.sessionRailActiveTools.set(toolCallId, toolName);\n"
    "\t\tconst skillName = findSessionRailSkillName(\n"
    "\t\t\ttoolName,\n"
    "\t\t\targs,\n"
    "\t\t\tthis.sessionManager.getCwd(),\n"
    "\t\t\tthis.session.resourceLoader.getSkills().skills,\n"
    "\t\t);\n"
    "\t\tthis.sessionRailSkillUsage.start(toolCallId, skillName);\n"
    "\t\tthis.updateSessionRail();",
    "tool skill classification",
)
interactive = replace_once(
    interactive,
    "\t\tthis.sessionRailActiveTools.delete(toolCallId);\n\t\tconst toolEvent: SessionRailToolEvent",
    "\t\tthis.sessionRailActiveTools.delete(toolCallId);\n"
    "\t\tthis.sessionRailSkillUsage.finish(toolCallId, isError);\n"
    "\t\tconst toolEvent: SessionRailToolEvent",
    "tool skill completion",
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
    "\t\t\t\t\t\tif (this.sessionRailSkillUsage.record(skillBlock.name)) this.updateSessionRail();\n"
    "\t\t\t\t\t\t// Render skill block (collapsible)",
    "explicit skill tracking",
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
    "\t\t\t\tthis.sessionRailSkillUsage.clearPending();\n",
    "agent end pending skill cleanup",
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
