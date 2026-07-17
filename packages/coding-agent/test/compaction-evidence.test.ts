import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	MAX_EVIDENCE_REFERENCES,
	resolveEvidenceReference,
	resolveEvidenceReferences,
} from "../src/core/compaction/index.ts";

describe("evidence reference resolution", () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "pi-context-evidence-"));
		mkdirSync(join(root, "output"));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("resolves a local saved-output reference", () => {
		const filePath = join(root, "output", "check.log");
		writeFileSync(filePath, "validation output\n");

		const result = resolveEvidenceReference(
			{ kind: "tool-output", label: "check output", ref: "output/check.log" },
			root,
		);

		expect(result).toMatchObject({ status: "available", resolvedPath: filePath });
		expect(result.message).toContain("available");
	});

	it("reports missing local evidence with an actionable message", () => {
		const result = resolveEvidenceReference(
			{ kind: "validation", label: "check output", ref: "output/missing.log" },
			root,
		);

		expect(result.status).toBe("missing");
		expect(result.message).toContain("output/missing.log");
		expect(result.message).toContain("not available");
	});

	it("does not treat remote references as local files", () => {
		const result = resolveEvidenceReference(
			{ kind: "file", label: "remote evidence", ref: "https://example.test/evidence.log" },
			root,
		);

		expect(result.status).toBe("non-local");
		expect(result.message).toContain("non-local");
	});

	it("resolves a batch without losing per-reference status", () => {
		writeFileSync(join(root, "output", "present.log"), "present\n");

		const results = resolveEvidenceReferences(
			[
				{ kind: "tool-output", label: "present", ref: "output/present.log" },
				{ kind: "tool-output", label: "missing", ref: "output/missing.log" },
			],
			root,
		);

		expect(results.map((result) => result.status)).toEqual(["available", "missing"]);
	});

	it("bounds filesystem work for imported evidence metadata", () => {
		const references = Array.from({ length: MAX_EVIDENCE_REFERENCES + 20 }, (_, index) => ({
			kind: "tool-output" as const,
			label: `output-${index}`,
			ref: `output/${index}.log`,
		}));

		expect(resolveEvidenceReferences(references, root)).toHaveLength(MAX_EVIDENCE_REFERENCES);
	});
});
