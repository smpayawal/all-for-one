import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { UserMessage } from "@earendil-works/pi-ai";
import type { SessionEntry } from "../session-manager.ts";

/**
 * Deterministic rules for what compaction should preserve, summarize, or evict.
 *
 * This is a prompt and documentation contract. It does not classify messages or
 * add a second persistence system beside the native session manager.
 */

export type ContextRetentionKind =
	| "invariant"
	| "session-anchor"
	| "summary-state"
	| "recent-exact"
	| "external-evidence"
	| "ephemeral";

export interface ContextRetentionRule {
	readonly kind: ContextRetentionKind;
	readonly examples: readonly string[];
	readonly treatment: string;
}

export interface RetainedUserMessageSettings {
	retainRecentUserMessages?: number;
	retainRecentUserMessageChars?: number;
}

export interface RetainedUserMessage {
	entryId: string;
	message: UserMessage;
}

export type EvidenceReferenceKind = "tool-output" | "validation" | "file";

export interface EvidenceReference {
	kind: EvidenceReferenceKind;
	label: string;
	ref: string;
}

export const DEFAULT_RETAINED_USER_MESSAGE_CHARS = 8_000;
export const MAX_RETAINED_USER_MESSAGES = 8;
export const MAX_RETAINED_USER_MESSAGE_CHARS = 16_000;

export const CONTEXT_RETENTION_CONTRACT: readonly ContextRetentionRule[] = [
	{
		kind: "invariant",
		examples: ["system prompt", "active project and path-scoped instructions"],
		treatment: "Do not duplicate invariant project instructions in the summary; they are managed by the runtime.",
	},
	{
		kind: "session-anchor",
		examples: ["explicit user constraints", "current corrections", "active blockers"],
		treatment: "Preserve explicit user constraints and current corrections exactly when they remain active.",
	},
	{
		kind: "summary-state",
		examples: ["goal", "progress", "decisions", "validation state"],
		treatment:
			"Keep this as concise structured continuation state, including what is done, in progress, blocked, or validated.",
	},
	{
		kind: "recent-exact",
		examples: ["newest turns", "recent tool interactions"],
		treatment:
			"Leave the native recent exact suffix intact; do not restate it as if it were older summarized history.",
	},
	{
		kind: "external-evidence",
		examples: ["files", "saved tool output", "validation logs"],
		treatment:
			"Preserve exact paths, symbols, commands, identifiers, and evidence references when present so details can be retrieved on demand.",
	},
	{
		kind: "ephemeral",
		examples: ["redundant observations", "superseded working notes"],
		treatment:
			"Summarize or evict low-signal details only after preserving the current active state and any exact evidence reference.",
	},
];

export function renderContextRetentionContract(): string {
	return CONTEXT_RETENTION_CONTRACT.map(
		(rule) => `- ${rule.kind}: ${rule.treatment} Examples: ${rule.examples.join(", ")}.`,
	).join("\n");
}

function normalizeLimit(value: number | undefined, fallback: number, maximum: number): number {
	if (value === undefined || !Number.isFinite(value)) return fallback;
	return Math.min(maximum, Math.max(0, Math.floor(value)));
}

function renderUserMessageContent(content: UserMessage["content"]): string {
	if (typeof content === "string") return content;
	return content.map((block) => (block.type === "text" ? block.text : "[image content]")).join("\n");
}

/**
 * Select recent user-authored messages from a summarized entry range.
 *
 * Selection is deterministic, bounded, and exact: a message is either kept in
 * full or omitted when it cannot fit the configured character budget.
 */
export function selectRetainedUserMessages(
	entries: SessionEntry[],
	startIndex: number,
	endIndex: number,
	settings: RetainedUserMessageSettings,
): RetainedUserMessage[] {
	const maxMessages = normalizeLimit(settings.retainRecentUserMessages, 0, MAX_RETAINED_USER_MESSAGES);
	const maxChars = normalizeLimit(
		settings.retainRecentUserMessageChars,
		DEFAULT_RETAINED_USER_MESSAGE_CHARS,
		MAX_RETAINED_USER_MESSAGE_CHARS,
	);
	if (maxMessages === 0 || maxChars === 0) return [];

	const selected: RetainedUserMessage[] = [];
	let remainingChars = maxChars;
	const start = Math.max(0, startIndex);
	const end = Math.min(entries.length, Math.max(start, endIndex));

	for (let index = end - 1; index >= start && selected.length < maxMessages; index -= 1) {
		const entry = entries[index];
		if (entry?.type !== "message" || entry.message.role !== "user") continue;

		const content = renderUserMessageContent(entry.message.content);
		if (content.length === 0 || content.length > remainingChars) continue;

		selected.push({ entryId: entry.id, message: entry.message });
		remainingChars -= content.length;
	}

	return selected.reverse();
}

export function formatRetainedUserMessages(messages: readonly RetainedUserMessage[]): string {
	if (messages.length === 0) return "";

	const lines = messages.map(({ entryId, message }) => {
		const content = renderUserMessageContent(message.content);
		return `- [source entry: ${entryId}] ${content}`;
	});
	return [
		"## Retained User Context",
		"The following user-authored messages were retained exactly from before compaction:",
		...lines,
	].join("\n");
}

export function getFullOutputPath(value: unknown): string | undefined {
	if (!value || typeof value !== "object") return undefined;
	const fullOutputPath = (value as { fullOutputPath?: unknown }).fullOutputPath;
	return typeof fullOutputPath === "string" && fullOutputPath.length > 0 ? fullOutputPath : undefined;
}

/** Collect only explicit saved-output paths already attached to session messages. */
export function collectEvidenceReferences(messages: readonly AgentMessage[]): EvidenceReference[] {
	const references: EvidenceReference[] = [];
	const seen = new Set<string>();

	for (const message of messages) {
		let ref: string | undefined;
		let label: string | undefined;
		if (message.role === "toolResult") {
			ref = getFullOutputPath(message.details);
			label = `${message.toolName} output`;
		} else if ("fullOutputPath" in message) {
			ref = getFullOutputPath(message);
			label = message.role === "bashExecution" ? "bash output" : "tool output";
		}

		if (!ref || !label || seen.has(ref)) continue;
		seen.add(ref);
		references.push({ kind: "tool-output", label, ref });
	}

	return references;
}

export function formatEvidenceReferences(references: readonly EvidenceReference[]): string {
	if (references.length === 0) return "";

	return [
		"## Evidence References",
		"Exact external evidence already available for on-demand retrieval:",
		...references.map((reference) => `- [${reference.kind}] ${reference.label}: ${reference.ref}`),
	].join("\n");
}
