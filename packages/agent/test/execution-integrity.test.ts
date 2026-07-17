import {
	type AssistantMessage,
	type AssistantMessageEvent,
	EventStream,
	type Message,
	type Model,
} from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent.ts";
import { agentLoop } from "../src/agent-loop.ts";
import { MAX_RUNTIME_ERROR_CHARS, normalizeRuntimeError } from "../src/runtime-error.ts";
import type { AgentContext, AgentEvent, AgentMessage, AgentTool } from "../src/types.ts";

class MockStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected event");
			},
		);
	}
}

const usage = () => ({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

function model(): Model<"openai-responses"> {
	return {
		id: "mock",
		name: "mock",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 2048,
	};
}

function assistant(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "mock",
		usage: usage(),
		stopReason,
		timestamp: Date.now(),
	};
}

function stream(message: AssistantMessage): MockStream {
	const result = new MockStream();
	queueMicrotask(() => {
		if (message.stopReason === "error" || message.stopReason === "aborted") {
			result.push({
				type: "error",
				reason: message.stopReason,
				error: message,
			});
		} else {
			result.push({ type: "done", reason: message.stopReason, message });
		}
	});
	return result;
}

function context(tools: AgentTool[] = []): AgentContext {
	return { systemPrompt: "Test", messages: [], tools };
}

function emptyTool(name: string, execute: () => void): AgentTool {
	return {
		name,
		label: name,
		description: name,
		parameters: Type.Object({}),
		async execute() {
			execute();
			return { content: [{ type: "text", text: name }], details: {} };
		},
	};
}

const toolResults = (agent: Agent) => agent.state.messages.filter((message) => message.role === "toolResult");

describe("execution integrity", () => {
	it("bounds, sanitizes, and redacts unknown runtime errors safely", () => {
		const normalized = normalizeRuntimeError(
			new Error(
				[
					"request failed\u0000\u0007",
					"Authorization: Bearer bearer-test-value",
					"Bearer standalone-test-value",
					"api_key=api-test-value",
					"apikey=apikey-test-value",
					"token=token-test-value",
					"access_token=access-test-value",
					"refresh_token=refresh-test-value",
					"OPENAI_API_KEY=sk-test-value",
					"Cookie: session=test-cookie; other=value",
					"x".repeat(MAX_RUNTIME_ERROR_CHARS),
				].join("\n"),
			),
		);

		expect(normalized.length).toBeLessThanOrEqual(MAX_RUNTIME_ERROR_CHARS);
		expect(normalized).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
		for (const secret of [
			"bearer-test-value",
			"standalone-test-value",
			"api-test-value",
			"apikey-test-value",
			"token-test-value",
			"access-test-value",
			"refresh-test-value",
			"sk-test-value",
			"session=test-cookie",
		]) {
			expect(normalized).not.toContain(secret);
		}
		expect(normalized).toContain("[REDACTED]");

		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(() => normalizeRuntimeError(circular)).not.toThrow();
		expect(() =>
			normalizeRuntimeError({
				toString: () => {
					throw new Error("toString failed");
				},
			}),
		).not.toThrow();
	});

	it("uses normalized runtime error text for terminal messages and diagnostics", async () => {
		const failureText =
			"runtime failed\nAuthorization: Bearer bearer-test-value\napi_key=api-test-value\nOPENAI_API_KEY=sk-test-value";
		const agent = new Agent({
			initialState: { model: model() },
			streamFn: () => stream(assistant([{ type: "text", text: "ok" }])),
		});
		agent.subscribe(
			(event) => {
				if (event.type === "message_end" && event.message.role === "assistant") throw new Error(failureText);
			},
			{ failureMode: "fatal" },
		);

		await agent.prompt("hello");

		const terminalMessage = agent.state.messages.at(-1);
		const normalized = normalizeRuntimeError(failureText);
		expect(terminalMessage).toMatchObject({ role: "assistant", stopReason: "error", errorMessage: normalized });
		expect(agent.lastRunDiagnostics?.termination).toEqual({ reason: "error", message: normalized });
		expect(agent.lastRunDiagnostics?.listenerErrors).toEqual([normalized]);
	});

	it("normalizes provider failure text before terminal state and diagnostics", async () => {
		const failureText =
			"provider failed\nAuthorization: Bearer bearer-test-value\napi_key=api-test-value\nOPENAI_API_KEY=sk-test-value";
		const failure = { ...assistant([{ type: "text", text: "" }], "error"), errorMessage: failureText };
		const agent = new Agent({ initialState: { model: model() }, streamFn: () => stream(failure) });

		await agent.prompt("hello");

		const normalized = normalizeRuntimeError(failureText);
		expect(agent.state.messages.at(-1)).toMatchObject({ errorMessage: normalized });
		expect(agent.state.errorMessage).toBe(normalized);
		expect(agent.lastRunDiagnostics?.termination).toEqual({ reason: "error", message: normalized });
	});

	it("settles a low-level stream when context conversion rejects", async () => {
		const events: AgentEvent[] = [];
		const result = agentLoop([{ role: "user", content: "hello", timestamp: Date.now() }], context(), {
			model: model(),
			convertToLlm: async () => Promise.reject(new Error("conversion exploded")),
		});
		const collecting = (async () => {
			for await (const event of result) events.push(event);
		})();
		const settled = await Promise.race([
			result.result().then(() => true),
			new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 250)),
		]);
		expect(settled).toBe(true);
		if (settled) await collecting;
		expect(events.filter((event) => event.type === "agent_end")).toHaveLength(1);
	});

	it("isolates a non-terminal listener failure and emits one terminal event", async () => {
		const agent = new Agent({
			initialState: { model: model() },
			streamFn: () => stream(assistant([{ type: "text", text: "ok" }])),
		});
		let failingCalls = 0;
		agent.subscribe((event) => {
			if (event.type === "message_start" && event.message.role === "assistant") {
				failingCalls++;
				throw new Error("listener exploded");
			}
		});
		const events: AgentEvent[] = [];
		agent.subscribe((event) => {
			events.push(event);
		});
		await agent.prompt("hello");
		expect(failingCalls).toBe(1);
		expect(events.filter((event) => event.type === "agent_end")).toHaveLength(1);
		expect(agent.state.isStreaming).toBe(false);
		expect(agent.state.errorMessage).toBeUndefined();
		expect(agent.lastRunDiagnostics?.listenerErrors).toEqual(["listener exploded"]);
		expect(agent.lastRunDiagnostics?.termination).toEqual({ reason: "completed" });
		expect(agent.state.messages.at(-1)).toMatchObject({
			role: "assistant",
			content: [{ type: "text", text: "ok" }],
		});
	});

	it.each(["message_end", "turn_end"] as const)(
		"fails the run when a fatal listener throws at %s",
		async (failureEvent) => {
			let providerCalls = 0;
			let executions = 0;
			const inspect = emptyTool("inspect", () => executions++);
			const agent = new Agent({
				initialState: { model: model(), tools: [inspect] },
				streamFn: () => {
					providerCalls++;
					return stream(
						providerCalls === 1
							? assistant([{ type: "toolCall", id: "call-1", name: "inspect", arguments: {} }], "toolUse")
							: assistant([{ type: "text", text: "unexpected" }]),
					);
				},
			});
			const events: AgentEvent[] = [];
			agent.subscribe(
				(event) => {
					if (
						event.type === failureEvent &&
						(failureEvent !== "message_end" || event.message.role === "assistant")
					) {
						throw new Error(`fatal ${failureEvent}`);
					}
				},
				{ failureMode: "fatal" },
			);
			agent.subscribe((event) => {
				events.push(event);
			});

			await agent.prompt("inspect");

			expect(providerCalls).toBe(1);
			expect(executions).toBe(failureEvent === "message_end" ? 0 : 1);
			expect(events.filter((event) => event.type === "agent_end")).toHaveLength(1);
			expect(events.find((event) => event.type === "agent_end")).toMatchObject({ termination: { reason: "error" } });
			expect(agent.lastRunDiagnostics?.listenerErrors).toEqual([`fatal ${failureEvent}`]);
			expect(agent.state.errorMessage).toBeUndefined();
		},
	);

	it("recovers finalized assistant tool calls when a fatal message_end listener fails", async () => {
		let providerCalls = 0;
		let executions = 0;
		let conversionCalls = 0;
		const inspect: AgentTool = {
			name: "inspect",
			label: "inspect",
			description: "inspect",
			parameters: Type.Object({}),
			async execute() {
				executions++;
				return { content: [{ type: "text", text: "inspected" }], details: {} };
			},
		};
		const agent = new Agent({
			initialState: { model: model(), tools: [inspect] },
			convertToLlm: (messages: AgentMessage[]) => {
				conversionCalls++;
				const pendingToolCalls = new Set<string>();
				for (const message of messages) {
					if (message.role === "assistant" && Array.isArray(message.content)) {
						for (const block of message.content) {
							if (block.type === "toolCall") pendingToolCalls.add(block.id);
						}
					} else if (message.role === "toolResult") {
						if (!pendingToolCalls.delete(message.toolCallId)) {
							throw new Error(`unexpected tool result ${message.toolCallId}`);
						}
					}
				}
				if (conversionCalls > 1) expect(pendingToolCalls).toHaveLength(0);
				return messages.filter(
					(message): message is Message =>
						message.role === "user" || message.role === "assistant" || message.role === "toolResult",
				);
			},
			streamFn: () => {
				providerCalls++;
				return stream(
					providerCalls === 1
						? assistant(
								[
									{ type: "toolCall", id: "call-1", name: "inspect", arguments: {} },
									{ type: "toolCall", id: "call-2", name: "inspect", arguments: {} },
								],
								"toolUse",
							)
						: assistant([{ type: "text", text: "follow-up complete" }]),
				);
			},
		});
		const events: AgentEvent[] = [];
		agent.subscribe(
			(event) => {
				if (
					event.type === "message_end" &&
					event.message.role === "assistant" &&
					event.message.content.some((block) => block.type === "toolCall")
				) {
					throw new Error("fatal assistant message_end");
				}
			},
			{ failureMode: "fatal" },
		);
		agent.subscribe((event) => {
			events.push(event);
		});

		await agent.prompt("inspect");

		expect(providerCalls).toBe(1);
		expect(executions).toBe(0);
		const recoveredResults = toolResults(agent).filter((message) => message.toolCallId.startsWith("call-"));
		expect(recoveredResults.map((message) => message.toolCallId)).toEqual(["call-1", "call-2"]);
		expect(recoveredResults).toHaveLength(2);
		expect(recoveredResults).toEqual([
			expect.objectContaining({ details: { failurePhase: "not-started" } }),
			expect.objectContaining({ details: { failurePhase: "not-started" } }),
		]);
		expect(events.filter((event) => event.type === "agent_end")).toHaveLength(1);
		expect(events.find((event) => event.type === "agent_end")).toMatchObject({ termination: { reason: "error" } });

		await agent.prompt("continue after failure");

		expect(providerCalls).toBe(2);
		expect(agent.state.messages.at(-1)).toMatchObject({
			role: "assistant",
			content: [{ type: "text", text: "follow-up complete" }],
		});
	});

	it.each([
		{ failureEvent: "tool_execution_start" as const, expectedPhase: "not-started", executions: 0 },
		{ failureEvent: "tool_execution_update" as const, expectedPhase: "execution-status-unknown", executions: 1 },
		{
			failureEvent: "tool_execution_end" as const,
			expectedPhase: "executed-but-post-processing-failed",
			executions: 1,
		},
	])(
		"pairs a requested tool call when a fatal listener throws at $failureEvent",
		async ({ failureEvent, expectedPhase, executions: expectedExecutions }) => {
			let providerCalls = 0;
			let executions = 0;
			let validatePairing = false;
			const inspect: AgentTool = {
				name: "inspect",
				label: "inspect",
				description: "inspect",
				parameters: Type.Object({}),
				async execute(_toolCallId, _args, _signal, onUpdate) {
					executions++;
					if (failureEvent === "tool_execution_update") {
						onUpdate?.({ content: [{ type: "text", text: "partial" }], details: {} });
					}
					return { content: [{ type: "text", text: "inspected" }], details: {} };
				},
			};
			const agent = new Agent({
				initialState: { model: model(), tools: [inspect] },
				convertToLlm: (messages: AgentMessage[]) => {
					const pendingToolCalls = new Set<string>();
					if (validatePairing) {
						for (const message of messages) {
							if (message.role === "assistant" && Array.isArray(message.content)) {
								for (const block of message.content) {
									if (block.type === "toolCall") pendingToolCalls.add(block.id);
								}
							} else if (message.role === "toolResult") {
								if (!pendingToolCalls.delete(message.toolCallId)) {
									throw new Error(`unexpected tool result ${message.toolCallId}`);
								}
							}
						}
						expect(pendingToolCalls).toHaveLength(0);
					}
					return messages.filter(
						(message): message is Message =>
							message.role === "user" || message.role === "assistant" || message.role === "toolResult",
					);
				},
				streamFn: () => {
					providerCalls++;
					return stream(
						providerCalls === 1
							? assistant([{ type: "toolCall", id: "call-1", name: "inspect", arguments: {} }], "toolUse")
							: assistant([{ type: "text", text: "follow-up complete" }]),
					);
				},
			});
			const firstRunEvents: AgentEvent[] = [];
			agent.subscribe(
				(event) => {
					if (event.type === failureEvent) throw new Error(`fatal ${failureEvent}`);
				},
				{ failureMode: "fatal" },
			);
			agent.subscribe((event) => {
				firstRunEvents.push(event);
			});

			await agent.prompt("inspect");

			expect(providerCalls).toBe(1);
			expect(executions).toBe(expectedExecutions);
			expect(firstRunEvents.filter((event) => event.type === "agent_end")).toHaveLength(1);
			expect(firstRunEvents.find((event) => event.type === "agent_end")).toMatchObject({
				termination: { reason: "error" },
			});
			const pairedResults = toolResults(agent).filter((message) => message.toolCallId === "call-1");
			expect(pairedResults).toHaveLength(1);
			expect(pairedResults[0]).toMatchObject({
				isError: true,
				details: { failurePhase: expectedPhase },
			});

			validatePairing = true;
			await agent.prompt("continue after failure");
			expect(providerCalls).toBe(2);
			expect(agent.state.messages.at(-1)).toMatchObject({
				role: "assistant",
				content: [{ type: "text", text: "follow-up complete" }],
			});
		},
	);

	it("retains completed messages when a post-turn callback fails", async () => {
		let providerCalls = 0;
		const inspect = emptyTool("inspect", () => {});
		const agent = new Agent({
			initialState: { model: model(), tools: [inspect] },
			streamFn: () => {
				providerCalls++;
				return stream(
					providerCalls === 1
						? assistant([{ type: "toolCall", id: "call-1", name: "inspect", arguments: {} }], "toolUse")
						: assistant([{ type: "text", text: "unexpected" }]),
				);
			},
			prepareNextTurnWithContext: async () => {
				throw new Error("prepare failed");
			},
		});
		const events: AgentEvent[] = [];
		agent.subscribe((event) => {
			events.push(event);
		});

		await agent.prompt("inspect");

		expect(providerCalls).toBe(1);
		expect(agent.state.messages.filter((message) => message.role === "toolResult")).toHaveLength(1);
		expect(events.filter((event) => event.type === "agent_end")).toHaveLength(1);
		expect(agent.lastRunDiagnostics?.termination).toMatchObject({ reason: "error", message: "prepare failed" });
	});

	it("preserves tool-result pairing when a listener rejects at tool_execution_end", async () => {
		let executions = 0;
		let providerCalls = 0;
		const inspect = emptyTool("inspect", () => executions++);
		const agent = new Agent({
			initialState: { model: model(), tools: [inspect] },
			streamFn: () => {
				providerCalls++;
				return stream(
					providerCalls === 1
						? assistant([{ type: "toolCall", id: "call-1", name: "inspect", arguments: {} }], "toolUse")
						: assistant([{ type: "text", text: "done" }]),
				);
			},
		});
		agent.subscribe((event) => {
			if (event.type === "tool_execution_end") throw new Error("tool observer exploded");
		});

		await agent.prompt("inspect");

		expect(executions).toBe(1);
		expect(providerCalls).toBe(2);
		expect(toolResults(agent)).toHaveLength(1);
		expect(agent.lastRunDiagnostics?.termination).toEqual({ reason: "completed" });
		expect(agent.lastRunDiagnostics?.listenerErrors).toEqual(["tool observer exploded"]);
	});

	it("does not re-enter terminalization when an agent_end listener rejects", async () => {
		const agent = new Agent({
			initialState: { model: model() },
			streamFn: () => stream(assistant([{ type: "text", text: "ok" }])),
		});
		const events: AgentEvent[] = [];
		agent.subscribe((event) => {
			if (event.type === "agent_end") events.push(event);
		});
		agent.subscribe(
			(event) => {
				if (event.type === "agent_end") throw new Error("terminal listener exploded");
			},
			{ failureMode: "fatal" },
		);
		await agent.prompt("hello");
		expect(events).toHaveLength(1);
		expect(agent.lastRunDiagnostics?.terminalEvents).toBe(1);
		expect(agent.lastRunDiagnostics?.termination).toEqual({
			reason: "error",
			message: "terminal listener exploded",
		});
		expect(agent.state.messages.at(-1)?.role).toBe("assistant");
	});

	it("stops before another provider request when maxTurns is reached", async () => {
		let executions = 0;
		let providerCalls = 0;
		const inspect = emptyTool("inspect", () => executions++);
		const agent = new Agent({
			initialState: { model: model(), tools: [inspect] },
			executionLimits: { maxTurns: 1 },
			streamFn: () => {
				providerCalls++;
				return stream(
					providerCalls === 1
						? assistant(
								[
									{
										type: "toolCall",
										id: "call-1",
										name: "inspect",
										arguments: {},
									},
								],
								"toolUse",
							)
						: assistant([{ type: "text", text: "unexpected" }]),
				);
			},
		});
		await agent.prompt("inspect");
		expect(providerCalls).toBe(1);
		expect(executions).toBe(1);
		expect(agent.lastRunDiagnostics?.termination).toEqual({
			reason: "limit",
			limit: "turns",
			max: 1,
		});
	});

	it("rejects an oversized tool batch atomically", async () => {
		const executions: string[] = [];
		const first = emptyTool("first", () => executions.push("first"));
		const second = emptyTool("second", () => executions.push("second"));
		const agent = new Agent({
			initialState: { model: model(), tools: [first, second] },
			executionLimits: { maxAcceptedToolCalls: 1 },
			streamFn: () =>
				stream(
					assistant(
						[
							{ type: "toolCall", id: "call-1", name: "first", arguments: {} },
							{ type: "toolCall", id: "call-2", name: "second", arguments: {} },
						],
						"toolUse",
					),
				),
		});
		await agent.prompt("run both");
		expect(executions).toEqual([]);
		expect(toolResults(agent)).toHaveLength(2);
		expect(toolResults(agent).every((message) => message.isError)).toBe(true);
		expect(agent.lastRunDiagnostics?.termination).toEqual({
			reason: "limit",
			limit: "acceptedToolCalls",
			max: 1,
		});
	});

	it("pairs results for sequential calls skipped after cancellation", async () => {
		const executions: string[] = [];
		let agent: Agent;
		const first = {
			...emptyTool("first", () => {
				executions.push("first");
				agent.abort("cancelled by test");
			}),
			executionMode: "sequential" as const,
		};
		const second = {
			...emptyTool("second", () => executions.push("second")),
			executionMode: "sequential" as const,
		};
		agent = new Agent({
			initialState: { model: model(), tools: [first, second] },
			toolExecution: "sequential",
			streamFn: () =>
				stream(
					assistant(
						[
							{ type: "toolCall", id: "call-1", name: "first", arguments: {} },
							{ type: "toolCall", id: "call-2", name: "second", arguments: {} },
						],
						"toolUse",
					),
				),
		});
		await agent.prompt("run sequentially");
		expect(executions).toEqual(["first"]);
		expect(toolResults(agent)).toHaveLength(2);
		expect(toolResults(agent)[1]?.isError).toBe(true);
		expect(agent.lastRunDiagnostics?.termination.reason).toBe("aborted");
	});
});
