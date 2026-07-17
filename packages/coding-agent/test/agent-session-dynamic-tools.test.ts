import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@earendil-works/pi-ai/compat";
import { Type } from "typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DefaultResourceLoader } from "../src/core/resource-loader.ts";
import { createAgentSession } from "../src/core/sdk.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { canonicalizePath } from "../src/utils/paths.ts";

describe("AgentSession dynamic tool registration", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-dynamic-tool-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("refreshes tool registry when tools are registered after initialization", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();

		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
			extensionFactories: [
				(pi) => {
					pi.on("session_start", () => {
						pi.registerTool({
							name: "dynamic_tool",
							label: "Dynamic Tool",
							description: "Tool registered from session_start",
							promptSnippet: "Run dynamic test behavior",
							promptGuidelines: ["Use dynamic_tool when the user asks for dynamic behavior tests."],
							parameters: Type.Object({}),
							execute: async () => ({
								content: [{ type: "text", text: "ok" }],
								details: {},
							}),
						});
					});
				},
			],
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
			resourceLoader,
		});

		expect(session.getAllTools().map((tool) => tool.name)).not.toContain("dynamic_tool");

		await session.bindExtensions({});

		const allTools = session.getAllTools();
		const dynamicTool = allTools.find((tool) => tool.name === "dynamic_tool");
		const readTool = allTools.find((tool) => tool.name === "read");

		expect(allTools.map((tool) => tool.name)).toContain("dynamic_tool");
		expect(dynamicTool?.promptGuidelines).toEqual([
			"Use dynamic_tool when the user asks for dynamic behavior tests.",
		]);
		expect(dynamicTool?.sourceInfo).toMatchObject({
			path: "<inline:1>",
			source: "inline",
			scope: "temporary",
			origin: "top-level",
		});
		expect(readTool?.sourceInfo).toMatchObject({
			path: "<builtin:read>",
			source: "builtin",
			scope: "temporary",
			origin: "top-level",
		});
		expect(session.getActiveToolNames()).toContain("dynamic_tool");
		expect(session.systemPrompt).toContain("- dynamic_tool: Run dynamic test behavior");
		expect(session.systemPrompt).toContain("- Use dynamic_tool when the user asks for dynamic behavior tests.");

		session.dispose();
	});

	it("returns source metadata for SDK custom tools", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();
		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
			resourceLoader,
			customTools: [
				{
					name: "sdk_tool",
					label: "SDK Tool",
					description: "Tool registered through createAgentSession",
					parameters: Type.Object({}),
					execute: async () => ({
						content: [{ type: "text", text: "ok" }],
						details: {},
					}),
				},
			],
		});

		const sdkTool = session.getAllTools().find((tool) => tool.name === "sdk_tool");
		expect(sdkTool?.sourceInfo).toMatchObject({
			path: "<sdk:sdk_tool>",
			source: "sdk",
			scope: "temporary",
			origin: "top-level",
		});
		expect(session.getActiveToolNames()).toContain("sdk_tool");

		session.dispose();
	});

	it("keeps custom tools active but omits them from available tools when promptSnippet is not provided", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const sessionManager = SessionManager.inMemory();

		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
			extensionFactories: [
				(pi) => {
					pi.on("session_start", () => {
						pi.registerTool({
							name: "hidden_tool",
							label: "Hidden Tool",
							description: "Description should not appear in available tools",
							parameters: Type.Object({}),
							execute: async () => ({
								content: [{ type: "text", text: "ok" }],
								details: {},
							}),
						});
					});
				},
			],
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager,
			resourceLoader,
		});

		await session.bindExtensions({});

		expect(session.getAllTools().map((tool) => tool.name)).toContain("hidden_tool");
		expect(session.getActiveToolNames()).toContain("hidden_tool");
		expect(session.systemPrompt).not.toContain("hidden_tool");
		expect(session.systemPrompt).not.toContain("Description should not appear in available tools");

		session.dispose();
	});

	it("applies the configured skill metadata budget to the live session prompt", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		settingsManager.setSkillMetadataBudget({ maxChars: 500 });
		const skillDir = join(tempDir, "skills", "budget-skill");
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(
			join(skillDir, "SKILL.md"),
			`---
name: budget-skill
description: ${"A long live-session skill description. ".repeat(30)}
---
Skill instructions.
`,
		);

		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
			additionalSkillPaths: [skillDir],
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager: SessionManager.inMemory(),
			resourceLoader,
		});

		const diagnostics = session.getSkillMetadataDiagnostics();
		expect(diagnostics).toMatchObject({ budgetChars: 500, budgetSource: "maxChars" });
		expect(diagnostics?.metadataChars).toBeLessThanOrEqual(500);
		expect(session.systemPrompt).toContain("budget-skill");

		session.dispose();
	});

	it("loads path-scoped instructions during tool preflight", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const frontendDir = join(tempDir, "frontend", "src");
		mkdirSync(frontendDir, { recursive: true });
		writeFileSync(join(tempDir, "AGENTS.md"), "Root project instructions.");
		writeFileSync(join(tempDir, "frontend", "AGENTS.md"), "Frontend-only instructions.");

		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager: SessionManager.inMemory(),
			resourceLoader,
		});

		expect(session.systemPrompt).toContain("Root project instructions.");
		expect(session.systemPrompt).not.toContain("Frontend-only instructions.");

		const beforeToolCall = session.agent.beforeToolCall;
		expect(beforeToolCall).toBeDefined();
		const beforeToolCallContext = {
			toolCall: { id: "call-1", name: "read", arguments: { path: "frontend/src/App.tsx" } },
			args: { path: "frontend/src/App.tsx" },
			assistantMessage: {},
			context: {},
		} as unknown as Parameters<NonNullable<typeof beforeToolCall>>[0];
		await beforeToolCall?.(beforeToolCallContext);

		expect(session.systemPrompt).toContain("Frontend-only instructions.");
		expect(session.getContextInfo().contextFiles.map((file) => file.path)).toEqual([
			join(tempDir, "AGENTS.md"),
			join(tempDir, "frontend", "AGENTS.md"),
		]);

		const prepareNextTurnWithContext = session.agent.prepareNextTurnWithContext;
		const nextTurn = await prepareNextTurnWithContext?.({
			context: { systemPrompt: "stale prompt", messages: [], tools: [] },
		} as unknown as Parameters<NonNullable<typeof prepareNextTurnWithContext>>[0]);
		expect(nextTurn?.context?.systemPrompt).toContain("Frontend-only instructions.");
		expect(nextTurn?.context?.systemPrompt).toContain("Root project instructions.");
		expect(nextTurn?.context?.tools).toEqual(session.agent.state.tools);

		session.dispose();
	});

	it("defers first-touch mutations until scoped instructions are active", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		mkdirSync(join(tempDir, "frontend", "src"), { recursive: true });
		mkdirSync(join(tempDir, "backend"), { recursive: true });
		writeFileSync(join(tempDir, "AGENTS.md"), "Root project instructions.");
		writeFileSync(join(tempDir, "frontend", "AGENTS.md"), "Frontend mutation instructions.");
		writeFileSync(join(tempDir, "backend", "AGENTS.md"), "Backend mutation instructions.");

		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager: SessionManager.inMemory(),
			resourceLoader,
		});

		const beforeToolCall = session.agent.beforeToolCall;
		expect(beforeToolCall).toBeDefined();
		const firstWriteResult = await beforeToolCall?.({
			toolCall: { id: "write-1", name: "write", arguments: { path: "frontend/src/New.tsx" } },
			args: { path: "frontend/src/New.tsx" },
			assistantMessage: {},
			context: {},
		} as unknown as Parameters<NonNullable<typeof beforeToolCall>>[0]);

		expect(firstWriteResult).toMatchObject({ block: true });
		expect(session.systemPrompt).toContain("Frontend mutation instructions.");

		const repeatedWriteResult = await beforeToolCall?.({
			toolCall: { id: "write-2", name: "write", arguments: { path: "frontend/src/Other.tsx" } },
			args: { path: "frontend/src/Other.tsx" },
			assistantMessage: {},
			context: {},
		} as unknown as Parameters<NonNullable<typeof beforeToolCall>>[0]);
		expect(repeatedWriteResult).toBeUndefined();

		const rootWriteResult = await beforeToolCall?.({
			toolCall: { id: "write-3", name: "write", arguments: { path: "root.txt" } },
			args: { path: "root.txt" },
			assistantMessage: {},
			context: {},
		} as unknown as Parameters<NonNullable<typeof beforeToolCall>>[0]);
		expect(rootWriteResult).toBeUndefined();

		const firstPatchResult = await beforeToolCall?.({
			toolCall: {
				id: "patch-1",
				name: "apply_patch",
				arguments: { patch: "*** Begin Patch\n*** Update File: backend/src/Generated.ts\n*** End Patch" },
			},
			args: { patch: "*** Begin Patch\n*** Update File: backend/src/Generated.ts\n*** End Patch" },
			assistantMessage: {},
			context: {},
		} as unknown as Parameters<NonNullable<typeof beforeToolCall>>[0]);

		expect(firstPatchResult).toMatchObject({ block: true });
		expect(session.systemPrompt).toContain("Backend mutation instructions.");
		expect(session.getContextInfo().scopedContext.replacedScopes).toContain(
			canonicalizePath(join(tempDir, "frontend")),
		);

		session.dispose();
	});

	it("records bounded tool-output telemetry without exposing output contents", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const resourceLoader = new DefaultResourceLoader({ cwd: tempDir, agentDir, settingsManager });
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager: SessionManager.inMemory(),
			resourceLoader,
		});

		const afterToolCall = session.agent.afterToolCall;
		expect(afterToolCall).toBeDefined();
		const truncation = {
			content: "returned",
			truncated: true,
			truncatedBy: "bytes",
			totalLines: 20,
			totalBytes: 200,
			outputLines: 1,
			outputBytes: 8,
			lastLinePartial: false,
			firstLineExceedsLimit: false,
			maxLines: 2_000,
			maxBytes: 50 * 1024,
		};
		const afterToolCallContext = {
			toolCall: { id: "call-1", name: "read", arguments: { path: "README.md" } },
			args: { path: "README.md" },
			assistantMessage: {},
			result: { content: [{ type: "text", text: "returned" }], details: { truncation } },
			isError: false,
		} as unknown as Parameters<NonNullable<typeof afterToolCall>>[0];
		await afterToolCall?.(afterToolCallContext);
		await afterToolCall?.({
			...afterToolCallContext,
			isError: true,
		} as unknown as Parameters<NonNullable<typeof afterToolCall>>[0]);

		expect(session.getToolOutputTelemetry()).toEqual([
			{
				toolName: "read",
				calls: 2,
				successes: 1,
				failures: 1,
				rawOutputBytes: 400,
				returnedOutputBytes: 16,
				rawOutputLines: 40,
				returnedOutputLines: 2,
				truncationCount: 2,
				truncatedBy: { lines: 0, bytes: 2 },
				fullOutputAvailable: 0,
				followUpRetrievals: 0,
				repeatedReads: 1,
			},
		]);
		expect(session.getContextInfo().approximateUsage.toolSchemaChars).toBeGreaterThan(0);

		session.dispose();
	});

	it("counts a read of saved full output as a follow-up retrieval", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const resourceLoader = new DefaultResourceLoader({ cwd: tempDir, agentDir, settingsManager });
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager: SessionManager.inMemory(),
			resourceLoader,
		});

		const afterToolCall = session.agent.afterToolCall;
		expect(afterToolCall).toBeDefined();
		const fullOutputPath = join(tempDir, "full-output.txt");
		const bashCall = {
			toolCall: { id: "call-bash", name: "bash", arguments: { command: "long-command" } },
			args: { command: "long-command" },
			assistantMessage: {},
			result: {
				content: [{ type: "text", text: "truncated output" }],
				details: { fullOutputPath },
			},
			isError: false,
		} as unknown as Parameters<NonNullable<typeof afterToolCall>>[0];
		await afterToolCall?.(bashCall);

		await afterToolCall?.({
			toolCall: { id: "call-read", name: "read", arguments: { path: fullOutputPath } },
			args: { path: fullOutputPath },
			assistantMessage: {},
			result: { content: [{ type: "text", text: "full output" }], details: {} },
			isError: false,
		} as unknown as Parameters<NonNullable<typeof afterToolCall>>[0]);

		expect(session.getToolOutputTelemetry().find((item) => item.toolName === "bash")).toMatchObject({
			fullOutputAvailable: 1,
			followUpRetrievals: 1,
		});

		session.dispose();
	});

	it("keeps explicit memory out of the automatic system prompt", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const resourceLoader = new DefaultResourceLoader({ cwd: tempDir, agentDir, settingsManager });
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model: getModel("anthropic", "claude-sonnet-4-5")!,
			settingsManager,
			sessionManager: SessionManager.inMemory(),
			resourceLoader,
		});

		session.addMemory("This fact must be retrieved explicitly.");
		expect(session.getMemory().entries).toHaveLength(1);
		expect(session.systemPrompt).not.toContain("This fact must be retrieved explicitly.");

		session.dispose();
	});
});
