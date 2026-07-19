import * as path from "node:path";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { type ThemeColor, theme } from "../theme/theme.ts";

export {
	getSessionRailLayout,
	SESSION_RAIL_MAX_WIDTH,
	SESSION_RAIL_MIN_TERMINAL_WIDTH,
	SESSION_RAIL_MIN_WIDTH,
} from "../responsive-layout.ts";

const HORIZONTAL_PADDING = 1;
const TOP_PADDING_MIN_HEIGHT = 12;

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

function padRailLine(line: string, width: number, innerWidth: number): string {
	const clipped = truncateToWidth(line, innerWidth, "");
	const rightPadding = Math.max(0, width - HORIZONTAL_PADDING - visibleWidth(clipped));
	return `${" ".repeat(HORIZONTAL_PADDING)}${clipped}${" ".repeat(rightPadding)}`;
}

function wrapRailText(value: string, width: number): string[] {
	const contentWidth = Math.max(1, width);
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

function formatBrandLine(title: string, width: number): string {
	const mark = "◆";
	const plainTitle = `${mark} ${title}`;
	const ruleWidth = Math.max(0, width - visibleWidth(plainTitle) - 1);
	const rule = ruleWidth > 0 ? ` ${theme.fg("border", "─".repeat(ruleWidth))}` : "";
	const styled = `${theme.fg("warning", mark)} ${theme.bold(theme.fg("accent", title))}${rule}`;
	const truncated = truncateToWidth(styled, width, "");
	return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function formatLifecycle(lifecycle: SessionRailLifecycle): string {
	switch (lifecycle.kind) {
		case "idle":
			return theme.fg("muted", " Idle");
		case "agent":
			return theme.fg("borderAccent", " Working");
		case "retry":
			return theme.fg("warning", ` Retrying ${lifecycle.attempt}/${lifecycle.maxAttempts}`);
		case "compaction":
			return theme.fg("warning", " Compacting");
	}
}

function formatToolEvent(event: SessionRailToolEvent, width: number): string {
	const marker = event.status === "success" ? theme.fg("success", "✓") : theme.fg("error", "×");
	return ` ${marker} ${theme.fg("muted", railLine(event.toolName, Math.max(1, width - 3)))}`;
}

function formatProgress(progress: SessionRailProgress, width: number): string {
	const ratio = `${progress.completed}/${progress.total}`;
	const label = railLine(`${progress.label} ${ratio}`, Math.max(1, width - 13));
	const barWidth = Math.max(4, Math.min(10, width - visibleWidth(label) - 4));
	const filled = Math.round((progress.completed / progress.total) * barWidth);
	const bar = theme.fg("success", "━".repeat(filled)) + theme.fg("borderMuted", "─".repeat(barWidth - filled));
	return ` ${theme.fg("muted", label)} ${bar}`;
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

function createSection(label: string, values: readonly string[], width: number, valueColor: ThemeColor = "muted"): string[] {
	return [sectionTitle(label), ...values.map((value) => theme.fg(valueColor, railLine(` ${value}`, width)))];
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
	if (data.lifecycle.kind === "idle") valueColor = "muted";
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

		const innerWidth = Math.max(1, normalizedWidth - HORIZONTAL_PADDING * 2);
		const topPadding = availableHeight >= TOP_PADDING_MIN_HEIGHT ? 1 : 0;
		const contentHeight = Math.max(0, availableHeight - topPadding);
		const shortcutLines =
			this.data.shortcutSummary && contentHeight >= 11
				? wrapRailText(this.data.shortcutSummary, innerWidth).map(styleShortcutLine)
				: [];
		const helpHeight = shortcutLines.length > 0 ? shortcutLines.length + 1 : 0;
		const contentLimit = Math.max(0, contentHeight - helpHeight);
		const lines: string[] = [];

		const title = sanitize(this.data.title);
		lines.push(formatBrandLine(title, innerWidth));

		const activity: string[] = [sectionTitle("ACTIVITY"), formatLifecycle(this.data.lifecycle)];
		const outcomes = [
			...(this.data.completedTools > 0 ? [`${this.data.completedTools} succeeded`] : []),
			...(this.data.failedTools > 0 ? [`${this.data.failedTools} failed`] : []),
		];
		if (outcomes.length > 0) activity.push(theme.fg("muted", ` ${outcomes.join(" · ")}`));
		if (this.data.progress) activity.push(formatProgress(this.data.progress, innerWidth));
		for (const toolName of this.data.activeTools.slice(0, 3)) {
			activity.push(theme.fg("borderAccent", railLine(` ● ${toolName}`, innerWidth)));
		}
		if (this.data.activeTools.length > 3) {
			activity.push(theme.fg("muted", ` +${this.data.activeTools.length - 3} more active`));
		}
		for (const event of this.data.recentTools.slice(-3)) activity.push(formatToolEvent(event, innerWidth));
		if (this.data.recentTools.length > 3) {
			activity.push(theme.fg("muted", ` +${this.data.recentTools.length - 3} more`));
		}

		if (contentLimit > lines.length) {
			lines.push("");
			lines.push(...activity.slice(0, Math.max(0, contentLimit - lines.length)));
		}
		appendWholeSection(lines, createCurrentTurnSection(this.data, innerWidth), contentLimit);
		appendWholeSection(
			lines,
			createSection(
				"CONTEXT / AGENTS",
				this.data.agents.length > 0 ? formatResourceList(this.data.agents) : ["—"],
				innerWidth,
			),
			contentLimit,
		);
		appendWholeSection(
			lines,
			createSection(
				"SKILLS",
				this.data.skills.length > 0 ? formatResourceList(this.data.skills) : ["—"],
				innerWidth,
			),
			contentLimit,
		);

		const visibleContent = lines.slice(0, contentLimit);
		const padding = Array.from({ length: Math.max(0, contentLimit - visibleContent.length) }, () => "");
		const renderedBody = [...visibleContent, ...padding]
			.slice(0, contentLimit)
			.map((line) => padRailLine(line, normalizedWidth, innerWidth));
		const renderedHelp = shortcutLines.length > 0 ? [" ".repeat(normalizedWidth), ...shortcutLines] : [];
		return [
			...Array.from({ length: topPadding }, () => " ".repeat(normalizedWidth)),
			...renderedBody,
			...renderedHelp,
		].slice(0, availableHeight);
	}

	invalidate(): void {}
}
