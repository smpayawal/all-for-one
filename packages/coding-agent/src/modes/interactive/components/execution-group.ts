import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	type ExecutionGroupActionState,
	type ExecutionGroupStatus,
	formatExecutionGroupStatus,
	summarizeExecutionGroup,
	type ToolActionStatus,
} from "../execution-group-state.ts";
import { type ThemeColor, theme } from "../theme/theme.ts";
import {
	formatToolActionSummary,
	getExecutionGroupTarget,
	getExecutionGroupTitle,
	type ToolActionSummaryData,
} from "../tool-action-summary.ts";
import type { ToolExecutionComponent } from "./tool-execution.ts";

export interface ExecutionGroupAction extends ToolActionSummaryData {
	id: string;
	component: ToolExecutionComponent;
}

function getStatusColor(status: ExecutionGroupStatus): ThemeColor {
	switch (status) {
		case "failure":
			return "error";
		case "warning":
			return "warning";
		case "cancelled":
			return "muted";
		case "running":
			return "accent";
		case "success":
			return "success";
		case "pending":
			return "dim";
		case "unknown":
			return "muted";
	}
}

function padToWidth(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

export class ExecutionGroupComponent implements Component {
	readonly groupKey: string;
	private readonly actionList: ExecutionGroupAction[] = [];
	private expanded: boolean;

	constructor(groupKey: string, expanded = true) {
		this.groupKey = groupKey;
		this.expanded = expanded;
	}

	get actions(): readonly ExecutionGroupAction[] {
		return this.actionList;
	}

	get actionCount(): number {
		return this.actionList.length;
	}

	isExpanded(): boolean {
		return this.expanded;
	}

	addAction(action: ExecutionGroupAction): void {
		const existing = this.getAction(action.id);
		if (existing) {
			existing.toolName = action.toolName;
			existing.args = action.args;
			existing.status = action.status;
			existing.component = action.component;
			return;
		}
		this.actionList.push(action);
	}

	removeAction(id: string): ExecutionGroupAction | undefined {
		const index = this.actionList.findIndex((action) => action.id === id);
		if (index < 0) return undefined;
		return this.actionList.splice(index, 1)[0];
	}

	getAction(id: string): ExecutionGroupAction | undefined {
		return this.actionList.find((action) => action.id === id);
	}

	updateActionStatus(id: string, status: ToolActionStatus): void {
		const action = this.getAction(id);
		if (action) action.status = status;
	}

	setGroupExpanded(expanded: boolean): void {
		this.expanded = expanded;
	}

	/** Existing ctrl+o behavior also updates the native child renderers. */
	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
		for (const action of this.actionList) {
			action.component.setExpanded(expanded);
		}
	}

	setShowImages(showImages: boolean): void {
		for (const action of this.actionList) action.component.setShowImages(showImages);
	}

	setImageWidthCells(width: number): void {
		for (const action of this.actionList) action.component.setImageWidthCells(width);
	}

	invalidate(): void {
		for (const action of this.actionList) action.component.invalidate();
	}

	render(width: number): string[] {
		const normalizedWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
		if (normalizedWidth === 0) return [];

		const stateActions: ExecutionGroupActionState[] = this.actionList.map((action) => ({ status: action.status }));
		const summary = summarizeExecutionGroup(stateActions);
		const lines = [this.renderHeader(normalizedWidth, summary.status, summary)];

		if (this.expanded) {
			for (const action of this.actionList) lines.push(...action.component.render(normalizedWidth));
		} else {
			for (const action of this.actionList) lines.push(this.renderCollapsedAction(action, normalizedWidth));
		}

		return lines;
	}

	private renderHeader(
		width: number,
		status: ExecutionGroupStatus,
		summary: ReturnType<typeof summarizeExecutionGroup>,
	): string {
		const border = theme.fg("borderAccent", "│");
		if (width === 1) return border;

		const innerWidth = width - 1;
		const title = getExecutionGroupTitle(this.actionList);
		const target = getExecutionGroupTarget(this.actionList);
		const arrow = this.expanded ? "▾" : "▸";
		const plainRight = formatExecutionGroupStatus(summary);
		const right = theme.fg(getStatusColor(status), plainRight);
		const leftBase = `${arrow} ${title}`;
		const styledBase = `${theme.fg("borderAccent", arrow)} ${theme.bold(theme.fg("toolTitle", title))}`;
		const leftWithTarget = target ? `${leftBase}  ${target}` : leftBase;
		const styledWithTarget = target ? `${styledBase}  ${theme.fg("mdLink", target)}` : styledBase;

		let headerContent: string;
		if (visibleWidth(plainRight) >= innerWidth) {
			headerContent = truncateToWidth(right, innerWidth, "");
		} else {
			const leftWidth = Math.max(0, innerWidth - visibleWidth(plainRight) - 1);
			const left = truncateToWidth(styledWithTarget, leftWidth, "");
			const plainLeftWidth = Math.min(visibleWidth(leftWithTarget), leftWidth);
			const gap = Math.max(1, innerWidth - plainLeftWidth - visibleWidth(plainRight));
			headerContent = `${left}${" ".repeat(gap)}${right}`;
		}

		const filled = padToWidth(truncateToWidth(headerContent, innerWidth, ""), innerWidth);
		return `${border}${theme.bg("selectedBg", filled)}`;
	}

	private renderCollapsedAction(action: ExecutionGroupAction, width: number): string {
		const border = theme.fg("borderAccent", "│");
		if (width === 1) return border;
		const contentWidth = Math.max(0, width - 2);
		return `${border} ${formatToolActionSummary(action, contentWidth)}`;
	}
}

export function isExecutionGroupComponent(value: Component): value is ExecutionGroupComponent {
	return value instanceof ExecutionGroupComponent;
}
