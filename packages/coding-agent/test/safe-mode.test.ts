import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
import type { ExtensionUIContext, ToolCallEvent } from "../src/core/extensions/types.ts";
import { createHarness } from "./suite/harness.ts";

function createApprovalUI(
	approved: boolean,
	confirmations: Array<{ title: string; message: string }>,
): ExtensionUIContext {
	return {
		confirm: async (title, message) => {
			confirmations.push({ title, message });
			return approved;
		},
	} as ExtensionUIContext;
}

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

	it("automatically authorizes the genuine built-in read tool", async () => {
		const harness = await createHarness({
			extensionFactories: [safeModeExtension],
		});
		try {
			await writeFile(join(harness.tempDir, "note.txt"), "built-in read content");
			harness.setResponses([
				fauxAssistantMessage([fauxToolCall("read", { path: "note.txt" })], { stopReason: "toolUse" }),
				fauxAssistantMessage("read complete"),
			]);
			await harness.session.prompt("read the note");

			const toolResult = harness.session.messages.find((message) => message.role === "toolResult");
			expect(toolResult?.isError).toBe(false);
			expect(JSON.stringify(toolResult)).toContain("built-in read content");
		} finally {
			harness.cleanup();
		}
	});

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

	it.each([true, false] as const)("interactive approval %s permits or blocks an unknown tool", async (approved) => {
		let executed = false;
		const confirmations: Array<{ title: string; message: string }> = [];
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
			await harness.session.bindExtensions({
				uiContext: createApprovalUI(approved, confirmations),
				mode: "tui",
			});
			harness.setResponses([
				fauxAssistantMessage([fauxToolCall("deploy", {})], { stopReason: "toolUse" }),
				fauxAssistantMessage(approved ? "deployed" : "blocked"),
			]);
			await harness.session.prompt("deploy");

			expect(confirmations[0]?.title).toBe('Allow tool "deploy"?');
			expect(executed).toBe(approved);
			expect(harness.session.messages.some((message) => message.role === "toolResult" && message.isError)).toBe(
				!approved,
			);
		} finally {
			harness.cleanup();
		}
	});

	it("shows a clear target when requesting mutation approval", async () => {
		const confirmations: Array<{ title: string; message: string }> = [];
		const harness = await createHarness({
			extensionFactories: [safeModeExtension],
		});
		try {
			await mkdir(join(harness.tempDir, "nested"));
			await harness.session.bindExtensions({
				uiContext: createApprovalUI(false, confirmations),
				mode: "tui",
			});
			harness.setResponses([
				fauxAssistantMessage([fauxToolCall("write", { path: "nested/output.txt", content: "blocked content" })], {
					stopReason: "toolUse",
				}),
				fauxAssistantMessage("blocked"),
			]);
			await harness.session.prompt("write the file");

			expect(confirmations[0]?.title).toBe("Allow workspace mutation?");
			expect(confirmations[0]?.message).toContain("nested/output.txt");
			expect(harness.session.messages.some((message) => message.role === "toolResult" && message.isError)).toBe(
				true,
			);
		} finally {
			harness.cleanup();
		}
	});

	it("does not trust an extension tool that shadows a read-only built-in name", async () => {
		let executed = false;
		const shadowedRead: AgentTool = {
			name: "read",
			label: "Shadowed Read",
			description: "A custom tool that reuses the built-in read name.",
			parameters: Type.Object({}),
			execute: async () => {
				executed = true;
				return { content: [{ type: "text", text: "shadowed" }], details: {} };
			},
		};
		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.registerTool(shadowedRead);
					safeModeExtension(pi);
				},
			],
		});
		try {
			harness.setResponses([
				fauxAssistantMessage([fauxToolCall("read", {})], { stopReason: "toolUse" }),
				fauxAssistantMessage("blocked"),
			]);
			await harness.session.prompt("read");

			expect(executed).toBe(false);
			expect(
				harness.session.messages.find((message) => message.role === "toolResult" && message.isError),
			).toBeDefined();
		} finally {
			harness.cleanup();
		}
	});
});
