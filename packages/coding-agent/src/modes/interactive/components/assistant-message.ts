import type { AssistantMessage } from "@earendil-works/pi-ai";
import { type Component, Container, Markdown, type MarkdownTheme, Spacer, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { getMarkdownTheme, type ThemeBg, type ThemeColor, theme } from "../theme/theme.ts";
import { InsetPanelComponent } from "./inset-panel.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const PLAN_LABEL = "PLAN";
const RESULT_LABEL = "RESULT";

interface LabeledAssistantPanelOptions {
	label?: string;
	labelColor: ThemeColor;
	child: Component;
	borderColor: ThemeColor;
	background: ThemeBg;
	inset: number;
}

/**
 * Presentation-only wrapper for visible assistant output. Labels remain
 * secondary metadata while the bounded panel owns the readable content.
 */
class LabeledAssistantPanelComponent implements Component {
	private readonly label: string | undefined;
	private readonly labelColor: ThemeColor;
	private readonly inset: number;
	private readonly panel: InsetPanelComponent;

	constructor(options: LabeledAssistantPanelOptions) {
		this.label = options.label;
		this.labelColor = options.labelColor;
		this.inset = Math.max(0, Math.floor(options.inset));
		this.panel = new InsetPanelComponent({
			child: options.child,
			borderColor: options.borderColor,
			background: options.background,
			outerInset: this.inset,
			paddingX: 1,
		});
	}

	render(width: number): string[] {
		const normalizedWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
		if (normalizedWidth === 0) return [];

		const lines: string[] = [];
		if (this.label) {
			const inset = Math.min(this.inset, Math.max(0, normalizedWidth - 1));
			const labelWidth = Math.max(1, normalizedWidth - inset);
			lines.push(
				`${" ".repeat(inset)}${truncateToWidth(theme.fg(this.labelColor, this.label), labelWidth, "")}`,
			);
		}
		lines.push(...this.panel.render(normalizedWidth));
		return lines;
	}

	invalidate(): void {
		this.panel.invalidate();
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
					const label = !hasToolCalls && !resultLabelRendered ? RESULT_LABEL : undefined;
					if (label) resultLabelRendered = true;
					this.contentContainer.addChild(
						new LabeledAssistantPanelComponent({
							label,
							labelColor: "muted",
							child: markdown,
							borderColor: "accent",
							background: "selectedBg",
							inset: this.outputPad,
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
							: new LabeledAssistantPanelComponent({
								label: PLAN_LABEL,
								labelColor: "muted",
								child: planningMarkdown,
								borderColor: "borderAccent",
								background: "toolPendingBg",
								inset: this.outputPad,
							}),
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
