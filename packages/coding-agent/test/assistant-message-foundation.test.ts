import type { AssistantMessage } from "@earendil-works/pi-ai";
import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, test } from "vitest";
import { AssistantMessageComponent } from "../src/modes/interactive/components/assistant-message.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function createMessage(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-completions",
		provider: "openai",
		model: "test-model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 1,
	};
}

beforeAll(() => {
	initTheme("dark");
});

describe("assistant message foundation", () => {
	test("labels visible reasoning as PLAN and frames final text as a result panel", () => {
		const component = new AssistantMessageComponent(
			createMessage([
				{ type: "thinking", thinking: "Inspecting the render hierarchy before editing." },
				{ type: "text", text: "The presentation layer can change without modifying runtime behavior." },
			]),
			false,
		);

		const lines = component.render(80);
		const plain = lines.map(stripAnsi);
		const resultLabel = lines.find((line) => stripAnsi(line).trim() === "RESULT");
		expect(plain.some((line) => line.includes("PLAN Inspecting the render hierarchy before editing."))).toBe(true);
		expect(resultLabel).toContain(theme.getFgAnsi("muted"));
		expect(resultLabel).not.toContain("\x1b[1m");
		expect(
			plain.some((line) => line.includes("│ The presentation layer can change without modifying runtime behavior.")),
		).toBe(true);
		expect(
			lines.some(
				(line) => line.includes(theme.getBgAnsi("customMessageBg")) && stripAnsi(line).includes("presentation layer"),
			),
		).toBe(true);
		expect(lines[0]).toContain(OSC133_ZONE_START);
		expect(lines.at(-1)).toContain(OSC133_ZONE_END + OSC133_ZONE_FINAL);
		for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(80);
	});

	test("keeps hidden thinking compact while preserving the result panel", () => {
		const component = new AssistantMessageComponent(
			createMessage([
				{ type: "thinking", thinking: "Internal reasoning." },
				{ type: "text", text: "Visible result." },
			]),
			true,
			undefined,
			"Thinking...",
		);

		const output = stripAnsi(component.render(48).join("\n"));
		expect(output).toContain("Thinking...");
		expect(output).not.toContain("PLAN Internal reasoning.");
		expect(output).toContain("│ Visible result.");
	});

	test("preserves unframed column-zero rendering when output padding is disabled", () => {
		const component = new AssistantMessageComponent(
			createMessage([{ type: "text", text: "Raw compatible output." }]),
			false,
			undefined,
			"Thinking...",
			0,
		);

		const output = stripAnsi(component.render(48).join("\n"));
		expect(output).toContain("Raw compatible output.");
		expect(output).not.toContain("RESULT");
		expect(output).not.toContain("│ Raw compatible output.");
	});
});
