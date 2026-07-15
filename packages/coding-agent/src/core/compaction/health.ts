import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { buildSessionContext, type CompactionEntry, type SessionEntry } from "../session-manager.ts";

export interface CompactionHealthLatest {
	timestamp: string;
	tokensBefore: number;
	tokensAfter: number;
	reductionPercent: number;
	summaryChars: number;
	summaryTokens: number;
	retainedUserMessageCount: number;
	evidenceReferenceCount: number;
}

export interface CompactionHealth {
	count: number;
	latest?: CompactionHealthLatest;
}

function detailArrayLength(details: unknown, key: string): number {
	if (!details || typeof details !== "object") return 0;
	const value = (details as Record<string, unknown>)[key];
	return Array.isArray(value) ? value.length : 0;
}

/**
 * Calculate local compaction health from one session path.
 *
 * The estimator is injected so this module stays independent of provider
 * tokenization and remains straightforward to test.
 */
export function collectCompactionHealth(
	entries: SessionEntry[],
	estimateContextTokens: (messages: AgentMessage[]) => number,
): CompactionHealth {
	const compactions = entries.filter((entry): entry is CompactionEntry => entry.type === "compaction");
	const latest = compactions[compactions.length - 1];
	if (!latest) return { count: 0 };

	const tokensAfter = estimateContextTokens(buildSessionContext(entries, latest.id).messages);
	const reductionPercent =
		latest.tokensBefore === 0
			? 0
			: Number((((latest.tokensBefore - tokensAfter) / latest.tokensBefore) * 100).toFixed(1));

	return {
		count: compactions.length,
		latest: {
			timestamp: latest.timestamp,
			tokensBefore: latest.tokensBefore,
			tokensAfter,
			reductionPercent,
			summaryChars: latest.summary.length,
			summaryTokens: Math.ceil(latest.summary.length / 4),
			retainedUserMessageCount: detailArrayLength(latest.details, "retainedUserEntryIds"),
			evidenceReferenceCount: detailArrayLength(latest.details, "evidenceRefs"),
		},
	};
}
