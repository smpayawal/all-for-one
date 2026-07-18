import * as path from "node:path";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { type ThemeColor, theme } from "../theme/theme.ts";

export {
	getSessionRailLayout,
	SESSION_RAIL_MAX_WIDTH,
	SESSION_RAIL_MIN_TERMINAL_WIDTH,
	SESSION_RAIL_MIN_WIDTH,
} from "../responsive-layout.ts";

export type SessionRailLifecycle =
	| { kind: "idle" }
	| { kind: "agent" }
	| { kind: "retry"; attempt: number; maxAttempts: number }
	| { kind: "compaction" };

export type SessionRailToolStatus = "success" | "error";

export interface SessionRailToolEvent {
	toolName: string;
	status: SessionRailToolStatus;
}

export interface SessionRailProgress {
	label: string;
	completed: number;
	total: number;
}

export interface SessionRailData {
	title: string;
	shortcutSummary?: string;
	agents: readonly string[];
	skills: readonly string[];
	progress?: SessionRailProgress;
	lifecycle: SessionRailLifecycle;
	activeTools: readonly string[];
	recentTools: readonly SessionRailToolEvent[];
	completedTools: number;
	failedTools: number;
	getAvailableHeight: () => number;
}

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function sanitize(value: string): string {
	return stripAnsi(value)
		.replace(/[\u0000-\u001f\u007f]/g, " ")
		.trim();
}

function railLine(value: string, width: number): string {
	return truncateToWidth(sanitize(value), Math.max(1, width), theme.fg("dim", "..."));
}

function wrapRailText(value: string, width: number): string[] {
	const contentWidth = Math.max(1, width - 2);
	const words = sanitize(value).split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (current && visibleWidth(candidate) > contentWidth) {
			lines.push(current);
			current = word;
		} else {
			current = candidate;
		}
	}

	if (current) lines.push(current);
	return lines.length > 0 ? lines : ["—"];
}

function styleShortcutLine(line: string): string {
	const segments = line.split(" · ");
	const styledSegments = segments.map((segment) => {
		const separator = segment.indexOf(" ");
		if (separator === -1) return theme.bold(theme.fg("accent", segment));

		const shortcut = segment.slice(0, separator);
		const description = segment.slice(separator);
		return theme.bold(theme.fg("accent", shortcut)) + theme.fg("dim", description);
	});

	return theme.fg("dim", "  ") + styledSegments.join(theme.fg("dim", " · "));
}

/** Extract an extension-provided completed/total status without trusting arbitrary status text. */
export function parseRailProgress(key: string, text: string): SessionRailProgress | undefined {
	const match = sanitize(text).match(/(?:^|\s)(\d+)\s*\/\s*(\d+)(?:\s|$)/);
	if (!match) return undefined;

	const completed = Number.parseInt(match[1], 10);
	const total = Number.parseInt(match[2], 10);
	if (
		!Number.isSafeInteger(completed) ||
		!Number.isSafeInteger(total) ||
		total <= 0 ||
		completed < 0 ||
		completed > total
	) {
		return undefined;
	}

	const label = sanitize(key);
	return label ? { label, completed, total } : undefined;
}

function sectionTitle(label: string): string {
	return theme.bold(theme.fg("customMessageLabel", label));
}

function formatLifecycle(lifecycle: SessionRailLifecycle): string {
	switch (lifecycle.kind) {
		case "idle":
			return theme.fg("dim", "  Idle");
		case "agent":
			return theme.fg("borderAccent", "  Working");
		case "retry":
			return theme.fg("warning", `  Retrying ${lifecycle.attempt}/${lifecycle.maxAttempts}`);
		case "compaction":
			return theme.fg("warning", "  Compacting");
	}
}

function formatToolEvent(event: SessionRailToolEvent, width: number): string {
	const marker = event.status === "success" ? theme.fg("success", "✓") : theme.fg("error", "×");
	return `  ${marker} ${theme.fg("muted", railLine(event.toolName, Math.max(1, width - 4)))}`;
}

function formatProgress(progress: SessionRailProgress, width: number): string {
	const ratio = `${progress.completed}/${progress.total}`;
	const label = railLine(`${progress.label} ${ratio}`, Math.max(1, width - 14));
	const barWidth = Math.max(4, Math.min(10, width - visibleWidth(label) - 5));
	const filled = Math.round((progress.completed / progress.total) * barWidth);
	const bar = theme.fg("success", "━".repeat(filled)) + theme.fg("borderMuted", "─".repeat(barWidth - filled));
	return `  ${theme.fg("muted", label)} ${bar}`;
}

function formatResourceName(resourcePath: string): string {
	const normalizedPath = sanitize(resourcePath);
	return path.basename(normalizedPath) || normalizedPath;
}

function formatResourceList(resources: readonly string[]): string[] {
	const visibleResources = resources.slice(0, 3).map(formatResourceName);
	const remaining = resources.length - visibleResources.length;
	return [...visibleResources, ...(remaining > 0 ? [`+${remaining} more`] : [])];
}

