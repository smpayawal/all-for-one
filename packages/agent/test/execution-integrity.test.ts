import {
	type AssistantMessage,
	type AssistantMessageEvent,
	EventStream,
	type Message,
	type Model,
	type UserMessage,
} from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { agentLoop, type AgentContext, type AgentEvent, type AgentMessage } from "../src/index.ts";

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

function createUserMessage(text: string): UserMessage {
	return {
		role: "user",
		content: text,
		timestamp: Date.now(),
	};
}

function identityConverter(messages: AgentMessage[]): Message[] {
	return messages.filter(
		(message) => message.role === "user" || message.role === "assistant" || message.role === "toolResult",
	) as Message[];
}

function createContext(): AgentContext {
	return {
		systemPrompt: "You are helpful.",
		messages: [],
		tools: [],
	};
}

async function collectEvents(stream: AsyncIterable<AgentEvent>, events: AgentEvent[]): Promise<void> {
	for await (const event of stream) {
		events.push(event);
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

void MockAssistantStream;
void createUsage;
void identityConverter;

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
		void collectEvents(stream, events);

		const settled = await Promise.race([stream.result().then(() => true), delay(50).then(() => false)]);

		expect(settled).toBe(true);
		if (settled) {
			const messages = await stream.result();
			expect(messages).toHaveLength(1);
		}
		expect(events.filter((event) => event.type === "agent_end")).toHaveLength(1);
	});
});
