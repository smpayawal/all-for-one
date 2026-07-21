from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def write_regression_tests() -> None:
    test_path = ROOT / "packages/coding-agent/test/session-rail-skill-state.test.ts"
    test_path.write_text(
        r'''import * as path from "node:path";
import type { Message } from "@earendil-works/pi-ai/compat";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import { SessionRailComponent } from "../src/modes/interactive/components/session-rail.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function createModeFixture() {
	const cwd = path.resolve("/repo");
	const skillPath = path.join(cwd, ".pi", "skills", "systematic-debugging", "SKILL.md");
	const session = {
		isStreaming: false,
		sessionManager: { getCwd: () => cwd },
		resourceLoader: {
			getSkills: () => ({
				skills: [{ name: "systematic-debugging", filePath: skillPath }],
				diagnostics: [],
			}),
			getAgentsFiles: () => ({ agentsFiles: [] }),
		},
	};
	const mode = Object.create(InteractiveMode.prototype) as InteractiveMode & Record<string, any>;
	Object.assign(mode, {
		runtimeHost: { session },
		sessionRailLifecycle: { kind: "idle" },
		sessionRailActiveTools: new Map<string, string>(),
		sessionRailRecentTools: [],
		sessionRailProgress: undefined,
		sessionRailCompletedTools: 0,
		sessionRailFailedTools: 0,
		sessionRailUsedSkills: new Set<string>(),
		sessionRailPendingSkillReads: new Map<string, string>(),
		updateSessionRail: vi.fn(),
	});
	return { mode, cwd, skillPath };
}

beforeAll(() => {
	initTheme("dark");
});

describe("session rail skill state", () => {
	test("renders skills used in the current session", () => {
		const rail = new SessionRailComponent({
			title: "All-For-One",
			agents: ["AGENTS.md"],
			skills: ["systematic-debugging"],
			lifecycle: { kind: "idle" },
			activeTools: [],
			recentTools: [],
			completedTools: 0,
			failedTools: 0,
			getAvailableHeight: () => 24,
		});

		const output = stripAnsi(rail.render(40).join("\n"));
		expect(output).toContain("SKILLS USED");
		expect(output).toContain("systematic-debugging");
	});

	test("records a successful read of an exact registered skill path", () => {
		const { mode, cwd, skillPath } = createModeFixture();
		const runtime = mode as any;

		runtime.startSessionRailTool("tool-1", "read", { path: path.relative(cwd, skillPath) });
		runtime.finishSessionRailTool("tool-1", "read", false);

		expect(Array.from(runtime.sessionRailUsedSkills)).toEqual(["systematic-debugging"]);
	});

	test("records an explicitly expanded skill message", () => {
		const { mode, skillPath } = createModeFixture();
		const runtime = mode as any;
		const message = {
			role: "user",
			content: [
				{
					type: "text",
					text: `<skill name="systematic-debugging" location="${skillPath}">\nInstructions\n</skill>`,
				},
			],
			timestamp: Date.now(),
		} as Message;

		runtime.recordSessionRailSkillMessage(message);

		expect(Array.from(runtime.sessionRailUsedSkills)).toEqual(["systematic-debugging"]);
	});

	test("does not record failed or unrelated reads", () => {
		const { mode } = createModeFixture();
		const runtime = mode as any;

		runtime.startSessionRailTool("tool-1", "read", { path: "README.md" });
		runtime.finishSessionRailTool("tool-1", "read", false);
		runtime.startSessionRailTool("tool-2", "read", {
			path: ".pi/skills/systematic-debugging/SKILL.md",
		});
		runtime.finishSessionRailTool("tool-2", "read", true);

		expect(Array.from(runtime.sessionRailUsedSkills)).toEqual([]);
	});

	test("clears Side Rail activity and skills when the session is replaced", () => {
		const { mode } = createModeFixture();
		const runtime = mode as any;
		runtime.sessionRailLifecycle = { kind: "agent" };
		runtime.sessionRailActiveTools.set("tool-1", "read");
		runtime.sessionRailRecentTools = [{ toolName: "read", status: "success" }];
		runtime.sessionRailProgress = { label: "plan", completed: 1, total: 2 };
		runtime.sessionRailCompletedTools = 2;
		runtime.sessionRailFailedTools = 1;
		runtime.sessionRailUsedSkills.add("systematic-debugging");
		runtime.sessionRailPendingSkillReads.set("tool-1", "systematic-debugging");

		runtime.resetSessionRailSession();

		expect(runtime.sessionRailLifecycle).toEqual({ kind: "idle" });
		expect(runtime.sessionRailActiveTools.size).toBe(0);
		expect(runtime.sessionRailRecentTools).toEqual([]);
		expect(runtime.sessionRailProgress).toBeUndefined();
		expect(runtime.sessionRailCompletedTools).toBe(0);
		expect(runtime.sessionRailFailedTools).toBe(0);
		expect(runtime.sessionRailUsedSkills.size).toBe(0);
		expect(runtime.sessionRailPendingSkillReads.size).toBe(0);
	});
});
''',
        encoding="utf-8",
    )


