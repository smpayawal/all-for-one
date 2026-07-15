import type { SessionEntry } from "../session-manager.ts";
import type { CompactionResult } from "./compaction.ts";
import type { EvidenceReference, EvidenceReferenceKind } from "./retention.ts";

export const REQUIRED_COMPACTION_SECTIONS = [
	"Goal",
	"Constraints & Preferences",
	"Progress",
	"Key Decisions",
	"Next Steps",
	"Critical Context",
] as const;

export const MAX_COMPACTION_SUMMARY_CHARS = 128_000;

export type CompactionValidationIssueCode =
	| "summary-empty"
	| "summary-too-large"
	| "missing-section"
	| "empty-goal"
	| "invalid-first-kept-entry"
	| "invalid-tokens-before"
	| "invalid-details"
	| "invalid-retained-user-entry"
	| "invalid-evidence-reference";

export interface CompactionValidationIssue {
	code: CompactionValidationIssueCode;
	message: string;
}

export interface CompactionValidationResult {
	valid: boolean;
	issues: CompactionValidationIssue[];
}

function addIssue(issues: CompactionValidationIssue[], code: CompactionValidationIssueCode, message: string): void {
	issues.push({ code, message });
}

function getSectionBody(summary: string, section: string): string | undefined {
	const lines = summary.split(/\r?\n/);
	const heading = `## ${section}`;
	const startIndex = lines.findIndex((line) => line.trim() === heading);
	if (startIndex < 0) return undefined;

	const endIndex = lines.findIndex((line, index) => index > startIndex && line.trim().startsWith("## "));
	return lines
		.slice(startIndex + 1, endIndex < 0 ? lines.length : endIndex)
		.join("\n")
		.trim();
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEvidenceReferenceKind(value: unknown): value is EvidenceReferenceKind {
	return value === "tool-output" || value === "validation" || value === "file";
}

function isValidEvidenceReference(value: unknown): value is EvidenceReference {
	if (!value || typeof value !== "object") return false;
	const reference = value as Partial<EvidenceReference>;
	return (
		isEvidenceReferenceKind(reference.kind) &&
		typeof reference.label === "string" &&
		reference.label.trim().length > 0 &&
		typeof reference.ref === "string" &&
		reference.ref.trim().length > 0
	);
}

function isUserMessageEntry(entry: SessionEntry | undefined): boolean {
	return entry?.type === "message" && entry.message.role === "user";
}

function validateDetails(
	details: unknown,
	branchEntries: readonly SessionEntry[],
	issues: CompactionValidationIssue[],
): void {
	if (!details || typeof details !== "object" || Array.isArray(details)) {
		addIssue(issues, "invalid-details", "Compaction details must be an object.");
		return;
	}

	const candidate = details as Record<string, unknown>;
	if (!isStringArray(candidate.readFiles) || !isStringArray(candidate.modifiedFiles)) {
		addIssue(
			issues,
			"invalid-details",
			"Compaction details must contain string arrays for readFiles and modifiedFiles.",
		);
	}

	if (candidate.retainedUserEntryIds !== undefined) {
		if (!isStringArray(candidate.retainedUserEntryIds)) {
			addIssue(issues, "invalid-retained-user-entry", "retainedUserEntryIds must be an array of strings.");
		} else {
			for (const entryId of candidate.retainedUserEntryIds) {
				const entry = branchEntries.find((candidateEntry) => candidateEntry.id === entryId);
				if (!isUserMessageEntry(entry)) {
					addIssue(
						issues,
						"invalid-retained-user-entry",
						`Retained user entry ${entryId} does not identify a user message in the branch.`,
					);
				}
			}
		}
	}

	if (candidate.evidenceRefs !== undefined) {
		if (!Array.isArray(candidate.evidenceRefs)) {
			addIssue(issues, "invalid-evidence-reference", "evidenceRefs must be an array.");
		} else {
			for (const reference of candidate.evidenceRefs) {
				if (!isValidEvidenceReference(reference)) {
					addIssue(
						issues,
						"invalid-evidence-reference",
						"Every evidence reference needs a valid kind, label, and ref.",
					);
				}
			}
		}
	}
}

/** Validate deterministic invariants before a native compaction is persisted. */
export function validateCompactionResult(
	result: CompactionResult,
	branchEntries: readonly SessionEntry[],
): CompactionValidationResult {
	const issues: CompactionValidationIssue[] = [];
	const summary = typeof result.summary === "string" ? result.summary : "";

	if (summary.trim().length === 0) {
		addIssue(issues, "summary-empty", "Compaction summary must be non-empty.");
	} else if (summary.length > MAX_COMPACTION_SUMMARY_CHARS) {
		addIssue(
			issues,
			"summary-too-large",
			`Compaction summary exceeds the ${MAX_COMPACTION_SUMMARY_CHARS}-character limit.`,
		);
	}

	for (const section of REQUIRED_COMPACTION_SECTIONS) {
		const body = getSectionBody(summary, section);
		if (body === undefined) {
			addIssue(issues, "missing-section", `Compaction summary is missing the ## ${section} section.`);
		} else if (section === "Goal" && body.length === 0) {
			addIssue(issues, "empty-goal", "Compaction summary needs a non-empty ## Goal section.");
		}
	}

	const firstKeptEntry = branchEntries.find((entry) => entry.id === result.firstKeptEntryId);
	if (!firstKeptEntry || firstKeptEntry.type === "compaction") {
		addIssue(
			issues,
			"invalid-first-kept-entry",
			"firstKeptEntryId must identify a non-compaction entry in the branch.",
		);
	}

	if (!Number.isFinite(result.tokensBefore) || result.tokensBefore < 0) {
		addIssue(issues, "invalid-tokens-before", "tokensBefore must be a finite non-negative number.");
	}

	validateDetails(result.details, branchEntries, issues);

	return { valid: issues.length === 0, issues };
}

export function assertCompactionResultValid(result: CompactionResult, branchEntries: readonly SessionEntry[]): void {
	const validation = validateCompactionResult(result, branchEntries);
	if (validation.valid) return;

	throw new Error(`Native compaction validation failed: ${validation.issues.map((issue) => issue.message).join(" ")}`);
}
