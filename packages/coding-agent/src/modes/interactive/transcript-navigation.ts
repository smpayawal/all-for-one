export type TranscriptNavigationAction = "pageUp" | "pageDown" | "end";

type TranscriptNavigationKeybinding = "tui.editor.pageUp" | "tui.editor.pageDown" | "tui.editor.cursorLineEnd";

export interface TranscriptNavigationContext {
	overlayHasInput: boolean;
	defaultEditorFocused: boolean;
	editorContainerHasFocus: boolean;
	autocompleteVisible: boolean;
	editorHasText: boolean;
	bashMode: boolean;
	bashRunning: boolean;
}

export function canHandleTranscriptNavigation(context: TranscriptNavigationContext): boolean {
	return (
		!context.overlayHasInput &&
		context.defaultEditorFocused &&
		context.editorContainerHasFocus &&
		!context.autocompleteVisible &&
		!context.editorHasText &&
		!context.bashMode &&
		!context.bashRunning
	);
}

export function getTranscriptNavigationAction(
	data: string,
	matches: (data: string, keybinding: TranscriptNavigationKeybinding) => boolean,
): TranscriptNavigationAction | undefined {
	if (matches(data, "tui.editor.pageUp")) return "pageUp";
	if (matches(data, "tui.editor.pageDown")) return "pageDown";
	if (matches(data, "tui.editor.cursorLineEnd")) return "end";
	return undefined;
}
