import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
	type Component,
	Container,
	Markdown,
	type MarkdownTheme,
	Spacer,
	Text,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.ts";
import { InsetPanelComponent } from "./inset-panel.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const PLAN_LABEL = "PLAN";
const RESULT_LABEL = "RESULT";

class PlanningBlockComponent implements Component {
	private readonly content: Component;
	private readonly inset: number;

	constructor(content: Component, inset = 0) {
		this.content = content;
		this.inset = Math.max(0, Math.floor(inset));
	}

	render(width: number): string[] {
		const normalizedWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
		if (normalizedWidth === 0) return [];

		const inset = Math.min(this.inset, Math.max(0, normalizedWidth - 1));
		const innerWidth = normalizedWidth - inset;
		const styledPrefix = `${theme.bold(theme.fg("customMessageLabel", PLAN_LABEL))} `;
		const prefixWidth = visibleWidth(styledPrefix);
		if (prefixWidth >= innerWidth) {
			return [`${" ".repeat(inset)}${truncateToWidth(styledPrefix, innerWidth, "")}`];
		}

		const contentWidth = innerWidth - prefixWidth;
		const lines = this.content.render(contentWidth);
		if (lines.length === 0) return [`${" ".repeat(inset)}${styledPrefix}`];
		return lines.map((line, index) => {
			const prefix = index === 0 ? styledPrefix : " ".repeat(prefixWidth);
			return `${" ".repeat(inset)}${truncateToWidth(`${prefix}${line}`, innerWidth, "")}`;
		});
	}

	invalidate(): void {
		this.content.invalidate?.();
	}
}

/**
 * Component that renders a complete assistant message.
 */
export class AssistantMessageComponent extends Container {
	private contentContainer: Container;
	private hideThinkingBlock: boolean;
	private markdownTheme: MarkdownTheme;
	private readonly followsGlobalMarkdownTheme: boolean;
	private hiddenThinkingLabel: string;
	private outputPad: number;
	private lastMessage?: AssistantMessage;
	private hasToolCalls = false;

	constructor(
		message?: AssistantMessage,
		hideThinkingBlock = false,
		markdownTheme?: MarkdownTheme,
		hiddenThinkingLabel = "Thinking...",
		outputPad = 1,
	) {
		super();

		this.hideThinkingBlock = hideThinkingBlock;
		this.followsGlobalMarkdownTheme = markdownTheme === undefined;
		this.markdownTheme = markdownTheme ?? getMarkdownTheme();
		this.hiddenThinkingLabel = hiddenThinkingLabel;
		this.outputPad = outputPad;

		this.contentContainer = new Container();
		this.addChild(this.contentContainer);

		if (message) {
			this.updateContent(message);
		}
	}

	override invalidate(): void {
		super.invalidate();
		if (this.followsGlobalMarkdownTheme) {
			this.markdownTheme = getMarkdownTheme();
		}
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setHideThinkingBlock(hide: boolean): void {
		this.hideThinkingBlock = hide;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setHiddenThinkingLabel(label: string): void {
		this.hiddenThinkingLabel = label;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setOutputPad(padding: number): void {
		this.outputPad = padding;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (this.hasToolCalls || lines.length === 0) {
			return lines;
		}

		lines[0] = OSC133_ZONE_START + lines[0];
		lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
		return lines;
	}

	updateContent(message: AssistantMessage): void {
		this.lastMessage = message;
		this.contentContainer.clear();

		const hasVisibleContent = message.content.some(
			(c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()),
		);
		const hasToolCalls = message.content.some((c) => c.type === "toolCall");
		this.hasToolCalls = hasToolCalls;

		if (hasVisibleContent) {
			this.contentContainer.addChild(new Spacer(1));
		}

		let resultLabelRendered = false;
		for (let i = 0; i < message.content.length; i++) {
			const content = message.content[i];
			if (content.type === "text" && content.text.trim()) {
				const markdown = new Markdown(content.text.trim(), 0, 0, this.markdownTheme);
				if (this.outputPad === 0) {
					this.contentContainer.addChild(markdown);
				} else {
					if (!hasToolCalls && !resultLabelRendered) {
						this.contentContainer.addChild(new Text(theme.fg("muted", RESULT_LABEL), this.outputPad, 0));
						resultLabelRendered = true;
					}
					this.contentContainer.addChild(
						new InsetPanelComponent({
							child: markdown,
							borderColor: "accent",
							background: "selectedBg",
							outerInset: this.outputPad,
							paddingX: 1,
						}),
					);
				}
			} else if (content.type === "thinking") {
				const thinkingBlocks: string[] = [];
				for (; i < message.content.length; i++) {
					const thinkingContent = message.content[i];
					if (thinkingContent.type !== "thinking") {
						break;
					}
					const thinking = thinkingContent.thinking.trim();
					if (thinking) {
						thinkingBlocks.push(thinking);
					}
				}
				i--;

				if (thinkingBlocks.length === 0) {
					continue;
				}

				const hasVisibleContentAfter = message.content
					.slice(i + 1)
					.some((c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));

				if (this.hideThinkingBlock) {
					this.contentContainer.addChild(
						new Text(theme.italic(theme.fg("thinkingText", this.hiddenThinkingLabel)), this.outputPad, 0),
					);
				} else {
					const planningMarkdown = new Markdown(
						thinkingBlocks.join("\n\n"),
						0,
						0,
						this.markdownTheme,
						{
							color: (text: string) => theme.fg("thinkingText", text),
							italic: true,
						},
					);
					this.contentContainer.addChild(
						this.outputPad === 0
							? planningMarkdown
							: new PlanningBlockComponent(planningMarkdown, this.outputPad),
					);
				}
				if (hasVisibleContentAfter) {
					this.contentContainer.addChild(new Spacer(1));
				}
			}
		}

		if (message.stopReason === "length") {
			this.contentContainer.addChild(new Spacer(1));
			this.contentContainer.addChild(
				new Text(
					theme.fg(
						"error",
						"Error: Model stopped because it reached the maximum output token limit. The response may be incomplete.",
					),
					this.outputPad,
					0,
				),
			);
		} else if (!hasToolCalls) {
			if (message.stopReason === "aborted") {
				const abortMessage =
					message.errorMessage && message.errorMessage !== "Request was aborted"
						? message.errorMessage
						: "Operation aborted";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), this.outputPad, 0));
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || "Unknown error";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), this.outputPad, 0));
			}
		}
	}
}
