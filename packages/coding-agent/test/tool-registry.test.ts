import { describe, expect, it } from "vitest";
import {
	allToolNames,
	createAllToolDefinitions,
	createCodingToolDefinitions,
	createReadOnlyToolDefinitions,
	DEFAULT_ACTIVE_TOOL_NAMES,
	getToolNamesForProfile,
} from "../src/core/tools/index.ts";

describe("native tool registry", () => {
	it("registers the canonical built-in tools in the appropriate sets", () => {
		expect([...allToolNames]).toEqual(["read", "bash", "edit", "write", "grep", "find", "ls", "apply_patch"]);
		expect(DEFAULT_ACTIVE_TOOL_NAMES).toEqual(["read", "bash", "edit", "write"]);
		expect(getToolNamesForProfile("native")).toEqual(["read", "bash", "edit", "write"]);
		expect(getToolNamesForProfile("patch")).toEqual(["read", "bash", "apply_patch", "write"]);
		expect(getToolNamesForProfile("full")).toEqual(["read", "bash", "edit", "write", "apply_patch"]);

		expect(Object.keys(createAllToolDefinitions(process.cwd()))).toEqual([...allToolNames]);
		expect(createCodingToolDefinitions(process.cwd()).map((tool) => tool.name)).toEqual([
			"read",
			"bash",
			"edit",
			"write",
			"apply_patch",
		]);
		expect(createReadOnlyToolDefinitions(process.cwd()).map((tool) => tool.name)).toEqual([
			"read",
			"grep",
			"find",
			"ls",
		]);
	});

	it("makes the mutation roles explicit in model-visible metadata", () => {
		const definitions = createAllToolDefinitions(process.cwd());

		expect(definitions.edit.description).toContain("Use for precise targeted changes in an existing file");
		expect(definitions.write.description).toContain("Create a new file or deliberately replace an entire file");
		expect(definitions.apply_patch.description).toContain("Use for changes spanning files or distant hunks");
		expect(definitions.edit.promptSnippet).toContain("one existing file");
		expect(definitions.write.promptSnippet).toContain("deliberately replace an entire file");
		expect(definitions.apply_patch.promptSnippet).toContain("multi-hunk or multi-file");
	});

	it("does not expose the removed changes tool", () => {
		expect([...allToolNames]).not.toContain("changes");
		expect(Object.keys(createAllToolDefinitions(process.cwd()))).not.toContain("changes");
	});
});
