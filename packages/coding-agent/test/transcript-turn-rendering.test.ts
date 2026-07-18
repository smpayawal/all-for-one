import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai/compat";
import { beforeAll, describe, expect, test } from "vitest";
import { Text } from "../../tui/src/components/text.ts";
import { Container, TUI, visibleWidth } from "../../tui/src/tui.ts";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { InteractiveApplicationShell } from "../src/modes/interactive/components/app-shell.ts";
import { AssistantMessageComponent } from "../src/modes/interactive/components/assistant-message.ts";
import { ToolExecutionComponent } from "../src/modes/interactive/components/tool-execution.ts";
import { TranscriptTurnHeaderComponent } from "../src/modes/interactive/components/transcript-turn-header.ts";
import { UserMessageComponent } from "../src/modes/interactive/components/user-message.ts";
import { getMarkdownTheme, initTheme } from "../src/modes/interactive/theme/theme.ts";
import { TranscriptViewport } from "../src/modes/interactive/transcript-viewport.ts";

function createAssistantMessage(content: AssistantMessage["content"]): AssistantMessage {
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

function createTranscript(tui: TUI): Container {
	const markdownTheme = getMarkdownTheme();
	const userMessage: UserMessage = {
		role: "user",
		content: "Analyze this repository.\n\n- preserve the runtime\n- inspect the viewport",
		timestamp: 1,
	};
	const assistantMessage = createAssistantMessage([
		{ type: "thinking", thinking: "I will trace the layout before changing it." },
		{ type: "text", text: "The transcript is controlled by the application viewport." },
		{ type: "toolCall", id: "call-1", name: "demo", arguments: { path: "README.md" } },
	]);
	const continuation = createAssistantMessage([{ type: "text", text: "The layout boundary is now explicit." }]);

	const content = new Container();
	content.addChild(new TranscriptTurnHeaderComponent("user", "session:u1"));
	content.addChild(new UserMessageComponent(userMessage.content as string, markdownTheme, 1));
	content.addChild(new TranscriptTurnHeaderComponent("assistant", "session:a1"));
	content.addChild(new AssistantMessageComponent(assistantMessage, false, markdownTheme, "Thinking...", 1));

	const tool = new ToolExecutionComponent("demo", "call-1", { path: "README.md" }, {}, undefined, tui, process.cwd());
	tool.markExecutionStarted();
	tool.updateResult({ content: [{ type: "text", text: "Read completed" }], isError: false });
	content.addChild(tool);
	content.addChild(new AssistantMessageComponent(continuation, false, markdownTheme, "Thinking...", 1));
	content.addChild(new Text("Informational startup and extension content remains outside the turns.", 1, 0));
	return content;
}

describe("rendered transcript turn hierarchy", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("keeps role markers and existing content renderers visible through the viewport", async () => {
		const terminal = new VirtualTerminal(80, 30);
		const tui = new TUI(terminal);
		let shell: InteractiveApplicationShell;
		const transcript = createTranscript(tui);
		const viewport = new TranscriptViewport({
			content: transcript,
			getViewportHeight: () => shell.getAvailableMainHeight(),
		});
		shell = new InteractiveApplicationShell({
			tui,
			transcript: viewport,
			rail: new Text("RAIL", 0, 0),
			editor: new Text("EDITOR", 0, 0),
			footer: new Text("FOOTER", 0, 0),
			getTerminalHeight: () => terminal.rows,
		});
		tui.addChild(shell);
		tui.start();

		try {
			for (const [width, height] of [
				[80, 40],
				[100, 24],
				[128, 24],
				[160, 24],
				[220, 24],
			] as const) {
				terminal.resize(width, height);
				await terminal.waitForRender();
				const screen = terminal.getViewport();
				const plain = screen.join("\n").replace(/\u001b\[[0-9;]*m/g, "");

				expect(screen).toHaveLength(height);
				expect(plain).toContain("ALL-FOR-ONE");
				expect(plain).toContain("Analyze this repository.");
				expect(plain).toContain("The transcript is controlled");
				expect(plain).toContain("Read completed");
				expect(plain).toContain("The layout boundary is now explicit.");
				if (height >= 40) {
					expect(plain).toContain("YOU");
				}
				expect(screen.some((line) => line.includes("RAIL"))).toBe(width >= 128);
				for (const line of screen) {
					expect(visibleWidth(line)).toBeLessThanOrEqual(width);
				}
			}
		} finally {
			shell.dispose();
			tui.stop();
		}
	});
});
