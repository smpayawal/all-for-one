import type { SessionEntry } from "../session-manager.ts";
import { type CompactionResult, getCompactionSummaryForValidation } from "./compaction.ts";
import {
	type EvidenceReference,
	getEvidenceReferenceSectionChars,
	MAX_EVIDENCE_REFERENCE_CHARS,
	MAX_EVIDENCE_REFERENCES,
	MAX_EVIDENCE_SECTION_CHARS,
	normalizeEvidenceReference,
} from "./retention.ts";

export const REQUIRED_COMPACTION_SECTIONS = [
	"Goal",
	"Constraints & Preferences",
	"Progress",
	"Key Decisions",
	"Next Steps",
	"Critical Context",
] as const;

export const MAX_COMPACTION_SUMMARY_CHARS = 128_000;
const SPLIT_TURN_CONTEXT_MARKER = "**Turn Context (split turn):**";

export type CompactionValidationIssueCode =
	| "summary-empty"
	| "summary-too-large"
	| "rendered-summary-too-large"
	| "missing-section"
	| "duplicate-section"
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

type CompactionResultForValidation = CompactionResult & { summaryForValidation?: string };

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

function countSectionHeadings(summary: string, section: string): number {
	const heading = `## ${section}`;
	return summary.split(/\r?\n/).filter((line) => line.trim() === heading).length;
}

function getPrimaryStructuredSummary(summary: string): string {
	const lines = summary.split(/\r?\n/);
	const splitTurnIndex = lines.findIndex((line) => line.trim() === SPLIT_TURN_CONTEXT_MARKER);
	return lines.slice(0, splitTurnIndex < 0 ? lines.length : splitTurnIndex).join("\n");
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isValidEvidenceReference(value: unknown): value is EvidenceReference {
	return normalizeEvidenceReference(value) !== undefined;
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
		} else if (candidate.evidenceRefs.length > MAX_EVIDENCE_REFERENCES) {
			addIssue(
				issues,
				"invalid-evidence-reference",
				`evidenceRefs cannot contain more than ${MAX_EVIDENCE_REFERENCES} references.`,
			);
		} else {
			const validReferences: EvidenceReference[] = [];
			for (const reference of candidate.evidenceRefs) {
				if (!isValidEvidenceReference(reference)) {
					addIssue(
						issues,
						"invalid-evidence-reference",
						"Every evidence reference needs a valid kind, label, and ref.",
					);
				} else if (reference.ref.length > MAX_EVIDENCE_REFERENCE_CHARS) {
					addIssue(
						issues,
						"invalid-evidence-reference",
						`Evidence references cannot exceed ${MAX_EVIDENCE_REFERENCE_CHARS} characters.`,
					);
				} else {
					validReferences.push(reference);
				}
			}
			if (
				validReferences.length > 0 &&
				getEvidenceReferenceSectionChars(validReferences) > MAX_EVIDENCE_SECTION_CHARS
			) {
				addIssue(
					issues,
					"invalid-evidence-reference",
					`Evidence references exceed the ${MAX_EVIDENCE_SECTION_CHARS}-character section limit.`,
				);
			}
		}
	}
}

/** Validate deterministic invariants before a native compaction is persisted. */
export function validateCompactionResult(
	result: CompactionResultForValidation,
	branchEntries: readonly SessionEntry[],
): CompactionValidationResult {
	const issues: CompactionValidationIssue[] = [];
	const summary = typeof result.summary === "string" ? result.summary : "";
	const summaryForValidation =
		typeof result.summaryForValidation === "string"
			? result.summaryForValidation
			: (getCompactionSummaryForValidation(result) ?? summary);

	if (summaryForValidation.trim().length === 0) {
		addIssue(issues, "summary-empty", "Compaction summary must be non-empty.");
	} else if (summaryForValidation.length > MAX_COMPACTION_SUMMARY_CHARS) {
		addIssue(
			issues,
			"summary-too-large",
			`Compaction summary exceeds the ${MAX_COMPACTION_SUMMARY_CHARS}-character limit.`,
		);
	}
	if (summary.length > MAX_COMPACTION_SUMMARY_CHARS) {
		addIssue(
			issues,
			"rendered-summary-too-large",
			`Rendered compaction summary exceeds the ${MAX_COMPACTION_SUMMARY_CHARS}-character limit.`,
		);
	}

	const primaryStructuredSummary = getPrimaryStructuredSummary(summaryForValidation);
	for (const section of REQUIRED_COMPACTION_SECTIONS) {
		if (countSectionHeadings(primaryStructuredSummary, section) > 1) {
			addIssue(issues, "duplicate-section", `Compaction summary contains duplicate ## ${section} sections.`);
		}
		const body = getSectionBody(primaryStructuredSummary, section);
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

export function assertCompactionResultValid(
	result: CompactionResultForValidation,
	branchEntries: readonly SessionEntry[],
): void {
	const validation = validateCompactionResult(result, branchEntries);
	if (validation.valid) return;

	throw new Error(`Native compaction validation failed: ${validation.issues.map((issue) => issue.message).join(" ")}`);
}