function createSection(label: string, values: readonly string[], width: number, valueColor: ThemeColor = "dim"): string[] {
	return [sectionTitle(label), ...values.map((value) => theme.fg(valueColor, railLine(`  ${value}`, width)))];
}

function createCurrentTurnSection(data: SessionRailData, width: number): string[] {
	const values: string[] = [];
	if (data.activeTools.length > 0) {
		values.push(`Running ${data.activeTools[0]}`);
		if (data.activeTools.length > 1) values.push(`+${data.activeTools.length - 1} more active`);
	} else if (data.lifecycle.kind === "retry") {
		values.push(`Retry attempt ${data.lifecycle.attempt}/${data.lifecycle.maxAttempts}`);
	} else if (data.lifecycle.kind === "compaction") {
		values.push("Compacting context");
	} else if (data.lifecycle.kind === "agent") {
		values.push(data.progress?.label ? `Working on ${data.progress.label}` : "Preparing response");
	} else {
		values.push("Waiting for input");
	}
	let valueColor: ThemeColor = "borderAccent";
	if (data.lifecycle.kind === "idle") valueColor = "dim";
	if (data.lifecycle.kind === "retry" || data.lifecycle.kind === "compaction") valueColor = "warning";
	return createSection("CURRENT TURN", values, width, valueColor);
}

function appendWholeSection(target: string[], section: readonly string[], limit: number): boolean {
	const separatorHeight = target.length > 0 ? 1 : 0;
	if (target.length + separatorHeight + section.length > limit) return false;
	if (separatorHeight > 0) target.push("");
	target.push(...section);
	return true;
}

export class SessionRailComponent implements Component {
	private data: SessionRailData;

	constructor(data: SessionRailData) {
		this.data = data;
	}

	setData(data: SessionRailData): void {
		this.data = data;
	}

	render(width: number): string[] {
		const normalizedWidth = Number.isFinite(width) ? Math.max(1, Math.floor(width)) : 1;
		const availableHeight = Math.max(0, Math.floor(this.data.getAvailableHeight()));
		if (availableHeight === 0) return [];

		const shortcutLines =
			this.data.shortcutSummary && availableHeight >= 12
				? wrapRailText(this.data.shortcutSummary, normalizedWidth).map(styleShortcutLine)
				: [];
		const helpHeight = shortcutLines.length > 0 ? shortcutLines.length + 1 : 0;
		const contentLimit = Math.max(0, availableHeight - helpHeight);
		const lines: string[] = [];

		const title = sanitize(this.data.title);
		const titleRuleWidth = Math.max(1, normalizedWidth - visibleWidth(title) - 1);
		lines.push(`${theme.bold(theme.fg("accent", title))} ${theme.fg("border", "─".repeat(titleRuleWidth))}`);

		const activity: string[] = [sectionTitle("ACTIVITY")];
		if (this.data.progress) activity.push(formatProgress(this.data.progress, normalizedWidth));
		activity.push(formatLifecycle(this.data.lifecycle));
		const outcomes = [
			...(this.data.completedTools > 0 ? [`${this.data.completedTools} succeeded`] : []),
			...(this.data.failedTools > 0 ? [`${this.data.failedTools} failed`] : []),
		];
		if (outcomes.length > 0) activity.push(theme.fg("dim", `  ${outcomes.join(" · ")}`));
		for (const toolName of this.data.activeTools.slice(0, 3)) {
			activity.push(theme.fg("borderAccent", railLine(`  ● ${toolName}`, normalizedWidth)));
		}
		if (this.data.activeTools.length > 3) {
			activity.push(theme.fg("dim", `  +${this.data.activeTools.length - 3} more active`));
		}
		for (const event of this.data.recentTools.slice(-3)) activity.push(formatToolEvent(event, normalizedWidth));
		if (this.data.recentTools.length > 3) {
			activity.push(theme.fg("dim", `  +${this.data.recentTools.length - 3} more`));
		}

		if (contentLimit > lines.length) {
			lines.push("");
			lines.push(...activity.slice(0, Math.max(0, contentLimit - lines.length)));
		}
		appendWholeSection(lines, createCurrentTurnSection(this.data, normalizedWidth), contentLimit);
		appendWholeSection(
			lines,
			createSection(
				"CONTEXT / AGENTS",
				this.data.agents.length > 0 ? formatResourceList(this.data.agents) : ["—"],
				normalizedWidth,
			),
			contentLimit,
		);
		appendWholeSection(
			lines,
			createSection(
				"SKILLS",
				this.data.skills.length > 0 ? formatResourceList(this.data.skills) : ["—"],
				normalizedWidth,
			),
			contentLimit,
		);

		const visibleContent = lines.slice(0, contentLimit);
		const padding = Array.from({ length: Math.max(0, contentLimit - visibleContent.length) }, () => "");
		const help = shortcutLines.length > 0 ? ["", ...shortcutLines] : [];
		return [...visibleContent, ...padding, ...help].slice(0, availableHeight);
	}

	invalidate(): void {}
}
