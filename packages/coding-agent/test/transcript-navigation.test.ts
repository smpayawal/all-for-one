import { describe, expect, test } from "vitest";
import {
	canHandleTranscriptNavigation,
	getTranscriptNavigationAction,
} from "../src/modes/interactive/transcript-navigation.ts";

describe("transcript navigation input", () => {
	const matches = (data: string, keybinding: string): boolean =>
		(data === "page-up" && keybinding === "tui.editor.pageUp") ||
		(data === "page-down" && keybinding === "tui.editor.pageDown") ||
		(data === "end" && keybinding === "tui.editor.cursorLineEnd");

	test("maps configurable page and end bindings to one navigation path", () => {
		expect(getTranscriptNavigationAction("page-up", matches)).toBe("pageUp");
		expect(getTranscriptNavigationAction("page-down", matches)).toBe("pageDown");
		expect(getTranscriptNavigationAction("end", matches)).toBe("end");
		expect(getTranscriptNavigationAction("other", matches)).toBeUndefined();
	});

	test.each([
		["modal overlay", { overlayHasInput: true }],
		["selector focus", { editorContainerHasFocus: false }],
		["custom editor", { defaultEditorFocused: false }],
		["autocomplete", { autocompleteVisible: true }],
		["editor text", { editorHasText: true }],
		["bash mode", { bashMode: true }],
		["running bash", { bashRunning: true }],
	])("does not steal input from %s", (_name, override) => {
		const context = {
			overlayHasInput: false,
			defaultEditorFocused: true,
			editorContainerHasFocus: true,
			autocompleteVisible: false,
			editorHasText: false,
			bashMode: false,
			bashRunning: false,
			...override,
		};

		expect(canHandleTranscriptNavigation(context)).toBe(false);
	});

	test("allows navigation only in the empty normal editor context", () => {
		expect(
			canHandleTranscriptNavigation({
				overlayHasInput: false,
				defaultEditorFocused: true,
				editorContainerHasFocus: true,
				autocompleteVisible: false,
				editorHasText: false,
				bashMode: false,
				bashRunning: false,
			}),
		).toBe(true);
	});
});