def apply_implementation() -> None:
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
        "rail skill state fields",
    )
    interactive = replace_once(
        interactive,
        "\t\t\tskills: resourceLoader.getSkills().skills.map((skill) => skill.name),",
        "\t\t\tskills: Array.from(this.sessionRailUsedSkills),",
        "used skills rail data",
    )
    interactive = replace_once(
        interactive,
        '''\tprivate resetSessionRailTurn(): void {
\t\tthis.sessionRailActiveTools.clear();
\t\tthis.sessionRailRecentTools = [];
\t\tthis.sessionRailCompletedTools = 0;
\t\tthis.sessionRailFailedTools = 0;
\t\tthis.sessionRailLifecycle = { kind: "agent" };
\t\tthis.updateSessionRail?.();
\t}
''',
        '''\tprivate resetSessionRailTurn(): void {
\t\tthis.sessionRailActiveTools.clear();
\t\tthis.sessionRailRecentTools = [];
\t\tthis.sessionRailPendingSkillReads.clear();
\t\tthis.sessionRailCompletedTools = 0;
\t\tthis.sessionRailFailedTools = 0;
\t\tthis.sessionRailLifecycle = { kind: "agent" };
\t\tthis.updateSessionRail?.();
\t}
''',
        "turn rail reset",
    )
    interactive = replace_once(
        interactive,
        '''\tprivate startSessionRailTool(toolCallId: string, toolName: string): void {
\t\tthis.sessionRailLifecycle = { kind: "agent" };
\t\tthis.sessionRailActiveTools.set(toolCallId, toolName);
\t\tthis.updateSessionRail();
\t}
''',
        '''\tprivate startSessionRailTool(toolCallId: string, toolName: string, args?: unknown): void {
\t\tthis.sessionRailLifecycle = { kind: "agent" };
\t\tthis.sessionRailActiveTools.set(toolCallId, toolName);
\t\tthis.sessionRailPendingSkillReads.delete(toolCallId);
\t\tconst skillName = this.getSessionRailSkillName(toolName, args);
\t\tif (skillName) this.sessionRailPendingSkillReads.set(toolCallId, skillName);
\t\tthis.updateSessionRail();
\t}
''',
        "tool start tracking",
    )
    interactive = replace_once(
        interactive,
        '''\tprivate finishSessionRailTool(toolCallId: string, toolName: string, isError: boolean): void {
\t\tthis.sessionRailActiveTools.delete(toolCallId);
\t\tconst toolEvent: SessionRailToolEvent = { toolName, status: isError ? "error" : "success" };
''',
        '''\tprivate finishSessionRailTool(toolCallId: string, toolName: string, isError: boolean): void {
\t\tthis.sessionRailActiveTools.delete(toolCallId);
\t\tconst skillName = this.sessionRailPendingSkillReads.get(toolCallId);
\t\tthis.sessionRailPendingSkillReads.delete(toolCallId);
\t\tif (!isError && skillName) this.sessionRailUsedSkills.add(skillName);
\t\tconst toolEvent: SessionRailToolEvent = { toolName, status: isError ? "error" : "success" };
''',
        "tool completion tracking",
    )
    interactive = replace_once(
        interactive,
        '''\t\tthis.applyRuntimeSettings();
\t\tif (options.renderBeforeBind) {
\t\t\tthis.renderCurrentSessionState();
''',
        '''\t\tthis.applyRuntimeSettings();
\t\tif (options.renderBeforeBind) {
\t\t\tthis.resetSessionRailSession();
\t\t\tthis.renderCurrentSessionState();
''',
        "session replacement reset",
    )
    interactive = replace_once(
        interactive,
        '\t\t\t\tthis.liveExecutionGroup = undefined;\n\t\t\t\tthis.ensureLiveTranscriptTurn("user");',
        '\t\t\t\tthis.liveExecutionGroup = undefined;\n'
        '\t\t\t\tthis.recordSessionRailSkillMessage(event.message);\n'
        '\t\t\t\tthis.ensureLiveTranscriptTurn("user");',
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
        "\t\t\t\tthis.sessionRailPendingSkillReads.clear();\n",
        "agent end pending cleanup",
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

	private recordSessionRailSkillMessage(message: Message): void {
		if (message.role !== "user") return;
		const skillBlock = parseSkillBlock(this.getUserMessageText(message));
		if (!skillBlock || this.sessionRailUsedSkills.has(skillBlock.name)) return;
		this.sessionRailUsedSkills.add(skillBlock.name);
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
        "rail helper methods",
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
        '''\t\tappendWholeSection(lines, createNowSection(this.data, innerWidth), topContentLimit);
\t\tif (this.data.agents.length > 0) {
''',
        '''\t\tappendWholeSection(lines, createNowSection(this.data, innerWidth), topContentLimit);
\t\tif (this.data.skills.length > 0) {
\t\t\tappendWholeSection(
\t\t\t\tlines,
\t\t\t\tcreateSection("SKILLS USED", formatResourceList(this.data.skills), innerWidth),
\t\t\t\ttopContentLimit,
\t\t\t);
\t\t}
\t\tif (this.data.agents.length > 0) {
''',
        "used skills renderer",
    )
    rail_path.write_text(rail, encoding="utf-8")

    test_updates = {
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
    for relative_path, (old, new) in test_updates.items():
        path = ROOT / relative_path
        content = path.read_text(encoding="utf-8")
        path.write_text(replace_once(content, old, new, relative_path), encoding="utf-8")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: apply-side-rail-fix.py <write-tests|apply>")
    if sys.argv[1] == "write-tests":
        write_regression_tests()
        return
    if sys.argv[1] == "apply":
        apply_implementation()
        return
    raise SystemExit(f"unknown mode: {sys.argv[1]}")


if __name__ == "__main__":
    main()
