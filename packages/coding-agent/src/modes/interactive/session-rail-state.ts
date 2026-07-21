import { canonicalizePath, resolvePath } from "../../utils/paths.ts";
import type { SessionRailLifecycle, SessionRailProgress, SessionRailToolEvent } from "./components/session-rail.ts";

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
