import { describe, expect, test } from "vitest";
import type { SessionEntry } from "../src/core/session-manager.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

type InitialMessagesContext = {
	transcriptViewport: {
		markContentReplaced: () => void;
	};
	sessionManager: {
		buildContextEntries: () => SessionEntry[];
		getEntries: () => SessionEntry[];
	};
	renderSessionEntries: (
		entries: SessionEntry[],
		options: { updateFooter: boolean; populateHistory: boolean },
	) => void;
	renderProjectTrustWarningIfNeeded: () => void;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as {
	renderInitialMessages(this: InitialMessagesContext): void;
};

describe("InteractiveMode initial transcript rendering", () => {
	test("invalidates a pre-history frame before restoring session entries", () => {
		let replacementCount = 0;
		const context: InitialMessagesContext = {
			transcriptViewport: {
				markContentReplaced: () => {
					replacementCount += 1;
				},
			},
			sessionManager: {
				buildContextEntries: () => [],
				getEntries: () => [],
			},
			renderSessionEntries: () => undefined,
			renderProjectTrustWarningIfNeeded: () => undefined,
		};

		interactiveModePrototype.renderInitialMessages.call(context);

		expect(replacementCount).toBe(1);
	});
});
