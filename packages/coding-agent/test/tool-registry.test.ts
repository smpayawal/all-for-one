import { describe, expect, it } from "vitest";
import {
	allToolNames,
	createAllToolDefinitions,
	createCodingToolDefinitions,
	createReadOnlyToolDefinitions,
} from "../src/core/tools/index.ts";

describe("native tool registry", () => {
	it("registers essential Phase 3 tools in the appropriate sets", () => {
		expect([...allToolNames]).toEqual([
			"read",
			"bash",
			"edit",
			"write",
			"grep",
			"find",
			"ls",
			"apply_patch",
			"changes",
		]);

		expect(Object.keys(createAllToolDefinitions(process.cwd()))).toEqual([...allToolNames]);
		expect(createCodingToolDefinitions(process.cwd()).map((tool) => tool.name)).toEqual([
			"read",
			"bash",
			"edit",
			"write",
			"apply_patch",
			"changes",
		]);
		expect(createReadOnlyToolDefinitions(process.cwd()).map((tool) => tool.name)).toEqual([
			"read",
			"grep",
			"find",
			"ls",
			"changes",
		]);
	});
});
