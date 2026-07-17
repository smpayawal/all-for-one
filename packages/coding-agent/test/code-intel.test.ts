import { describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
	defineTool: (definition: unknown) => definition,
}));

import { formatCodeIntelOutput, parseCodeIntelArgs } from "../examples/extensions/code-intel.ts";

describe("code-intel adapter boundaries", () => {
	it("preserves both stdout and stderr diagnostics", () => {
		const result = formatCodeIntelOutput({
			stdout: "definition result",
			stderr: "adapter warning",
			code: 2,
			killed: false,
			termination: "completed",
		});

		expect(result.truncated).toBe(false);
		expect(result.text).toContain("stdout:\ndefinition result");
		expect(result.text).toContain("stderr:\nadapter warning");
	});

	it("does not infer truncation from an exact character boundary", () => {
		const result = formatCodeIntelOutput({
			stdout: "x".repeat(20_000),
			stderr: "",
			code: 0,
			killed: false,
			stdoutTruncated: false,
		});

		expect(result.truncated).toBe(false);
		expect(result.text).toBe("x".repeat(20_000));
	});

	it("reports capture truncation even when the retained text is shorter than the final limit", () => {
		const result = formatCodeIntelOutput({
			stdout: "partial",
			stderr: "",
			code: 0,
			killed: false,
			stdoutTruncated: true,
		});

		expect(result.truncated).toBe(true);
		expect(result.text).toContain("[output truncated]");
	});

	it("rejects malformed or oversized fixed adapter arguments", () => {
		expect(parseCodeIntelArgs("not-json")).toMatchObject({ error: expect.any(String) });
		expect(parseCodeIntelArgs('{"not":"an array"}')).toEqual({
			error: "PI_CODE_INTEL_ARGS must be a JSON string array",
		});
		expect(parseCodeIntelArgs(JSON.stringify(["x".repeat(2_001)]))).toEqual({
			error: "PI_CODE_INTEL_ARGS must contain at most 32 arguments of 2000 characters each",
		});
	});
});
