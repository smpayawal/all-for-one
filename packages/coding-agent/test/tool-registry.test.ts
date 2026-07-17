import { describe, expect, it } from "vitest";
import {
	allToolNames,
	createAllToolDefinitions,
	createCodingToolDefinitions,
	createReadOnlyToolDefinitions,
	DEFAULT_ACTIVE_TOOL_NAMES,
} from "../src/core/tools/index.ts";

describe("native tool registry", () => {
	it("registers the canonical built-in tools in the appropriate sets", () => {
		expect([...allToolNames]).toEqual(["read", "bash", "edit", "write", "grep", "find", "ls", "apply_patch"]);
		expect(DEFAULT_ACTIVE_TOOL_NAMES).toEqual(["read", "bash", "edit", "write", "apply_patch"]);

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

	it("does not expose the removed changes tool", () => {
		expect([...allToolNames]).not.toContain("changes");
		expect(Object.keys(createAllToolDefinitions(process.cwd()))).not.toContain("changes");
	});
});
