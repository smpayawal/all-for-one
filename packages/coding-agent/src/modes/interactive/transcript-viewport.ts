import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { theme } from "./theme/theme.ts";
import {
	createTranscriptViewportState,
	getTranscriptViewportMetrics,
	reduceTranscriptViewportState,
	type TranscriptViewportAction,
	type TranscriptViewportState,
} from "./transcript-viewport-state.ts";

export interface TranscriptMouseWheelEvent {
	direction: "up" | "down";
	x: number;
	y: number;
}

export interface TranscriptViewportBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

function normalizeDimension(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function parseSgrMouseWheel(data: string): TranscriptMouseWheelEvent | undefined {
	const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)[Mm]$/);
	if (!match) return undefined;

	const button = Number(match[1]);
	if (!Number.isInteger(button) || (button & 64) === 0) return undefined;

	return {
		direction: (button & 1) === 0 ? "up" : "down",
		x: Number(match[2]) - 1,
		y: Number(match[3]) - 1,
	};
}

function parseLegacyMouseWheel(data: string): TranscriptMouseWheelEvent | undefined {
	if (data.length !== 6 || !data.startsWith("\x1b[M")) return undefined;

	const button = data.charCodeAt(3) - 32;
	if ((button & 64) === 0) return undefined;

	return {
		direction: (button & 1) === 0 ? "up" : "down",
		x: data.charCodeAt(4) - 33,
		y: data.charCodeAt(5) - 33,
	};
}

export function parseTranscriptMouseWheel(data: string): TranscriptMouseWheelEvent | undefined {
	return parseSgrMouseWheel(data) ?? parseLegacyMouseWheel(data);
}

export interface TranscriptViewportOptions {
	content: Component;
	getViewportHeight: () => number;
}

/**
 * Bounds the existing transcript components to the application shell's region.
 * Historical position is a visual-row anchor; width changes clamp that anchor
 * after rewrapping rather than changing session or message data.
 */
export class TranscriptViewport implements Component {
	private readonly content: Component;
	private readonly getViewportHeight: () => number;
	private state: TranscriptViewportState = createTranscriptViewportState();
	private previousLines: string[] | undefined;
	private previousWidth = 0;

	constructor(options: TranscriptViewportOptions) {
		this.content = options.content;
		this.getViewportHeight = options.getViewportHeight;
	}

	render(width: number): string[] {
		const transcriptWidth = normalizeDimension(width);
		const viewportHeight = normalizeDimension(this.getViewportHeight());
		const lines = this.content.render(transcriptWidth);
		const widthChanged = this.previousLines !== undefined && this.previousWidth !== transcriptWidth;
		const contentChanged = this.previousLines !== undefined && !sameLines(this.previousLines, lines);

		this.state = reduceTranscriptViewportState(this.state, {
			type: "sync",
			contentHeight: lines.length,
			viewportHeight,
			contentChanged,
			resized: widthChanged,
		});

		const metrics = getTranscriptViewportMetrics(this.state);
		const visibleLines = lines
			.slice(metrics.scrollTop, metrics.scrollTop + metrics.contentViewportHeight)
			.map((line) => truncateToWidth(line, transcriptWidth, ""));
		while (visibleLines.length < metrics.contentViewportHeight) {
			visibleLines.push("");
		}

		if (metrics.indicatorVisible) {
			visibleLines.push(this.renderUnseenIndicator(transcriptWidth, metrics.unseenUpdates));
		}
		while (visibleLines.length < viewportHeight) {
			visibleLines.push("");
		}

		this.previousLines = lines;
		this.previousWidth = transcriptWidth;
		return visibleLines.slice(0, viewportHeight);
	}

	getState(): TranscriptViewportState {
		return { ...this.state };
	}

	getMetrics(): ReturnType<typeof getTranscriptViewportMetrics> {
		return getTranscriptViewportMetrics(this.state);
	}

	pageUp(): boolean {
		return this.apply({ type: "pageUp" });
	}

	pageDown(): boolean {
		return this.apply({ type: "pageDown" });
	}

	end(): boolean {
		return this.apply({ type: "end" });
	}

	wheel(direction: "up" | "down"): boolean {
		return this.apply({ type: "wheel", direction });
	}

	handleMouseWheel(data: string, bounds: TranscriptViewportBounds): boolean {
		const event = parseTranscriptMouseWheel(data);
		if (!event) return false;
		if (
			event.x < bounds.x ||
			event.x >= bounds.x + Math.max(0, bounds.width) ||
			event.y < bounds.y ||
			event.y >= bounds.y + Math.max(0, bounds.height)
		) {
			return false;
		}

		this.wheel(event.direction);
		return true;
	}

	reset(): void {
		this.state = reduceTranscriptViewportState(this.state, { type: "reset" });
		this.previousLines = undefined;
		this.previousWidth = 0;
	}

	markContentReplaced(): void {
		this.previousLines = undefined;
		this.previousWidth = 0;
	}

	invalidate(): void {
		this.content.invalidate();
		this.previousLines = undefined;
		this.previousWidth = 0;
	}

	private apply(action: TranscriptViewportAction): boolean {
		const previous = this.state;
		const next = reduceTranscriptViewportState(previous, action);
		this.state = next;
		return (
			previous.followLatest !== next.followLatest ||
			previous.scrollTop !== next.scrollTop ||
			previous.unseenUpdates !== next.unseenUpdates
		);
	}

	private renderUnseenIndicator(width: number, unseenUpdates: number): string {
		const text = theme.fg("muted", `↓ ${unseenUpdates} new updates · End to follow`);
		const truncated = truncateToWidth(text, width, "");
		return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
	}
}

function sameLines(previous: readonly string[], current: readonly string[]): boolean {
	if (previous.length !== current.length) return false;
	for (let index = 0; index < current.length; index += 1) {
		if (previous[index] !== current[index]) return false;
	}
	return true;
}
