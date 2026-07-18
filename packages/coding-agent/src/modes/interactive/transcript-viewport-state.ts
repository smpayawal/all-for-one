export const TRANSCRIPT_PAGE_OVERLAP = 2;
export const TRANSCRIPT_WHEEL_STEP = 3;

export interface TranscriptViewportState {
	followLatest: boolean;
	scrollTop: number;
	contentHeight: number;
	viewportHeight: number;
	unseenUpdates: number;
	transcriptRevision: number;
}

export interface TranscriptViewportMetrics {
	contentViewportHeight: number;
	maxScrollTop: number;
	scrollTop: number;
	indicatorVisible: boolean;
	unseenUpdates: number;
	followLatest: boolean;
}

export type TranscriptViewportAction =
	| { type: "sync"; contentHeight: number; viewportHeight: number; contentChanged?: boolean; resized?: boolean }
	| { type: "pageUp" }
	| { type: "pageDown" }
	| { type: "wheel"; direction: "up" | "down" }
	| { type: "end" }
	| { type: "reset" };

function normalizeDimension(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

export function createTranscriptViewportState(): TranscriptViewportState {
	return {
		followLatest: true,
		scrollTop: 0,
		contentHeight: 0,
		viewportHeight: 0,
		unseenUpdates: 0,
		transcriptRevision: 0,
	};
}

export function getTranscriptViewportMetrics(state: TranscriptViewportState): TranscriptViewportMetrics {
	const viewportHeight = normalizeDimension(state.viewportHeight);
	const indicatorVisible = !state.followLatest && state.unseenUpdates > 0;
	const contentViewportHeight = Math.max(0, viewportHeight - (indicatorVisible ? 1 : 0));
	const maxScrollTop = Math.max(0, normalizeDimension(state.contentHeight) - contentViewportHeight);
	const scrollTop = clamp(normalizeDimension(state.scrollTop), 0, maxScrollTop);

	return {
		contentViewportHeight,
		maxScrollTop,
		scrollTop,
		indicatorVisible,
		unseenUpdates: Math.max(0, state.unseenUpdates),
		followLatest: state.followLatest,
	};
}

function alignScrollPosition(state: TranscriptViewportState): TranscriptViewportState {
	const metrics = getTranscriptViewportMetrics(state);
	return {
		...state,
		scrollTop: state.followLatest ? metrics.maxScrollTop : metrics.scrollTop,
	};
}

function moveUp(state: TranscriptViewportState, amount: number): TranscriptViewportState {
	const metrics = getTranscriptViewportMetrics(state);
	if (metrics.maxScrollTop === 0) return state;

	const nextScrollTop = Math.max(0, metrics.scrollTop - Math.max(1, amount));
	if (nextScrollTop === metrics.scrollTop) return state;

	return {
		...state,
		followLatest: false,
		scrollTop: nextScrollTop,
	};
}

function moveDown(state: TranscriptViewportState, amount: number): TranscriptViewportState {
	const metrics = getTranscriptViewportMetrics(state);
	const nextScrollTop = Math.min(metrics.maxScrollTop, metrics.scrollTop + Math.max(1, amount));
	if (nextScrollTop >= metrics.maxScrollTop) {
		return alignScrollPosition({
			...state,
			followLatest: true,
			unseenUpdates: 0,
			scrollTop: nextScrollTop,
		});
	}
	if (nextScrollTop === metrics.scrollTop) return state;

	return {
		...state,
		followLatest: false,
		scrollTop: nextScrollTop,
	};
}

export function reduceTranscriptViewportState(
	state: TranscriptViewportState,
	action: TranscriptViewportAction,
): TranscriptViewportState {
	switch (action.type) {
		case "reset":
			return createTranscriptViewportState();
		case "sync": {
			const contentHeight = normalizeDimension(action.contentHeight);
			const viewportHeight = normalizeDimension(action.viewportHeight);
			const contentChanged = action.contentChanged === true;
			const next: TranscriptViewportState = {
				...state,
				contentHeight,
				viewportHeight,
				transcriptRevision: state.transcriptRevision + (contentChanged ? 1 : 0),
				unseenUpdates:
					!state.followLatest && contentChanged && !action.resized ? state.unseenUpdates + 1 : state.unseenUpdates,
			};
			return alignScrollPosition(next);
		}
		case "pageUp":
			return moveUp(state, Math.max(1, state.viewportHeight - TRANSCRIPT_PAGE_OVERLAP));
		case "pageDown":
			return moveDown(state, Math.max(1, state.viewportHeight - TRANSCRIPT_PAGE_OVERLAP));
		case "wheel":
			return action.direction === "up"
				? moveUp(state, TRANSCRIPT_WHEEL_STEP)
				: moveDown(state, TRANSCRIPT_WHEEL_STEP);
		case "end":
			return alignScrollPosition({
				...state,
				followLatest: true,
				unseenUpdates: 0,
			});
	}
}
