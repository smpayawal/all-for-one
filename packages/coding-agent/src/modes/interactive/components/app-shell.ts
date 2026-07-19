import { type Component, type TUI, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { calculateResponsiveLayout, type ResponsiveLayout } from "../responsive-layout.ts";
import { theme } from "../theme/theme.ts";
import { measureTuiRender } from "../tui-render-profiler.ts";
import { fillBackgroundLine, fillBackgroundLines } from "./background-fill.ts";

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
	}

	getLayout(width = this.tui.terminal.columns, height = this.getTerminalHeight()): ResponsiveLayout {
		if (this.layout?.terminal.width === width && this.layout.terminal.height === height) return this.layout;

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
		return measureTuiRender(
			"app-shell",
			() => this.renderFrame(width),
			(lines) => ({ width, lines: lines.length, railVisible: this.layout?.rail.visible ?? false }),
		);
	}

	invalidate(): void {
		this.layout = undefined;
		this.transcript.invalidate?.();
		this.rail.invalidate?.();
		this.editor.invalidate?.();
		this.bottomAccessory?.invalidate?.();
		this.footer.invalidate?.();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
	}

	private renderFrame(width: number): string[] {
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
		const mainLines = this.renderMainRegion(transcriptLines, targetTranscriptHeight, this.layout);
		return [
			...mainLines,
			...fillBackgroundLines(editorLines, width, "customMessageBg"),
			...fillBackgroundLines(accessoryLines, width, "customMessageBg"),
			...fillBackgroundLines(footerLines, width, "customMessageBg"),
		];
	}

	private renderMainRegion(lines: string[], targetHeight: number, layout: ResponsiveLayout): string[] {
		if (!layout.rail.visible) {
			const padded = [...lines, ...Array.from({ length: Math.max(0, targetHeight - lines.length) }, () => "")];
			return fillBackgroundLines(padded, layout.transcript.width, "customMessageBg");
		}

		const railLines = this.rail.render(layout.rail.width);
		const result: string[] = [];
		for (let index = 0; index < targetHeight; index += 1) {
			const transcriptLine = this.padRegion(lines[index] ?? "", layout.transcript.width);
			const railLine = this.padRegion(railLines[index] ?? "", layout.rail.width);
			result.push(`${transcriptLine}${theme.fg("border", "│")}${railLine}`);
		}
		return result;
	}

	private padRegion(line: string, width: number): string {
		const truncated = truncateToWidth(line, width, "");
		const padding = " ".repeat(Math.max(0, width - visibleWidth(truncated)));
		return fillBackgroundLine(`${truncated}${padding}`, width, "customMessageBg");
	}
}
