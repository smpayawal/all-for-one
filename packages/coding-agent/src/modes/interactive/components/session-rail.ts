import * as path from "node:path";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { type ThemeColor, theme } from "../theme/theme.ts";
import { measureTuiRender, recordTuiRenderProfile } from "../tui-render-profiler.ts";
import { fillBackgroundLine } from "./background-fill.ts";

export {
	getSessionRailLayout,
	SESSION_RAIL_MAX_WIDTH,
	SESSION_RAIL_MIN_TERMINAL_WIDTH,
	SESSION_RAIL_MIN_WIDTH,
} from "../responsive-layout.ts";

const HORIZONTAL_PADDING = 1;
const SECTION_BODY_INDENT = 2;
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
	/** Retained for compatibility; branding is already visible elsewhere in the TUI. */
	title: string;
	/** Retained for compatibility; persistent shortcut help is intentionally not rendered. */
	shortcutSummary?: string;
	agents: readonly string[];
	/** Available skills remain discoverable through commands and are not shown persistently. */
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

function indentSectionBody(line: string, width: number): string {
	const indent = " ".repeat(Math.min(SECTION_BODY_INDENT, Math.max(0, width - 1)));
	const contentWidth = Math.max(0, width - visibleWidth(indent));
	return `${indent}${truncateToWidth(line, contentWidth, "")}`;
}

