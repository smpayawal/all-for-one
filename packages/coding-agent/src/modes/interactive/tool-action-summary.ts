import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	type ExecutionGroupActionState,
	getExecutionGroupStatusSymbol,
	type ToolActionStatus,
} from "./execution-group-state.ts";
import { type ThemeColor, theme } from "./theme/theme.ts";

export interface ToolActionSummaryData extends ExecutionGroupActionState {
	toolName: string;
	args: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function getString(record: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
	if (!record) return undefined;
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

/** Return only structured fields already used by native tool call renderers. */
export function getToolActionTarget(toolName: string, args: unknown): string | undefined {
	const record = asRecord(args);
	const name = toolName.toLowerCase();
	if (name === "bash" || name === "shell") return getString(record, "command");
	if (name === "grep" || name === "search") return getString(record, "pattern", "query", "path");
	if (name === "find") return getString(record, "pattern", "path");
	if (name === "read" || name === "ls" || name === "edit" || name === "write") {
		return getString(record, "path", "file_path");
	}
	if (name === "apply_patch") return "patch";
	return getString(record, "url");
}

export function formatToolActionName(toolName: string): string {
	const normalized = toolName.replace(/[_-]+/g, " ").trim();
	if (!normalized) return "Tool";
	return normalized[0]!.toUpperCase() + normalized.slice(1);
}

function getStatusColor(status: ToolActionStatus): ThemeColor {
	switch (status) {
		case "failure":
			return "error";
		case "warning":
		case "cancelled":
			return "warning";
		case "running":
		case "success":
			return "accent";
		case "pending":
		case "unknown":
			return "muted";
	}
}

function padToWidth(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

/** Render a compact, width-bounded action row without parsing tool output. */
export function formatToolActionSummary(action: ToolActionSummaryData, width: number): string {
	const normalizedWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
	if (normalizedWidth === 0) return "";

	const symbol = getExecutionGroupStatusSymbol(action.status);
	const label = formatToolActionName(action.toolName);
	const plainPrefix = `${symbol} ${label}`;
	const styledPrefix = `${theme.fg(getStatusColor(action.status), symbol)} ${theme.fg("toolTitle", label)}`;
	if (visibleWidth(plainPrefix) >= normalizedWidth) {
		return padToWidth(truncateToWidth(styledPrefix, normalizedWidth, ""), normalizedWidth);
	}

	const target = getToolActionTarget(action.toolName, action.args);
	if (!target) return padToWidth(styledPrefix, normalizedWidth);

	const separator = "  ";
	const targetWidth = normalizedWidth - visibleWidth(plainPrefix) - visibleWidth(separator);
	if (targetWidth <= 0) return padToWidth(styledPrefix, normalizedWidth);

	const styledTarget = theme.fg("muted", target);
	return padToWidth(`${styledPrefix}${separator}${truncateToWidth(styledTarget, targetWidth, "")}`, normalizedWidth);
}

function isInspectionTool(toolName: string): boolean {
	return new Set(["read", "grep", "find", "ls", "search"]).has(toolName.toLowerCase());
}

function isModificationTool(toolName: string): boolean {
	return new Set(["edit", "write", "apply_patch"]).has(toolName.toLowerCase());
}

function isValidationAction(action: ToolActionSummaryData): boolean {
	const name = action.toolName.toLowerCase();
	if (["test", "check", "lint", "build", "typecheck"].includes(name)) return true;
	if (name !== "bash" && name !== "shell") return false;
	const command = getToolActionTarget(action.toolName, action.args);
	return command !== undefined && /\b(test|check|lint|build|typecheck|vitest|jest|tsc|biome|eslint)\b/i.test(command);
}

/** Choose a title from tool metadata only; mixed or unknown sequences stay generic. */
export function getExecutionGroupTitle(actions: readonly ToolActionSummaryData[]): string {
	if (actions.length === 0) return "Tool execution";
	if (actions.every((action) => isInspectionTool(action.toolName))) return "Repository inspection";
	if (actions.every((action) => isModificationTool(action.toolName))) return "File changes";
	if (actions.every(isValidationAction)) return "Validation";
	return "Tool execution";
}
