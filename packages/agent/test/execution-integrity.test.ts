import {
	type AssistantMessage,
	type AssistantMessageEvent,
	EventStream,
	type Message,
	type Model,
	type UserMessage,
} from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import {
	Agent,
	agentLoop,
	type AgentContext,
	type AgentEvent,
	type AgentMessage,
	type AgentTool,
} from "../src/index.ts";

class MockAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected event type");
			},
		);
	}
}

function createUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function createModel(): Model<"openai-responses"> {
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

function createAssistantMessage(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "mock",
		usage: createUsage(),
		stopReason,
		timestamp: Date.now(),
	};
}

function createUserMessage(text: string): UserMessage {
	return {
		role: "user",
		content: text,
		timestamp: Date.now(),
	};
}

function createContext(tools: AgentTool[] = []): AgentContext {
	return {
		systemPrompt: "You are helpful.",
		messages: [],
		tools,
	};
}

function identityConverter(messages: AgentMessage[]): Message[] {
	return messages.filter(
		(message) => message.role === "user" || message.role === "assistant" || message.role === "toolResult",
	) as Message[];
}

function streamMessage(message: AssistantMessage): MockAssistantStream {
	const stream = new MockAssistantStream();
	queueMicrotask(() => {
		stream.push({ type: "done", reason: message.stopReason, message });
	});
	return stream;
}

