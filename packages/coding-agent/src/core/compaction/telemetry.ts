export interface CompactionProviderUsage {
	inputTokens?: number;
	outputTokens?: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	totalTokens?: number;
}

export interface CompactionProviderMetrics {
	usage?: CompactionProviderUsage;
	cost?: number;
}

export interface CompactionTelemetrySnapshot {
	compactionCount: number;
	structuralValidationFailureCount: number;
	repairAttemptCount: number;
	repairSuccessCount: number;
	repairFailureCount: number;
	totalDurationMs: number;
	lastDurationMs: number;
	estimatedTokensBefore: number;
	estimatedTokensAfter: number;
	providerUsage?: CompactionProviderUsage;
	providerCost?: number;
	limitations: string[];
}

export interface CompactionTelemetryRecorder {
	recordStructuralValidationFailure(): void;
	recordRepairAttempt(): void;
	recordRepairSuccess(): void;
	recordRepairFailure(): void;
}

export interface CompactionTelemetryCompletion {
	durationMs: number;
	estimatedTokensAfter?: number;
	providerMetrics?: CompactionProviderMetrics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonNegativeNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readUsageValue(candidate: Record<string, unknown>, ...keys: string[]): number | undefined {
	for (const key of keys) {
		const value = readNonNegativeNumber(candidate[key]);
		if (value !== undefined) return value;
	}
	return undefined;
}

/** Extract optional provider metrics from extension-owned details without trusting arbitrary values. */
export function getCompactionProviderMetrics(details: unknown): CompactionProviderMetrics | undefined {
	if (!isRecord(details)) return undefined;
	const usageCandidate = isRecord(details.providerUsage)
		? details.providerUsage
		: isRecord(details.usage)
			? details.usage
			: undefined;
	if (!usageCandidate) {
		const cost = readNonNegativeNumber(details.providerCost) ?? readNonNegativeNumber(details.cost);
		return cost === undefined ? undefined : { cost };
	}

	const inputTokens = readUsageValue(usageCandidate, "inputTokens", "input");
	const outputTokens = readUsageValue(usageCandidate, "outputTokens", "output");
	const cacheReadTokens = readUsageValue(usageCandidate, "cacheReadTokens", "cacheRead");
	const cacheWriteTokens = readUsageValue(usageCandidate, "cacheWriteTokens", "cacheWrite");
	const totalTokens = readUsageValue(usageCandidate, "totalTokens", "total");
	const usage: CompactionProviderUsage = {
		...(inputTokens === undefined ? {} : { inputTokens }),
		...(outputTokens === undefined ? {} : { outputTokens }),
		...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
		...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
		...(totalTokens === undefined ? {} : { totalTokens }),
	};
	const cost = readNonNegativeNumber(details.providerCost) ?? readNonNegativeNumber(details.cost);
	if (Object.keys(usage).length === 0) return cost === undefined ? undefined : { cost };
	return { usage, ...(cost === undefined ? {} : { cost }) };
}

/** In-memory, session-scoped compaction measurements. Nothing is persisted by this store. */
export class CompactionTelemetryStore implements CompactionTelemetryRecorder {
	private compactionCount = 0;
	private structuralValidationFailureCount = 0;
	private repairAttemptCount = 0;
	private repairSuccessCount = 0;
	private repairFailureCount = 0;
	private totalDurationMs = 0;
	private lastDurationMs = 0;
	private estimatedTokensBefore = 0;
	private estimatedTokensAfter = 0;
	private providerUsage: CompactionProviderUsage | undefined;
	private providerCost: number | undefined;
	private readonly limitations = new Set<string>([
		"Native compaction does not expose provider token usage to this diagnostic boundary.",
		"Native compaction does not expose provider cost to this diagnostic boundary.",
	]);

	start(estimatedTokensBefore: number): void {
		this.compactionCount += 1;
		if (Number.isFinite(estimatedTokensBefore) && estimatedTokensBefore >= 0) {
			this.estimatedTokensBefore += estimatedTokensBefore;
		}
	}

	recordStructuralValidationFailure(): void {
		this.structuralValidationFailureCount += 1;
	}

	recordRepairAttempt(): void {
		this.repairAttemptCount += 1;
	}

	recordRepairSuccess(): void {
		this.repairSuccessCount += 1;
	}

	recordRepairFailure(): void {
		this.repairFailureCount += 1;
	}

	complete(completion: CompactionTelemetryCompletion): void {
		const durationMs =
			Number.isFinite(completion.durationMs) && completion.durationMs >= 0 ? completion.durationMs : 0;
		this.totalDurationMs += durationMs;
		this.lastDurationMs = durationMs;
		if (completion.estimatedTokensAfter !== undefined && Number.isFinite(completion.estimatedTokensAfter)) {
			this.estimatedTokensAfter += Math.max(0, completion.estimatedTokensAfter);
		}
		const providerMetrics = completion.providerMetrics;
		if (providerMetrics?.usage) {
			this.providerUsage = { ...this.providerUsage, ...providerMetrics.usage };
			this.limitations.delete("Native compaction does not expose provider token usage to this diagnostic boundary.");
		}
		if (providerMetrics?.cost !== undefined) {
			this.providerCost = (this.providerCost ?? 0) + providerMetrics.cost;
			this.limitations.delete("Native compaction does not expose provider cost to this diagnostic boundary.");
		}
	}

	fail(durationMs: number): void {
		this.complete({ durationMs });
	}

	getSnapshot(): CompactionTelemetrySnapshot {
		return {
			compactionCount: this.compactionCount,
			structuralValidationFailureCount: this.structuralValidationFailureCount,
			repairAttemptCount: this.repairAttemptCount,
			repairSuccessCount: this.repairSuccessCount,
			repairFailureCount: this.repairFailureCount,
			totalDurationMs: this.totalDurationMs,
			lastDurationMs: this.lastDurationMs,
			estimatedTokensBefore: this.estimatedTokensBefore,
			estimatedTokensAfter: this.estimatedTokensAfter,
			...(this.providerUsage ? { providerUsage: { ...this.providerUsage } } : {}),
			...(this.providerCost === undefined ? {} : { providerCost: this.providerCost }),
			limitations: [...this.limitations],
		};
	}
}
