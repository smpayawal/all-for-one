import type { AssistantMessage } from "@earendil-works/pi-ai";

export type AssistantContentBlock = AssistantMessage["content"][number];
export type AssistantTextBlock = Exclude<AssistantContentBlock, { type: "toolCall" }>;
export type AssistantToolCall = Extract<AssistantContentBlock, { type: "toolCall" }>;

export type AssistantTurnSegment =
	| { kind: "assistant"; content: AssistantTextBlock[] }
	| { kind: "tools"; calls: AssistantToolCall[] };

/**
 * Split one assistant message at actual tool-call boundaries.
 *
 * The split is presentation-only. Tool-call blocks remain owned by the
 * original assistant message and are never rewritten for the runtime.
 */
export function splitAssistantMessageContent(message: AssistantMessage): AssistantTurnSegment[] {
	const segments: AssistantTurnSegment[] = [];
	let assistantContent: AssistantTextBlock[] = [];
	let toolCalls: AssistantToolCall[] = [];

	const flushAssistantContent = (): void => {
		if (assistantContent.length > 0) {
			segments.push({ kind: "assistant", content: assistantContent });
			assistantContent = [];
		}
	};

	const flushToolCalls = (): void => {
		if (toolCalls.length > 0) {
			segments.push({ kind: "tools", calls: toolCalls });
			toolCalls = [];
		}
	};

	const content = Array.isArray(message.content) ? message.content : [];
	for (const block of content) {
		if (block.type === "toolCall") {
			flushAssistantContent();
			toolCalls.push(block);
		} else {
			flushToolCalls();
			assistantContent.push(block);
		}
	}

	flushAssistantContent();
	flushToolCalls();

	// Keep an empty assistant segment for malformed or empty messages so the
	// caller can still render assistant-level terminal errors.
	return segments.length > 0 ? segments : [{ kind: "assistant", content: [] }];
}

/** Stable presentation identity for a tool sequence inside one assistant turn. */
export function getExecutionGroupKey(turnKey: string, toolCallIds: readonly string[], sequence = 0): string {
	const first = toolCallIds.find((id) => id.length > 0) ?? `segment-${sequence}`;
	const last = [...toolCallIds].reverse().find((id) => id.length > 0) ?? `segment-${sequence}`;
	return `${turnKey}:execution:${first}:${last}`;
}