async function collectEvents(stream: AsyncIterable<AgentEvent>, events: AgentEvent[]): Promise<void> {
	for await (const event of stream) {
		events.push(event);
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getToolResults(agent: Agent) {
	return agent.state.messages.filter((message) => message.role === "toolResult");
}

describe("execution integrity", () => {
	it("settles the low-level event stream when context conversion rejects", async () => {
		const stream = agentLoop(
			[createUserMessage("hello")],
			createContext(),
			{
				model: createModel(),
				convertToLlm: async () => {
					throw new Error("conversion exploded");
				},
			},
		);
		const events: AgentEvent[] = [];
		const eventCollection = collectEvents(stream, events);

		const settled = await Promise.race([stream.result().then(() => true), delay(50).then(() => false)]);

		expect(settled).toBe(true);
		if (settled) {
			const messages = await stream.result();
			expect(messages).toHaveLength(1);
			await eventCollection;
		}
		expect(events.filter((event) => event.type === "agent_end")).toHaveLength(1);
	});

	it("emits one terminal event when a non-terminal listener rejects", async () => {
		const agent = new Agent({
			initialState: { model: createModel() },
			streamFn: () => streamMessage(createAssistantMessage([{ type: "text", text: "ok" }])),
		});
		let listenerCalls = 0;
		agent.subscribe((event) => {
			if (event.type === "message_start" && event.message.role === "assistant") {
				listenerCalls++;
				throw new Error("listener exploded");
			}
		});
		const healthyEvents: AgentEvent[] = [];
		agent.subscribe((event) => {
			healthyEvents.push(event);
		});

		await agent.prompt("hello");

		expect(listenerCalls).toBe(1);
		expect(healthyEvents.filter((event) => event.type === "agent_end")).toHaveLength(1);
		expect(agent.state.isStreaming).toBe(false);
		expect(agent.state.errorMessage).toBe("listener exploded");
		expect(agent.lastRunDiagnostics?.listenerErrors).toEqual(["listener exploded"]);
	});

	it("does not re-enter terminalization when an agent_end listener rejects", async () => {
		const agent = new Agent({
			initialState: { model: createModel() },
			streamFn: () => streamMessage(createAssistantMessage([{ type: "text", text: "ok" }])),
		});
		agent.subscribe((event) => {
			if (event.type === "agent_end") {
				throw new Error("terminal listener exploded");
			}
		});
		const healthyEvents: AgentEvent[] = [];
		agent.subscribe((event) => {
			healthyEvents.push(event);
		});

		await agent.prompt("hello");

		expect(healthyEvents.filter((event) => event.type === "agent_end")).toHaveLength(1);
		expect(agent.state.isStreaming).toBe(false);
		expect(agent.state.errorMessage).toBe("terminal listener exploded");
		expect(agent.lastRunDiagnostics?.terminalEvents).toBe(1);
		const finalMessage = agent.state.messages[agent.state.messages.length - 1];
		expect(finalMessage?.role).toBe("assistant");
		if (finalMessage?.role === "assistant") {
			expect(finalMessage.content).toEqual([{ type: "text", text: "ok" }]);
		}
	});

	it("stops before another provider request when maxTurns is reached", async () => {
		const toolSchema = Type.Object({});
		let toolExecutions = 0;
		const tool: AgentTool<typeof toolSchema, Record<string, never>> = {
			name: "inspect",
			label: "Inspect",
			description: "Inspect once",
			parameters: toolSchema,
			async execute() {
				toolExecutions++;
				return { content: [{ type: "text", text: "done" }], details: {} };
			},
		};
		let providerCalls = 0;
		const agent = new Agent({
			initialState: { model: createModel(), tools: [tool] },
			executionLimits: { maxTurns: 1 },
			streamFn: () => {
				providerCalls++;
				return streamMessage(
					providerCalls === 1
						? createAssistantMessage(
								[{ type: "toolCall", id: "call-1", name: "inspect", arguments: {} }],
								"toolUse",
							)
						: createAssistantMessage([{ type: "text", text: "unexpected" }]),
				);
			},
		});

		await agent.prompt("inspect");

		expect(providerCalls).toBe(1);
		expect(toolExecutions).toBe(1);
		expect(agent.lastRunDiagnostics?.termination).toEqual({ reason: "limit", limit: "turns", max: 1 });
	});

	it("rejects an oversized tool batch without partially executing it", async () => {
		const toolSchema = Type.Object({});
		const executions: string[] = [];
		const createTool = (name: string): AgentTool<typeof toolSchema, Record<string, never>> => ({
			name,
			label: name,
			description: name,
			parameters: toolSchema,
			async execute() {
				executions.push(name);
				return { content: [{ type: "text", text: name }], details: {} };
			},
		});
		const agent = new Agent({
			initialState: { model: createModel(), tools: [createTool("first"), createTool("second")] },
			executionLimits: { maxToolCalls: 1 },
			streamFn: () =>
				streamMessage(
					createAssistantMessage(
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
		const toolResults = getToolResults(agent);
		expect(toolResults).toHaveLength(2);
		expect(toolResults.every((message) => message.isError)).toBe(true);
		expect(agent.lastRunDiagnostics?.termination).toEqual({ reason: "limit", limit: "toolCalls", max: 1 });
	});

	it("does not execute later sequential tools after cancellation and still pairs their results", async () => {
		const toolSchema = Type.Object({});
		const executions: string[] = [];
		let agent: Agent;
		const first: AgentTool<typeof toolSchema, Record<string, never>> = {
			name: "first",
			label: "First",
			description: "Abort after completion",
			parameters: toolSchema,
			executionMode: "sequential",
			async execute() {
				executions.push("first");
				agent.abort("cancelled by test");
				return { content: [{ type: "text", text: "first complete" }], details: {} };
			},
		};
		const second: AgentTool<typeof toolSchema, Record<string, never>> = {
			name: "second",
			label: "Second",
			description: "Must not run",
			parameters: toolSchema,
			executionMode: "sequential",
			async execute() {
				executions.push("second");
				return { content: [{ type: "text", text: "second complete" }], details: {} };
			},
		};
		agent = new Agent({
			initialState: { model: createModel(), tools: [first, second] },
			toolExecution: "sequential",
			streamFn: () =>
				streamMessage(
					createAssistantMessage(
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
		const toolResults = getToolResults(agent);
		expect(toolResults).toHaveLength(2);
		expect(toolResults[1].isError).toBe(true);
		expect(agent.lastRunDiagnostics?.termination.reason).toBe("aborted");
	});
});
