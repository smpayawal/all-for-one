import { describe, expect, test } from "vitest";
import {
	createTranscriptViewportState,
	getTranscriptViewportMetrics,
	reduceTranscriptViewportState,
} from "../src/modes/interactive/transcript-viewport-state.ts";

describe("transcript viewport state", () => {
	test("starts following the latest output", () => {
		const state = createTranscriptViewportState();

		expect(state.followLatest).toBe(true);
		expect(state.scrollTop).toBe(0);
		expect(getTranscriptViewportMetrics(state)).toMatchObject({
			contentViewportHeight: 0,
			maxScrollTop: 0,
			scrollTop: 0,
			indicatorVisible: false,
		});
	});

	test("keeps the latest rows visible and pages upward with overlap", () => {
		let state = reduceTranscriptViewportState(createTranscriptViewportState(), {
			type: "sync",
			contentHeight: 30,
			viewportHeight: 6,
		});

		expect(getTranscriptViewportMetrics(state).scrollTop).toBe(24);

		state = reduceTranscriptViewportState(state, { type: "pageUp" });
		expect(state.followLatest).toBe(false);
		expect(state.scrollTop).toBe(20);

		state = reduceTranscriptViewportState(state, { type: "pageDown" });
		expect(state.followLatest).toBe(true);
		expect(state.scrollTop).toBe(24);
	});

	test("detaches on upward wheel and returns to latest at the bottom", () => {
		let state = reduceTranscriptViewportState(createTranscriptViewportState(), {
			type: "sync",
			contentHeight: 20,
			viewportHeight: 5,
		});

		state = reduceTranscriptViewportState(state, { type: "wheel", direction: "up" });
		expect(state.followLatest).toBe(false);
		expect(state.scrollTop).toBe(12);

		state = reduceTranscriptViewportState(state, { type: "wheel", direction: "down" });
		expect(state.followLatest).toBe(true);
		expect(state.scrollTop).toBe(15);
	});

	test("preserves a detached position and counts content updates", () => {
		let state = reduceTranscriptViewportState(createTranscriptViewportState(), {
			type: "sync",
			contentHeight: 40,
			viewportHeight: 6,
		});
		state = reduceTranscriptViewportState(state, { type: "pageUp" });

		state = reduceTranscriptViewportState(state, {
			type: "sync",
			contentHeight: 45,
			viewportHeight: 6,
			contentChanged: true,
		});

		expect(state.followLatest).toBe(false);
		expect(state.scrollTop).toBe(30);
		expect(state.unseenUpdates).toBe(1);
		expect(getTranscriptViewportMetrics(state)).toMatchObject({
			contentViewportHeight: 5,
			indicatorVisible: true,
			maxScrollTop: 40,
		});

		state = reduceTranscriptViewportState(state, { type: "end" });
		expect(state.followLatest).toBe(true);
		expect(state.unseenUpdates).toBe(0);
		expect(state.scrollTop).toBe(39);
	});

	test("does not count resize as unseen output and clamps after shrink", () => {
		let state = reduceTranscriptViewportState(createTranscriptViewportState(), {
			type: "sync",
			contentHeight: 50,
			viewportHeight: 6,
		});
		state = reduceTranscriptViewportState(state, { type: "pageUp" });
		state = reduceTranscriptViewportState(state, {
			type: "sync",
			contentHeight: 80,
			viewportHeight: 4,
			contentChanged: true,
			resized: true,
		});

		expect(state.unseenUpdates).toBe(0);
		expect(state.scrollTop).toBe(40);

		state = reduceTranscriptViewportState(state, {
			type: "sync",
			contentHeight: 2,
			viewportHeight: 10,
			resized: true,
		});
		expect(state.scrollTop).toBe(0);
		expect(getTranscriptViewportMetrics(state).maxScrollTop).toBe(0);
	});

	test("reset returns to latest and handles empty or short content", () => {
		let state = reduceTranscriptViewportState(createTranscriptViewportState(), {
			type: "sync",
			contentHeight: 20,
			viewportHeight: 5,
		});
		state = reduceTranscriptViewportState(state, { type: "pageUp" });
		state = reduceTranscriptViewportState(state, {
			type: "sync",
			contentHeight: 21,
			viewportHeight: 5,
			contentChanged: true,
		});

		state = reduceTranscriptViewportState(state, { type: "reset" });
		state = reduceTranscriptViewportState(state, {
			type: "sync",
			contentHeight: 2,
			viewportHeight: 5,
		});

		expect(state.followLatest).toBe(true);
		expect(state.scrollTop).toBe(0);
		expect(state.unseenUpdates).toBe(0);
		expect(getTranscriptViewportMetrics(state).maxScrollTop).toBe(0);
	});
});
