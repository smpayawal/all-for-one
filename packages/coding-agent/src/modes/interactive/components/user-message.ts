import { Box, Container, Markdown, type MarkdownTheme, visibleWidth } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const BACKGROUND_RESET = "\x1b[49m";
const USER_MESSAGE_BORDER = "▎";
const OUTER_INSET = 1;

/**
 * Component that renders a user message.
 *
 * The narrow role border and one-cell outer inset are presentation-only. They
 * preserve message content and shell integration while matching the prototype's
 * bounded message card and transcript breathing room.
 */
export class UserMessageComponent extends Container {
	private text: string;
	private markdownTheme: MarkdownTheme;
	private outputPad: number;

	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme(), outputPad = 1) {
		super();
		this.text = text;
		this.markdownTheme = markdownTheme;
		this.outputPad = outputPad;
		this.rebuild();
	}

	setOutputPad(padding: number): void {
		this.outputPad = padding;
		this.rebuild();
	}

	private rebuild(): void {
		this.clear();
		const contentBox = new Box(this.outputPad, 1, (content: string) => theme.bg("userMessageBg", content));
		contentBox.addChild(
			new Markdown(
				this.text,
				0,
				0,
				this.markdownTheme,
				{
					color: (content: string) => theme.fg("userMessageText", content),
				},
				{ preserveOrderedListMarkers: true, preserveBackslashEscapes: true },
			),
		);
		this.addChild(contentBox);
	}

	override render(width: number): string[] {
		const normalizedWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
		if (normalizedWidth === 0) return [];

		const inset = normalizedWidth >= 4 ? OUTER_INSET : 0;
		const contentWidth = Math.max(0, normalizedWidth - inset * 2 - 1);
		const border = theme.fg("customMessageLabel", USER_MESSAGE_BORDER);
		const lines = super.render(contentWidth).map((line) => {
			const framed = `${border}${line}`;
			const rightPadding = Math.max(0, normalizedWidth - inset - visibleWidth(framed));
			return `${" ".repeat(inset)}${framed}${" ".repeat(rightPadding)}${BACKGROUND_RESET}`;
		});
		if (lines.length === 0) return lines;

		lines[0] = OSC133_ZONE_START + lines[0];
		lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
		return lines;
	}
}
