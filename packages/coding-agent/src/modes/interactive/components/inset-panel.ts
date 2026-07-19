import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { type ThemeBg, type ThemeColor, theme } from "../theme/theme.ts";
import { fillBackgroundLine } from "./background-fill.ts";

export interface InsetPanelOptions {
	child: Component;
	borderColor: ThemeColor;
	background: ThemeBg;
	outerInset?: number;
	paddingX?: number;
}

/**
 * Presentation-only panel used to give transcript content a stable border,
 * background, and terminal-cell spacing without changing the wrapped child.
 */
export class InsetPanelComponent implements Component {
	private readonly child: Component;
	private readonly borderColor: ThemeColor;
	private readonly background: ThemeBg;
	private readonly outerInset: number;
	private readonly paddingX: number;

	constructor(options: InsetPanelOptions) {
		this.child = options.child;
		this.borderColor = options.borderColor;
		this.background = options.background;
		this.outerInset = Math.max(0, Math.floor(options.outerInset ?? 1));
		this.paddingX = Math.max(0, Math.floor(options.paddingX ?? 1));
	}

	render(width: number): string[] {
		const normalizedWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
		if (normalizedWidth === 0) return [];

		const inset = normalizedWidth >= this.outerInset * 2 + 2 ? this.outerInset : 0;
		const panelWidth = Math.max(1, normalizedWidth - inset * 2);
		const border = theme.fg(this.borderColor, "│");
		if (panelWidth === 1) return [`${" ".repeat(inset)}${border}${" ".repeat(normalizedWidth - inset - 1)}`];

		const bodyWidth = panelWidth - 1;
		const maxPadding = Math.max(0, Math.floor(bodyWidth / 2));
		const paddingX = Math.min(this.paddingX, maxPadding);
		const childWidth = Math.max(1, bodyWidth - paddingX * 2);
		const childLines = this.child.render(childWidth);
		const rendered = (childLines.length > 0 ? childLines : [""]).map((line) => {
			const clipped = truncateToWidth(line, childWidth, "");
			const content = `${" ".repeat(paddingX)}${clipped}${" ".repeat(paddingX)}`;
			const panelLine = `${border}${fillBackgroundLine(content, bodyWidth, this.background)}`;
			const rightPadding = Math.max(0, normalizedWidth - inset - visibleWidth(panelLine));
			return `${" ".repeat(inset)}${panelLine}${" ".repeat(rightPadding)}`;
		});
		return rendered;
	}

	invalidate(): void {
		this.child.invalidate?.();
	}
}
