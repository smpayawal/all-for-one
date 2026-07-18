import * as path from "node:path";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.ts";

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

		const title = sanitize(this.data.title);
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
