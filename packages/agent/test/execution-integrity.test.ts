import { type AssistantMessage, type AssistantMessageEvent, EventStream, type Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent.ts";
import { agentLoop } from "../src/agent-loop.ts";
import type { AgentContext, AgentEvent, AgentTool } from "../src/types.ts";

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
		agent.subscribe((event) => {
			if (event.type === "agent_end") throw new Error("terminal listener exploded");
		});
		const events: AgentEvent[] = [];
		agent.subscribe((event) => {
			events.push(event);
		});
		await agent.prompt("hello");
		expect(events.filter((event) => event.type === "agent_end")).toHaveLength(1);
		expect(agent.lastRunDiagnostics?.terminalEvents).toBe(1);
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
