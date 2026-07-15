import { describe, expect, it } from "vitest";
import {
	MAX_COMPACTION_SUMMARY_CHARS,
	MAX_EVIDENCE_REFERENCES,
	validateCompactionResult,
} from "../src/core/compaction/index.ts";
import type { SessionEntry } from "../src/core/session-manager.ts";

const STRUCTURED_SUMMARY = `## Goal
Continue the implementation.

## Constraints & Preferences
- Preserve the existing session format.

## Progress
### Done
- [x] Added the compaction contract.

### In Progress
- [ ] Run the validation gates.

### Blocked
- (none)

## Key Decisions
- **Native compaction**: Keep the existing session manager.

## Next Steps
1. Run focused tests.

## Critical Context
- The exact validation command is recorded in the session summary.`;

function createUserEntry(id: string, content: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: new Date(2026, 0, 1).toISOString(),
		message: { role: "user", content, timestamp: Date.now() },
	};
}

describe("validateCompactionResult", () => {
	it("accepts a bounded native result with valid references", () => {
		const result = validateCompactionResult(
			{
				summary: STRUCTURED_SUMMARY,
				firstKeptEntryId: "keep",
				tokensBefore: 100,
				details: {
					readFiles: ["src/index.ts"],
					modifiedFiles: [],
					retainedUserEntryIds: ["constraint"],
					evidenceRefs: [{ kind: "tool-output", label: "check output", ref: "/tmp/check.log" }],
				},
			},
			[createUserEntry("keep", "kept message"), createUserEntry("constraint", "preserve this")],
		);

		expect(result).toEqual({ valid: true, issues: [] });
	});

	it("reports missing required sections and an empty goal", () => {
		const result = validateCompactionResult(
			{
				summary: "## Goal\n\n## Progress\nwork",
				firstKeptEntryId: "keep",
				tokensBefore: 100,
				details: { readFiles: [], modifiedFiles: [] },
			},
			[createUserEntry("keep", "kept message")],
		);

		expect(result.valid).toBe(false);
		expect(result.issues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining(["empty-goal", "missing-section"]),
		);
	});

	it("rejects malformed boundaries, details, references, and oversized summaries", () => {
		const result = validateCompactionResult(
			{
				summary: `${STRUCTURED_SUMMARY}${"x".repeat(MAX_COMPACTION_SUMMARY_CHARS)}`,
				firstKeptEntryId: "missing",
				tokensBefore: -1,
				details: {
					readFiles: [42],
					modifiedFiles: [],
					retainedUserEntryIds: ["missing-user"],
					evidenceRefs: [{ kind: "tool-output", label: "", ref: "" }],
				},
			},
			[createUserEntry("keep", "kept message")],
		);

		expect(result.valid).toBe(false);
		expect(result.issues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining([
				"summary-too-large",
				"invalid-first-kept-entry",
				"invalid-tokens-before",
				"invalid-details",
				"invalid-retained-user-entry",
				"invalid-evidence-reference",
			]),
		);
	});

	it("rejects unbounded evidence metadata", () => {
		const result = validateCompactionResult(
			{
				summary: STRUCTURED_SUMMARY,
				firstKeptEntryId: "keep",
				tokensBefore: 100,
				details: {
					readFiles: [],
					modifiedFiles: [],
					evidenceRefs: Array.from({ length: MAX_EVIDENCE_REFERENCES + 1 }, (_, index) => ({
						kind: "tool-output" as const,
						label: `output-${index}`,
						ref: `/tmp/output-${index}.log`,
					})),
				},
			},
			[createUserEntry("keep", "kept message")],
		);

		expect(result.valid).toBe(false);
		expect(result.issues.map((issue) => issue.code)).toContain("invalid-evidence-reference");
	});
});
