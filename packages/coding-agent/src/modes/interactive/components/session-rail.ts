import * as path from "node:path";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.ts";

export const ALL_FOR_ONE_MIN_TERMINAL_WIDTH = 128;
export const ALL_FOR_ONE_MIN_RAIL_WIDTH = 36;
export const ALL_FOR_ONE_MAX_RAIL_WIDTH = 44;

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

function getRailWidth(width: number): number {
	return Math.max(ALL_FOR_ONE_MIN_RAIL_WIDTH, Math.min(ALL_FOR_ONE_MAX_RAIL_WIDTH, Math.floor(width / 5)));
}

export function getAllForOneLayout(width: number): {
	railVisible: boolean;
	railWidth: number;
	mainWidth: number;
} {
	if (width < ALL_FOR_ONE_MIN_TERMINAL_WIDTH) {
		return { railVisible: false, railWidth: 0, mainWidth: width };
	}

	const railWidth = getRailWidth(width);
	return {
		railVisible: true,
		railWidth,
		mainWidth: width - railWidth - 1,
	};
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
		if (separator === -1) {
			return theme.bold(theme.fg("accent", segment));
		}

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

function formatLifecycle(lifecycle: SessionRailLifecycle): string {
	switch (lifecycle.kind) {
		case "idle":
			return theme.fg("dim", "  Idle");
		case "agent":
			return theme.fg("accent", "  Working");
		case "retry":
			return theme.fg("warning", `  Retrying ${lifecycle.attempt}/${lifecycle.maxAttempts}`);
		case "compaction":
			return theme.fg("warning", "  Compacting");
	}
}

function formatToolEvent(event: SessionRailToolEvent): string {
	const marker = event.status === "success" ? theme.fg("success", "✓") : theme.fg("error", "×");
	return `  ${marker} ${railLine(event.toolName, 26)}`;
}

function formatProgress(progress: SessionRailProgress, width: number): string {
	const ratio = `${progress.completed}/${progress.total}`;
	const label = railLine(`${progress.label} ${ratio}`, Math.max(1, width - 14));
	const barWidth = Math.max(4, Math.min(10, width - visibleWidth(label) - 5));
	const filled = Math.round((progress.completed / progress.total) * barWidth);
	const bar = theme.fg("success", "━".repeat(filled)) + theme.fg("borderMuted", "─".repeat(barWidth - filled));
	return `  ${label} ${bar}`;
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

export class ResponsiveMainColumn implements Component {
	private readonly content: Component;

	constructor(content: Component) {
		this.content = content;
	}

	private getDividerLine(width: number): string {
		const layout = getAllForOneLayout(width);
		if (!layout.railVisible) return "";
		return " ".repeat(layout.mainWidth) + theme.fg("border", "│");
	}

	render(width: number): string[] {
		const layout = getAllForOneLayout(width);
		const lines = this.content.render(layout.mainWidth);
		if (!layout.railVisible) {
			return lines;
		}

		return lines.map((line) => {
			const truncated = truncateToWidth(line, layout.mainWidth, "");
			return (
				truncated + " ".repeat(Math.max(0, layout.mainWidth - visibleWidth(truncated))) + theme.fg("border", "│")
			);
		});
	}

	renderEmptyLine(width: number): string {
		return this.getDividerLine(width);
	}

	invalidate(): void {
		this.content.invalidate?.();
	}
}

/** Composite the transcript and bottom controls so short sessions keep the editor at the viewport bottom. */
export class ResponsiveViewport implements Component {
	private readonly mainColumn: ResponsiveMainColumn;
	private readonly bottom: Component;
	private readonly getTerminalHeight: () => number;

	constructor(content: Component, bottom: Component, getTerminalHeight: () => number) {
		this.mainColumn = new ResponsiveMainColumn(content);
		this.bottom = bottom;
		this.getTerminalHeight = getTerminalHeight;
	}

	getAvailableMainHeight(width: number): number {
		return Math.max(0, this.getTerminalHeight() - this.bottom.render(width).length);
	}

	render(width: number): string[] {
		const mainLines = this.mainColumn.render(width);
		const bottomLines = this.bottom.render(width);
		const availableMainHeight = Math.max(0, this.getTerminalHeight() - bottomLines.length);
		const targetHeight = Math.max(mainLines.length, availableMainHeight);

		while (mainLines.length < targetHeight) {
			mainLines.push(this.mainColumn.renderEmptyLine(width));
		}

		return [...mainLines, ...bottomLines];
	}

	invalidate(): void {
		this.mainColumn.invalidate();
		this.bottom.invalidate?.();
	}
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
		const lines: string[] = [];
		const availableHeight = Math.max(0, Math.floor(this.data.getAvailableHeight()));
		const addSection = (label: string, values: readonly string[]): void => {
			lines.push(theme.bold(theme.fg("mdHeading", label)));
			for (const value of values) {
				lines.push(theme.fg("dim", railLine(`  ${value}`, width)));
			}
		};
		const addResourceSection = (label: string, resources: readonly string[]): void => {
			addSection(label, resources.length > 0 ? formatResourceList(resources) : ["—"]);
		};

		const title = "ALL-FOR-ONE";
		const titleRuleWidth = Math.max(1, width - visibleWidth(title) - 1);
		lines.push(`${theme.bold(theme.fg("accent", title))} ${theme.fg("border", "─".repeat(titleRuleWidth))}`);
		lines.push("");
		lines.push(theme.bold(theme.fg("mdHeading", "ACTIVITY")));
		if (this.data.progress) {
			lines.push(formatProgress(this.data.progress, width));
		}
		lines.push(formatLifecycle(this.data.lifecycle));
		const outcomes = [
			...(this.data.completedTools > 0 ? [`${this.data.completedTools} succeeded`] : []),
			...(this.data.failedTools > 0 ? [`${this.data.failedTools} failed`] : []),
		];
		if (outcomes.length > 0) {
			lines.push(theme.fg("dim", `  ${outcomes.join(" · ")}`));
		}
		if (this.data.activeTools.length > 0) {
			for (const toolName of this.data.activeTools.slice(0, 3)) {
				lines.push(theme.fg("accent", railLine(`  ● ${toolName}`, width)));
			}
			if (this.data.activeTools.length > 3) {
				lines.push(theme.fg("dim", `  +${this.data.activeTools.length - 3} more active`));
			}
		}
		for (const event of this.data.recentTools.slice(-3)) {
			lines.push(theme.fg("dim", formatToolEvent(event)));
		}
		if (this.data.recentTools.length > 3) {
			lines.push(theme.fg("dim", `  +${this.data.recentTools.length - 3} more`));
		}

		lines.push("");
		addResourceSection("CONTEXT / AGENTS", this.data.agents);
		lines.push("");
		addResourceSection("SKILLS", this.data.skills);

		const shortcutLines =
			this.data.shortcutSummary && availableHeight >= 12
				? ["", ...wrapRailText(this.data.shortcutSummary, width).map(styleShortcutLine)]
				: [];
		const contentHeight = Math.max(0, availableHeight - shortcutLines.length);
		const visibleContent = lines.slice(0, contentHeight);
		const padding = Array.from({ length: Math.max(0, contentHeight - visibleContent.length) }, () => "");
		return [...visibleContent, ...padding, ...shortcutLines].slice(0, availableHeight);
	}

	invalidate(): void {}
}