function padRailLine(line: string, width: number, innerWidth: number): string {
	const clipped = truncateToWidth(line, innerWidth, "");
	const rightPadding = Math.max(0, width - HORIZONTAL_PADDING - visibleWidth(clipped));
	return `${" ".repeat(HORIZONTAL_PADDING)}${clipped}${" ".repeat(rightPadding)}`;
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

function formatLifecycle(lifecycle: SessionRailLifecycle, activeTools: readonly string[], width: number): string {
	let value: string;
	if (lifecycle.kind === "retry") {
		value = theme.fg("warning", `Retrying ${lifecycle.attempt}/${lifecycle.maxAttempts}`);
	} else if (lifecycle.kind === "compaction") {
		value = theme.fg("warning", "Compacting context");
	} else if (activeTools.length > 0) {
		const active = railLine(activeTools[0] ?? "tool", Math.max(1, width - 12));
		value = theme.fg("borderAccent", `Working · ${active}`);
	} else if (lifecycle.kind === "agent") {
		value = theme.fg("borderAccent", "Preparing response");
	} else {
		value = theme.fg("muted", "Idle");
	}
	return indentSectionBody(value, width);
}

function formatToolEvent(event: SessionRailToolEvent, width: number): string {
	const marker = event.status === "success" ? theme.fg("success", "✓") : theme.fg("error", "×");
	const content = `${marker} ${theme.fg("muted", railLine(event.toolName, Math.max(1, width - 4)))}`;
	return indentSectionBody(content, width);
}

function formatProgress(progress: SessionRailProgress, width: number): string {
	const bodyWidth = Math.max(1, width - SECTION_BODY_INDENT);
	const ratio = `${progress.completed}/${progress.total}`;
	const label = railLine(`${progress.label} ${ratio}`, Math.max(1, bodyWidth - 13));
	const barWidth = Math.max(4, Math.min(10, bodyWidth - visibleWidth(label) - 2));
	const filled = Math.round((progress.completed / progress.total) * barWidth);
	const bar = theme.fg("success", "━".repeat(filled)) + theme.fg("borderMuted", "─".repeat(barWidth - filled));
	return indentSectionBody(`${theme.fg("muted", label)} ${bar}`, width);
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

function createSection(
	label: string,
	values: readonly string[],
	width: number,
	valueColor: ThemeColor = "muted",
): string[] {
	return [
		sectionTitle(label),
		...values.map((value) => indentSectionBody(theme.fg(valueColor, railLine(value, width)), width)),
	];
}

function appendWholeSection(target: string[], section: readonly string[], limit: number): boolean {
	const separatorHeight = target.length > 0 ? 1 : 0;
	if (target.length + separatorHeight + section.length > limit) return false;
	if (separatorHeight > 0) target.push("");
	target.push(...section);
	return true;
}

function createNowSection(data: SessionRailData, width: number): string[] {
	const lines = [sectionTitle("NOW"), formatLifecycle(data.lifecycle, data.activeTools, width)];
	const outcomes = [
		...(data.completedTools > 0 ? [`${data.completedTools} completed`] : []),
		...(data.failedTools > 0 ? [`${data.failedTools} failed`] : []),
	];
	if (outcomes.length > 0) {
		lines.push(indentSectionBody(theme.fg("muted", outcomes.join(" · ")), width));
	}
	if (data.progress) lines.push(formatProgress(data.progress, width));
	if (data.activeTools.length > 1) {
		lines.push(indentSectionBody(theme.fg("muted", `+${data.activeTools.length - 1} more active`), width));
	}
	for (const event of data.recentTools.slice(-2)) lines.push(formatToolEvent(event, width));
	return lines;
}

export class SessionRailComponent implements Component {
	private data: SessionRailData;
	private revision = 0;
	private cachedRevision = -1;
	private cachedWidth = -1;
	private cachedHeight = -1;
	private cachedLines: string[] = [];

	constructor(data: SessionRailData) {
		this.data = data;
	}

	setData(data: SessionRailData): void {
		this.data = data;
		this.revision += 1;
	}

	render(width: number): string[] {
		const normalizedWidth = Number.isFinite(width) ? Math.max(1, Math.floor(width)) : 1;
		const availableHeight = Math.max(0, Math.floor(this.data.getAvailableHeight()));
		if (
			this.cachedRevision === this.revision &&
			this.cachedWidth === normalizedWidth &&
			this.cachedHeight === availableHeight
		) {
			recordTuiRenderProfile("session-rail", 0, {
				width: normalizedWidth,
				height: availableHeight,
				lines: this.cachedLines.length,
				cacheHit: true,
			});
			return this.cachedLines;
		}

		const rendered = measureTuiRender(
			"session-rail",
			() => this.renderUncached(normalizedWidth, availableHeight),
			(lines) => ({
				width: normalizedWidth,
				height: availableHeight,
				lines: lines.length,
				cacheHit: false,
			}),
		);
		this.cachedRevision = this.revision;
		this.cachedWidth = normalizedWidth;
		this.cachedHeight = availableHeight;
		this.cachedLines = rendered;
		return rendered;
	}

	invalidate(): void {
		this.cachedRevision = -1;
	}

	private renderUncached(normalizedWidth: number, availableHeight: number): string[] {
		if (availableHeight === 0) return [];

		const innerWidth = Math.max(1, normalizedWidth - HORIZONTAL_PADDING * 2);
		const topPadding = availableHeight >= TOP_PADDING_MIN_HEIGHT ? 1 : 0;
		const contentLimit = Math.max(0, availableHeight - topPadding);
		const lines: string[] = [];

		appendWholeSection(lines, createNowSection(this.data, innerWidth), contentLimit);
		if (this.data.agents.length > 0) {
			appendWholeSection(
				lines,
				createSection("ACTIVE INSTRUCTIONS", formatResourceList(this.data.agents), innerWidth),
				contentLimit,
			);
		}

		const visibleContent = lines.slice(0, contentLimit);
		const padding = Array.from({ length: Math.max(0, contentLimit - visibleContent.length) }, () => "");
		const renderedBody = [...visibleContent, ...padding]
			.slice(0, contentLimit)
			.map((line) => padRailLine(line, normalizedWidth, innerWidth));
		const rendered = [
			...Array.from({ length: topPadding }, () => " ".repeat(normalizedWidth)),
			...renderedBody,
		].slice(0, availableHeight);
		return rendered.map((line) => fillBackgroundLine(line, normalizedWidth, "customMessageBg"));
	}
}
