import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { CustomEntry, SessionEntry } from "../../core/session-manager.ts";

export type TranscriptTurnRole = "user" | "assistant";

export interface TranscriptMessageItem {
	kind: "message";
	key: string;
	message: AgentMessage;
	parentId: string | null;
}

export interface TranscriptCustomEntryItem {
	kind: "custom-entry";
	key: string;
	entry: CustomEntry;
}

export type TranscriptRenderItem = TranscriptMessageItem | TranscriptCustomEntryItem;

export interface TranscriptTurnGroup {
	kind: "turn";
	key: string;
	role: TranscriptTurnRole;
	items: TranscriptMessageItem[];
}

export interface TranscriptInformationalGroup {
	kind: "informational";
	key: string;
	items: TranscriptRenderItem[];
}

export type TranscriptGroup = TranscriptTurnGroup | TranscriptInformationalGroup;

type ConversationRole = TranscriptTurnRole | "toolResult";

function getConversationRole(message: AgentMessage): ConversationRole | undefined {
	if (message.role === "user" || message.role === "assistant" || message.role === "toolResult") {
		return message.role;
	}
	return undefined;
}

function getTurnRole(role: ConversationRole): TranscriptTurnRole {
	return role === "user" ? "user" : "assistant";
}

function getTurnKey(item: TranscriptMessageItem, sequence: number): string {
	return item.key || `turn-${sequence}`;
}

function addInformationalItem(groups: TranscriptGroup[], item: TranscriptRenderItem): void {
	const last = groups.at(-1);
	if (last?.kind === "informational") {
		last.items.push(item);
		return;
	}
	groups.push({ kind: "informational", key: item.key, items: [item] });
}

/**
 * Groups the existing ordered transcript items for presentation only.
 *
 * A user message starts a new user group. Assistant messages and their
 * immediately adjacent tool-result messages stay in the same assistant group,
 * which also keeps assistant continuation messages under one header. Entries
 * without a conversation role remain informational. When a malformed sequence
 * breaks adjacency, a new assistant group is used so content order is retained
 * instead of moving an item back into an earlier group.
 */
export function buildTranscriptGroups(items: readonly TranscriptRenderItem[]): TranscriptGroup[] {
	const groups: TranscriptGroup[] = [];
	let currentTurn: TranscriptTurnGroup | undefined;
	let previousWasConversation = false;
	let turnSequence = 0;

	for (const item of items) {
		if (item.kind === "custom-entry") {
			addInformationalItem(groups, item);
			currentTurn = undefined;
			previousWasConversation = false;
			continue;
		}

		const role = getConversationRole(item.message);
		if (!role) {
			addInformationalItem(groups, item);
			currentTurn = undefined;
			previousWasConversation = false;
			continue;
		}

		const canContinueAssistantTurn =
			role !== "user" && currentTurn?.role === "assistant" && previousWasConversation === true;
		if (role === "user" || !canContinueAssistantTurn) {
			currentTurn = {
				kind: "turn",
				key: getTurnKey(item, turnSequence),
				role: getTurnRole(role),
				items: [],
			};
			turnSequence += 1;
			groups.push(currentTurn);
		}

		const activeTurn = currentTurn;
		if (!activeTurn) continue;
		activeTurn.items.push(item);
		previousWasConversation = true;
	}

	return groups;
}

/** Build a message item while preserving the session entry's stable identity. */
export function createTranscriptMessageItem(
	entry: SessionEntry,
	message: AgentMessage,
	messageIndex = 0,
): TranscriptMessageItem {
	return {
		kind: "message",
		key: `${entry.id}:${messageIndex}`,
		message,
		parentId: entry.parentId,
	};
}
