import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { UserMessage } from "@earendil-works/pi-ai";
import { scanMemoryText } from "../memory.ts";
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
export const MAX_EVIDENCE_REFERENCES = 32;
export const MAX_EVIDENCE_REFERENCE_CHARS = 1_024;
export const MAX_EVIDENCE_LABEL_CHARS = 256;
export const MAX_EVIDENCE_SECTION_CHARS = 12_000;

const EVIDENCE_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const RETAINED_NON_TEXT_NOTE = "[Non-text attachments are not included in retained exact text.]";
const EVIDENCE_SECTION_PREFIX =
	"## Evidence References\nExact external evidence already available for on-demand retrieval:\n";

export function normalizeEvidenceReference(value: unknown): EvidenceReference | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const candidate = value as Partial<EvidenceReference>;
	if (candidate.kind !== "tool-output" && candidate.kind !== "validation" && candidate.kind !== "file") {
		return undefined;
	}
	if (typeof candidate.label !== "string" || typeof candidate.ref !== "string") return undefined;
	const label = candidate.label.trim();
	const ref = candidate.ref.trim();
	if (
		label.length === 0 ||
		label.length > MAX_EVIDENCE_LABEL_CHARS ||
		ref.length === 0 ||
		ref.length > MAX_EVIDENCE_REFERENCE_CHARS ||
		EVIDENCE_CONTROL_CHARACTER_PATTERN.test(label) ||
		EVIDENCE_CONTROL_CHARACTER_PATTERN.test(ref)
	) {
		return undefined;
	}
	return { kind: candidate.kind, label, ref };
}

function formatEvidenceReferenceLine(reference: EvidenceReference): string {
	return `- [${reference.kind}] ${reference.label}: ${reference.ref}\n`;
}

/** Estimate the bounded evidence section using normalized, de-duplicated references. */
export function getEvidenceReferenceSectionChars(references: readonly unknown[]): number {
	let sectionChars = EVIDENCE_SECTION_PREFIX.length;
	const seen = new Set<string>();
	for (const candidate of references) {
		const reference = normalizeEvidenceReference(candidate);
		if (!reference || seen.has(reference.ref)) continue;
		seen.add(reference.ref);
		sectionChars += formatEvidenceReferenceLine(reference).length;
	}
	return sectionChars;
}

/** Normalize and retain the newest references within both count and section budgets. */
export function boundEvidenceReferences(references: readonly unknown[]): EvidenceReference[] {
	let sectionChars = EVIDENCE_SECTION_PREFIX.length;
	const selected: EvidenceReference[] = [];
	const seen = new Set<string>();

	for (let index = references.length - 1; index >= 0 && selected.length < MAX_EVIDENCE_REFERENCES; index -= 1) {
		const reference = normalizeEvidenceReference(references[index]);
		if (!reference || seen.has(reference.ref)) continue;
		const line = formatEvidenceReferenceLine(reference);
		if (sectionChars + line.length > MAX_EVIDENCE_SECTION_CHARS) continue;
		seen.add(reference.ref);
		selected.push(reference);
		sectionChars += line.length;
	}

	return selected.reverse();
}

export interface NormalizedEvidenceReferences {
	references: EvidenceReference[];
	malformed: boolean;
}

export function normalizeEvidenceReferences(value: unknown): NormalizedEvidenceReferences {
	if (!Array.isArray(value)) return { references: [], malformed: true };
	let malformed = false;
	const references: EvidenceReference[] = [];
	for (const candidate of value) {
		const normalized = normalizeEvidenceReference(candidate);
		if (!normalized) {
			malformed = true;
			continue;
		}
		references.push(normalized);
	}
	if (
		references.length > MAX_EVIDENCE_REFERENCES ||
		getEvidenceReferenceSectionChars(references) > MAX_EVIDENCE_SECTION_CHARS
	) {
		malformed = true;
	}
	return { references: boundEvidenceReferences(references), malformed };
}

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

interface RenderedUserMessageContent {
	text: string;
	hasNonTextContent: boolean;
}

function renderUserMessageContent(content: UserMessage["content"]): RenderedUserMessageContent {
	if (typeof content === "string") return { text: content, hasNonTextContent: false };
	const textBlocks: string[] = [];
	let hasNonTextContent = false;
	for (const block of content) {
		if (block.type === "text") {
			textBlocks.push(block.text);
		} else {
			hasNonTextContent = true;
		}
	}
	return { text: textBlocks.join("\n"), hasNonTextContent };
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

		const rendered = renderUserMessageContent(entry.message.content);
		if (
			rendered.text.length === 0 ||
			rendered.text.length > remainingChars ||
			scanMemoryText(rendered.text).length > 0
		) {
			continue;
		}

		selected.push({ entryId: entry.id, message: entry.message });
		remainingChars -= rendered.text.length;
	}

	return selected.reverse();
}

export function formatRetainedUserMessages(messages: readonly RetainedUserMessage[]): string {
	if (messages.length === 0) return "";

	const lines = messages.flatMap(({ entryId, message }) => {
		const rendered = renderUserMessageContent(message.content);
		if (rendered.text.length === 0) return [];
		return [
			`- [source entry: ${entryId}]`,
			...rendered.text.split(/\r?\n/).map((line) => `  > ${line}`),
			...(rendered.hasNonTextContent ? [`  > ${RETAINED_NON_TEXT_NOTE}`] : []),
		];
	});
	if (lines.length === 0) return "";
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

		const normalized = normalizeEvidenceReference({ kind: "tool-output", label, ref });
		if (normalized) references.push(normalized);
	}

	return boundEvidenceReferences(references);
}

export function formatEvidenceReferences(references: readonly EvidenceReference[]): string {
	const boundedReferences = boundEvidenceReferences(references);
	if (boundedReferences.length === 0) return "";

	return [
		"## Evidence References",
		"Exact external evidence already available for on-demand retrieval:",
		...boundedReferences.map((reference) => `- [${reference.kind}] ${reference.label}: ${reference.ref}`),
	].join("\n");
}
