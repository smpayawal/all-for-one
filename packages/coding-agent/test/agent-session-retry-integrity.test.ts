import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import { getModel } from "@earendil-works/pi-ai/compat";
import { Type } from "typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentSession } from "../src/core/agent-session.ts";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { createModelRegistry, getModelRuntime } from "./model-runtime-test-utils.ts";
import { createTestResourceLoader } from "./utilities.ts";

function usage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

describe("AgentSession provider retry integrity", () => {
	let session: AgentSession;
	let sessionManager: SessionManager;
	let settingsManager: SettingsManager;
	let tempDir: string;
	let toolExecutions: number;
	let providerCalls: number;

	beforeEach(async () => {
		tempDir = join(tmpdir(), `pi-retry-integrity-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		toolExecutions = 0;
		providerCalls = 0;

		const model = getModel("anthropic", "claude-sonnet-4-5")!;
		const schema = Type.Object({ value: Type.String() });
		const echoTool: AgentTool<typeof schema, { value: string }> = {
			name: "echo",
			label: "Echo",
			description: "Echo a value",
			parameters: schema,
			async execute(_toolCallId, params) {
				toolExecutions++;
				return {
					content: [{ type: "text", text: `echoed:${params.value}` }],
					details: { value: params.value },
				};
			},
		};
		const agent = new Agent({ initialState: { model, systemPrompt: "Test", tools: [echoTool] } });
		agent.streamFn = (requestModel) => {
			providerCalls++;
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() => {
				if (providerCalls === 1) {
					const message: AssistantMessage = {
						role: "assistant",
						content: [{ type: "toolCall", id: "echo-1", name: "echo", arguments: { value: "once" } }],
						api: requestModel.api,
						provider: requestModel.provider,
						model: requestModel.id,
						usage: usage(),
						stopReason: "toolUse",
						timestamp: Date.now(),
					};
					stream.push({ type: "done", reason: "toolUse", message });
					return;
				}
				if (providerCalls === 2) {
					const error: AssistantMessage = {
						role: "assistant",
						content: [{ type: "text", text: "" }],
						api: requestModel.api,
						provider: requestModel.provider,
						model: requestModel.id,
						usage: usage(),
						stopReason: "error",
						errorMessage: "429 rate limit exceeded",
						timestamp: Date.now(),
					};
					stream.push({ type: "error", reason: "error", error });
					return;
				}
				const message: AssistantMessage = {
					role: "assistant",
					content: [{ type: "text", text: "completed after retry" }],
					api: requestModel.api,
					provider: requestModel.provider,
					model: requestModel.id,
					usage: usage(),
					stopReason: "stop",
					timestamp: Date.now(),
				};
				stream.push({ type: "done", reason: "stop", message });
			});
			return stream;
		};

		sessionManager = SessionManager.inMemory();
		settingsManager = SettingsManager.create(tempDir, tempDir);
		settingsManager.applyOverrides({ retry: { enabled: true, maxRetries: 1, baseDelayMs: 1 } });
		const authStorage = AuthStorage.create(join(tempDir, "auth.json"));
		await authStorage.modify("anthropic", async () => ({ type: "api_key", key: "test-key" }));
		const modelRegistry = await createModelRegistry(authStorage, tempDir);

		session = new AgentSession({
			agent,
			sessionManager,
			settingsManager,
			cwd: tempDir,
			modelRuntime: getModelRuntime(modelRegistry),
			resourceLoader: createTestResourceLoader(),
			baseToolsOverride: { echo: echoTool },
			initialActiveToolNames: ["echo"],
		});
	});

	afterEach(() => {
		session.dispose();
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	it("continues from the completed tool result without replaying the tool", async () => {
		await session.prompt("echo once");
		expect(providerCalls).toBe(3);
		expect(toolExecutions).toBe(1);
		expect(session.agent.state.messages.filter((message) => message.role === "toolResult")).toHaveLength(1);
		expect(session.getLastAssistantText()).toBe("completed after retry");
	});
});
