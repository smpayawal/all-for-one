import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { buildSessionContext, type CompactionEntry, type SessionEntry } from "../session-manager.ts";
import { resolveEvidenceReferences } from "./evidence.ts";
import { type EvidenceReference, normalizeEvidenceReferences } from "./retention.ts";
import type { CompactionTelemetrySnapshot } from "./telemetry.ts";

export interface CompactionHealthLatest {
	timestamp: string;
	tokensBefore: number;
	tokensAfter: number;
	reductionPercent: number;
	summaryChars: number;
	summaryTokens: number;
	retainedUserMessageCount: number;
	evidenceReferenceCount: number;
	availableEvidenceReferenceCount?: number;
	missingEvidenceReferenceCount?: number;
	nonLocalEvidenceReferenceCount?: number;
}

export interface CompactionHealth {
	count: number;
	latest?: CompactionHealthLatest;
	telemetry: CompactionTelemetrySnapshot;
}

function detailArrayLength(details: unknown, key: string): number {
	if (!details || typeof details !== "object") return 0;
	const value = (details as Record<string, unknown>)[key];
	return Array.isArray(value) ? value.length : 0;
}

function getEvidenceReferences(details: unknown): EvidenceReference[] {
	if (!details || typeof details !== "object") return [];
	const references = (details as Record<string, unknown>).evidenceRefs;
	return Array.isArray(references) ? normalizeEvidenceReferences(references).references : [];
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
	cwd?: string,
	telemetry: CompactionTelemetrySnapshot = {
		compactionCount: 0,
		structuralValidationFailureCount: 0,
		repairAttemptCount: 0,
		repairSuccessCount: 0,
		repairFailureCount: 0,
		totalDurationMs: 0,
		lastDurationMs: 0,
		estimatedTokensBefore: 0,
		estimatedTokensAfter: 0,
		limitations: [],
	},
): CompactionHealth {
	const compactions = entries.filter((entry): entry is CompactionEntry => entry.type === "compaction");
	const latest = compactions[compactions.length - 1];
	if (!latest) return { count: 0, telemetry };

	const tokensAfter = estimateContextTokens(buildSessionContext(entries, latest.id).messages);
	const reductionPercent =
		latest.tokensBefore === 0
			? 0
			: Number((((latest.tokensBefore - tokensAfter) / latest.tokensBefore) * 100).toFixed(1));

	const evidenceReferences = getEvidenceReferences(latest.details);
	const evidenceResolution = cwd ? resolveEvidenceReferences(evidenceReferences, cwd) : undefined;

	return {
		count: compactions.length,
		telemetry,
		latest: {
			timestamp: latest.timestamp,
			tokensBefore: latest.tokensBefore,
			tokensAfter,
			reductionPercent,
			summaryChars: latest.summary.length,
			summaryTokens: Math.ceil(latest.summary.length / 4),
			retainedUserMessageCount: detailArrayLength(latest.details, "retainedUserEntryIds"),
			evidenceReferenceCount: evidenceReferences.length,
			...(evidenceResolution
				? {
						availableEvidenceReferenceCount: evidenceResolution.filter((item) => item.status === "available")
							.length,
						missingEvidenceReferenceCount: evidenceResolution.filter((item) => item.status === "missing").length,
						nonLocalEvidenceReferenceCount: evidenceResolution.filter((item) => item.status === "non-local")
							.length,
					}
				: {}),
		},
	};
}
