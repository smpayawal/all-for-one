import { type Component, type OverlayHandle, type TUI, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	calculateResponsiveLayout,
	getSessionRailLayout,
	type ResponsiveLayout,
	SESSION_RAIL_MAX_WIDTH,
	SESSION_RAIL_MIN_WIDTH,
} from "../responsive-layout.ts";
import { theme } from "../theme/theme.ts";

export interface InteractiveApplicationShellOptions {
	tui: TUI;
	transcript: Component;
	rail: Component;
	editor: Component;
	bottomAccessory?: Component;
	footer: Component;
	getTerminalHeight: () => number;
}

/**
 * Root presentation component for interactive mode.
 *
 * It owns only region composition and sizing. Runtime events continue to
 * update the child components owned by InteractiveMode.
 */
export class InteractiveApplicationShell implements Component {
	private readonly tui: TUI;
	private readonly transcript: Component;
	private readonly rail: Component;
	private readonly editor: Component;
	private readonly bottomAccessory: Component | undefined;
	private readonly footer: Component;
	private readonly getTerminalHeight: () => number;
	private readonly railOverlayHandles: OverlayHandle[] = [];
	private layout: ResponsiveLayout | undefined;
	private disposed = false;

	constructor(options: InteractiveApplicationShellOptions) {
		this.tui = options.tui;
		this.transcript = options.transcript;
		this.rail = options.rail;
		this.editor = options.editor;
		this.bottomAccessory = options.bottomAccessory;
		this.footer = options.footer;
		this.getTerminalHeight = options.getTerminalHeight;

		for (let railWidth = SESSION_RAIL_MIN_WIDTH; railWidth <= SESSION_RAIL_MAX_WIDTH; railWidth += 1) {
			this.railOverlayHandles.push(
				this.tui.showOverlay(this.rail, {
					anchor: "top-right",
					nonCapturing: true,
					visible: (width) => getSessionRailLayout(width).railWidth === railWidth,
					width: railWidth,
				}),
			);
		}
	}

	getLayout(width = this.tui.terminal.columns, height = this.getTerminalHeight()): ResponsiveLayout {
		if (this.layout?.terminal.width === width && this.layout.terminal.height === height) {
			return this.layout;
		}

		const editorLines = this.editor.render(width);
		const accessoryLines = this.bottomAccessory?.render(width) ?? [];
		const footerLines = this.footer.render(width);
		this.layout = calculateResponsiveLayout({
			terminalWidth: width,
			terminalHeight: height,
			editorHeight: editorLines.length,
			bottomAccessoryHeight: accessoryLines.length,
			footerHeight: footerLines.length,
		});
		return this.layout;
	}

	getAvailableMainHeight(width = this.tui.terminal.columns): number {
		return this.getLayout(width, this.getTerminalHeight()).transcript.height;
	}

	isRailVisible(width = this.tui.terminal.columns): boolean {
		return this.getLayout(width, this.getTerminalHeight()).rail.visible;
	}

	render(width: number): string[] {
		const height = this.getTerminalHeight();
		const editorLines = this.editor.render(width);
		const accessoryLines = this.bottomAccessory?.render(width) ?? [];
		const footerLines = this.footer.render(width);
		this.layout = calculateResponsiveLayout({
			terminalWidth: width,
			terminalHeight: height,
			editorHeight: editorLines.length,
			bottomAccessoryHeight: accessoryLines.length,
			footerHeight: footerLines.length,
		});

		const transcriptLines = this.transcript.render(this.layout.transcript.width);
		const targetTranscriptHeight = Math.max(transcriptLines.length, this.layout.transcript.height);
		const mainLines = this.renderTranscriptLines(transcriptLines, targetTranscriptHeight, this.layout);
		return [...mainLines, ...editorLines, ...accessoryLines, ...footerLines];
	}

	invalidate(): void {
		this.transcript.invalidate?.();
		this.rail.invalidate?.();
		this.editor.invalidate?.();
		this.bottomAccessory?.invalidate?.();
		this.footer.invalidate?.();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const handle of this.railOverlayHandles) {
			handle.hide();
		}
		this.railOverlayHandles.length = 0;
	}

	private renderTranscriptLines(lines: string[], targetHeight: number, layout: ResponsiveLayout): string[] {
		if (!layout.rail.visible) {
			return [...lines, ...Array.from({ length: Math.max(0, targetHeight - lines.length) }, () => "")];
		}

		const decoratedLines = lines.map((line) => this.addRailDivider(line, layout.transcript.width));
		while (decoratedLines.length < targetHeight) {
			decoratedLines.push(this.addRailDivider("", layout.transcript.width));
		}
		return decoratedLines;
	}

	private addRailDivider(line: string, transcriptWidth: number): string {
		const truncated = truncateToWidth(line, transcriptWidth, "");
		const padding = " ".repeat(Math.max(0, transcriptWidth - visibleWidth(truncated)));
		return `${truncated}${padding}${theme.fg("border", "│")}`;
	}
}
