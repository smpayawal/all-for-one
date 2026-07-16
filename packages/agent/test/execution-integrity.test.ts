import { type Model, type UserMessage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { agentLoop, type AgentContext, type AgentEvent } from "../src/index.ts";

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
