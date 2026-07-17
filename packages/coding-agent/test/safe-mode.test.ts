import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/compat";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { resolveCanonicalPath } from "../src/core/tools/path-utils.ts";

vi.mock("@earendil-works/pi-coding-agent", () => ({ resolveCanonicalPath }));

import safeModeExtension, {
	classifyBashCommand,
	getMutationPaths,
	validateMutationPaths,
} from "../examples/extensions/safe-mode.ts";
import type { ToolCallEvent } from "../src/core/extensions/types.ts";
import { createHarness } from "./suite/harness.ts";

function writeEvent(path: unknown): ToolCallEvent {
	return {
		type: "tool_call",
		toolCallId: "write-test",
		toolName: "write",
		input: { path, content: "content" },
	} as unknown as ToolCallEvent;
}

function patchEvent(patch: unknown): ToolCallEvent {
	return {
		type: "tool_call",
		toolCallId: "patch-test",
		toolName: "apply_patch",
		input: { patch },
	} as unknown as ToolCallEvent;
}

describe("safe-mode policy", () => {
	it.each([
		["pwd", "allow"],
		["git status", "allow"],
		["ls -la", "ask"],
		["git status; git diff", "block"],
		["cat > output.txt", "block"],
		["find . -delete", "block"],
		["sed -i 's/a/b/' file.txt", "block"],
		["sed -i.bak 's/a/b/' file.txt", "block"],
		["sed --in-place=backup 's/a/b/' file.txt", "block"],
		["git branch -D feature", "block"],
		["git branch -Dfeature", "block"],
		["awk 'BEGIN { system(\"rm -rf .\") }'", "block"],
		["cat ~/.ssh/id_rsa", "block"],
		["cat .env", "block"],
		["echo $(id)", "block"],
		["git status\ngit diff", "block"],
	] as const)("classifies %s as %s", (command, action) => {
		expect(classifyBashCommand(command).action).toBe(action);
	});

	it("blocks malformed mutation arguments and patch headers", async () => {
		const workspace = await mkdtemp(join(tmpdir(), "safe-mode-"));
		try {
			const malformedWrite = writeEvent(42);
			expect(getMutationPaths(malformedWrite).malformed).toBe(true);
			expect((await validateMutationPaths(malformedWrite, workspace)).action).toBe("block");

			const malformedPatch = patchEvent("*** Begin Patch\n*** Update File: \n*** End Patch");
			expect(getMutationPaths(malformedPatch).malformed).toBe(true);
			expect((await validateMutationPaths(malformedPatch, workspace)).action).toBe("block");
		} finally {
			await rm(workspace, { recursive: true, force: true });
		}
	});

	it("blocks Windows absolute paths on non-Windows hosts", async () => {
		const workspace = await mkdtemp(join(tmpdir(), "safe-mode-"));
		try {
			const result = await validateMutationPaths(writeEvent("C:\\outside\\file.txt"), workspace);
			if (process.platform === "win32") {
				expect(result.action).toBe("block");
			} else {
				expect(result.action).toBe("block");
				expect(result.reason).toContain("Windows absolute");
			}
		} finally {
			await rm(workspace, { recursive: true, force: true });
		}
	});

	it.skipIf(process.platform === "win32")(
		"canonicalizes symlinked mutation paths before authorizing them",
		async () => {
			const workspace = await mkdtemp(join(tmpdir(), "safe-mode-workspace-"));
			const outside = await mkdtemp(join(tmpdir(), "safe-mode-outside-"));
			try {
				await mkdir(join(outside, "nested"));
				await symlink(outside, join(workspace, "linked"), "dir");
				const result = await validateMutationPaths(writeEvent("linked/nested/escape.txt"), workspace);
				expect(result.action).toBe("block");
				expect(result.reason).toContain("outside the workspace");
			} finally {
				await rm(workspace, { recursive: true, force: true });
				await rm(outside, { recursive: true, force: true });
			}
		},
	);

	it("blocks an unknown custom tool when safe mode has no interactive approval", async () => {
		let executed = false;
		const customTool: AgentTool = {
			name: "deploy",
			label: "Deploy",
			description: "Deploy the current application.",
			parameters: Type.Object({}),
			execute: async () => {
				executed = true;
				return { content: [{ type: "text", text: "deployed" }], details: {} };
			},
		};
		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.registerTool(customTool);
					safeModeExtension(pi);
				},
			],
		});
		try {
			harness.setResponses([
				fauxAssistantMessage([fauxToolCall("deploy", {})], { stopReason: "toolUse" }),
				fauxAssistantMessage("blocked"),
			]);
			await harness.session.prompt("deploy");

			expect(executed).toBe(false);
			expect(
				harness.session.messages.find((message) => message.role === "toolResult" && message.isError),
			).toBeDefined();
		} finally {
			harness.cleanup();
		}
	});
});
