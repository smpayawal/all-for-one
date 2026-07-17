import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { estimateTextTokens } from "../packages/ai/src/utils/estimate.ts";
import { resolveEvidenceReferences } from "../packages/coding-agent/src/core/compaction/evidence.ts";
import {
	normalizeEvidenceReferences,
	type EvidenceReference,
} from "../packages/coding-agent/src/core/compaction/retention.ts";

export const CONTEXT_EVALUATION_SCHEMA_VERSION = 3 as const;
export const CONTEXT_EVALUATION_TYPE = "context-integrity" as const;
const LEGACY_CONTEXT_EVALUATION_SCHEMA_VERSION = 2;
const LEGACY_CONTEXT_EVALUATION_PHASE = "context-live-evaluation";

export type ContextEvaluationVariant = "baseline" | "context";
export type ContextEvaluationOutcome = "pass" | "fail" | "unknown";
export type ContextEvaluationDecision = "pass" | "blocked" | "inconclusive";
export type ContextTreatmentValue = string | number | boolean | null;
export type ContextTreatmentConfig = Record<string, ContextTreatmentValue>;

export interface ContextEvaluationMetrics {
	outcome: ContextEvaluationOutcome;
	tokensBefore: number[];
	tokensAfter: number[];
	summaryTokens: number;
	compactionLatencyMs: number | null;
	compactionCost: number | null;
	criticalConstraintFailures: number;
	staleDecisionCount: number;
	rediscoveryCount: number;
	turns: number;
	toolCalls: number;
	peakPromptTokens: number;
	cumulativeTokens: number;
	compactionCount: number;
	truncationCount: number;
	followUpRetrievals: number;
	repeatedReads: number;
	wallClockSessionSpanMs: number | null;
	estimatedCost: number | null;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	evidenceReferencesResolved: number;
	evidenceReferencesMissing: number;
}

export interface ContextEvaluationRun {
	workloadId: string;
	providerModel: string;
	contextWindow: number;
	taskInputHash: string;
	initialContextHash: string;
	controlledConfigHash: string;
	treatmentConfig?: ContextTreatmentConfig;
	metrics: ContextEvaluationMetrics;
	limitations?: string[];
}

export interface ContextEvaluationInput {
	schemaVersion: typeof CONTEXT_EVALUATION_SCHEMA_VERSION;
	evaluationType: typeof CONTEXT_EVALUATION_TYPE;
	variant: ContextEvaluationVariant;
	runs: ContextEvaluationRun[];
}

export interface ContextEvaluationDeltas {
	lastTokensBefore: number | null;
	lastTokensAfter: number | null;
	summaryTokens: number;
	compactionLatencyMs: number | null;
	compactionCost: number | null;
	turns: number;
	toolCalls: number;
	peakPromptTokens: number;
	cumulativeTokens: number;
	compactionCount: number;
	truncationCount: number;
	followUpRetrievals: number;
	repeatedReads: number;
	wallClockSessionSpanMs: number | null;
	estimatedCost: number | null;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	evidenceReferencesResolved: number;
	evidenceReferencesMissing: number;
}

export interface ContextEvaluationPair {
	workloadId: string;
	baseline: ContextEvaluationRun;
	context: ContextEvaluationRun;
	correctnessRegression: boolean;
	criticalConstraintRegression: boolean;
	staleDecisionRegression: boolean;
	status: ContextEvaluationDecision;
	deltas: ContextEvaluationDeltas;
	limitations: string[];
}

export interface ContextEvaluationReport {
	schemaVersion: typeof CONTEXT_EVALUATION_SCHEMA_VERSION;
	evaluationType: typeof CONTEXT_EVALUATION_TYPE;
	baselineVariant: "baseline";
	contextVariant: "context";
	pairs: ContextEvaluationPair[];
	decision: ContextEvaluationDecision;
	efficiencyClaim: "not-established";
	limitations: string[];
}

export interface ContextSessionRunAnnotations {
	outcome?: ContextEvaluationOutcome;
	criticalConstraintFailures?: number;
	staleDecisionCount?: number;
	rediscoveryCount?: number;
	truncationCount?: number;
	followUpRetrievals?: number;
	repeatedReads?: number;
}

export interface ContextSessionRunMetadata {
	workloadId: string;
	contextWindow: number;
	taskInputHash: string;
	initialContextHash: string;
	controlledConfigHash: string;
	treatmentConfig?: ContextTreatmentConfig;
	providerModel?: string;
	cwd?: string;
	annotations?: ContextSessionRunAnnotations;
}

interface RecordValue {
	[key: string]: unknown;
}

const INTEGER_METRIC_KEYS = [
	"summaryTokens",
	"criticalConstraintFailures",
	"staleDecisionCount",
	"rediscoveryCount",
	"turns",
	"toolCalls",
	"peakPromptTokens",
	"cumulativeTokens",
	"compactionCount",
	"truncationCount",
	"followUpRetrievals",
	"repeatedReads",
	"cacheReadTokens",
	"cacheWriteTokens",
	"evidenceReferencesResolved",
	"evidenceReferencesMissing",
] as const satisfies ReadonlyArray<keyof Omit<ContextEvaluationMetrics, "outcome" | "compactionLatencyMs" | "compactionCost" | "wallClockSessionSpanMs" | "estimatedCost">>;

const DELTA_KEYS = [
	"turns",
	"toolCalls",
	"peakPromptTokens",
	"cumulativeTokens",
	"compactionCount",
	"truncationCount",
	"followUpRetrievals",
	"repeatedReads",
	"cacheReadTokens",
	"cacheWriteTokens",
	"evidenceReferencesResolved",
	"evidenceReferencesMissing",
] as const satisfies ReadonlyArray<keyof Omit<ContextEvaluationDeltas, "compactionLatencyMs" | "compactionCost" | "wallClockSessionSpanMs" | "estimatedCost">>;

function isRecord(value: unknown): value is RecordValue {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: RecordValue, key: string, path: string): string {
	const field = value[key];
	if (typeof field !== "string" || field.trim().length === 0) {
		throw new Error(`${path}.${key} must be a non-empty string`);
	}
	return field;
}

function requiredNonNegativeNumber(value: RecordValue, key: string, path: string): number {
	const field = value[key];
	if (typeof field !== "number" || !Number.isFinite(field) || field < 0) {
		throw new Error(`${path}.${key} must be a finite non-negative number`);
	}
	return field;
}

function requiredNonNegativeInteger(value: RecordValue, key: string, path: string): number {
	const field = requiredNonNegativeNumber(value, key, path);
	if (!Number.isInteger(field)) throw new Error(`${path}.${key} must be a non-negative integer`);
	return field;
}

function requiredPositiveInteger(value: RecordValue, key: string, path: string): number {
	const field = requiredNonNegativeInteger(value, key, path);
	if (field <= 0) throw new Error(`${path}.${key} must be a positive integer`);
	return field;
}

function nullableNonNegativeNumber(value: RecordValue, key: string, path: string): number | null {
	const field = value[key];
	if (field === null) return null;
	return requiredNonNegativeNumber(value, key, path);
}

function nonNegativeNumberArray(value: RecordValue, key: string, path: string): number[] {
	const field = value[key];
	if (!Array.isArray(field)) throw new Error(`${path}.${key} must be an array`);
	return field.map((item, index) => {
		if (typeof item !== "number" || !Number.isFinite(item) || item < 0) {
			throw new Error(`${path}.${key}[${index}] must be a finite non-negative number`);
		}
		return item;
	});
}

function nonNegativeIntegerArray(value: RecordValue, key: string, path: string): number[] {
	const values = nonNegativeNumberArray(value, key, path);
	for (const [index, item] of values.entries()) {
		if (!Number.isInteger(item)) throw new Error(`${path}.${key}[${index}] must be a non-negative integer`);
	}
	return values;
}

function optionalLimitations(value: RecordValue, path: string): string[] | undefined {
	const field = value.limitations;
	if (field === undefined) return undefined;
	if (!Array.isArray(field) || field.some((item) => typeof item !== "string" || item.trim().length === 0)) {
		throw new Error(`${path}.limitations must be an array of non-empty strings`);
	}
	return field;
}

function optionalTreatmentConfig(value: RecordValue, path: string): ContextTreatmentConfig | undefined {
	const field = value.treatmentConfig;
	if (field === undefined) return undefined;
	if (!isRecord(field)) throw new Error(`${path}.treatmentConfig must be an object`);
	const treatment: ContextTreatmentConfig = {};
	for (const [key, candidate] of Object.entries(field)) {
		if (
			typeof candidate !== "string" &&
			typeof candidate !== "number" &&
			typeof candidate !== "boolean" &&
			candidate !== null
		) {
			throw new Error(`${path}.treatmentConfig.${key} must be a string, number, boolean, or null`);
		}
		if (typeof candidate === "number" && !Number.isFinite(candidate)) {
			throw new Error(`${path}.treatmentConfig.${key} must be finite`);
		}
		treatment[key] = candidate;
	}
	return treatment;
}

function parseMetrics(value: unknown, path: string): ContextEvaluationMetrics {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);

	const outcome = value.outcome;
	if (outcome !== "pass" && outcome !== "fail" && outcome !== "unknown") {
		throw new Error(`${path}.outcome must be pass, fail, or unknown`);
	}
	const tokensBefore = nonNegativeIntegerArray(value, "tokensBefore", path);
	const tokensAfter = nonNegativeIntegerArray(value, "tokensAfter", path);
	if (tokensBefore.length !== tokensAfter.length) {
		throw new Error(`${path}.tokensBefore and ${path}.tokensAfter must have the same length`);
	}

	const metrics = {
		outcome,
		tokensBefore,
		tokensAfter,
		summaryTokens: requiredNonNegativeNumber(value, "summaryTokens", path),
		compactionLatencyMs: nullableNonNegativeNumber(value, "compactionLatencyMs", path),
		compactionCost: nullableNonNegativeNumber(value, "compactionCost", path),
		criticalConstraintFailures: 0,
		staleDecisionCount: 0,
		rediscoveryCount: 0,
		turns: 0,
		toolCalls: 0,
		peakPromptTokens: 0,
		cumulativeTokens: 0,
		compactionCount: 0,
		truncationCount: 0,
		followUpRetrievals: 0,
		repeatedReads: 0,
		wallClockSessionSpanMs: nullableNonNegativeNumber(value, "wallClockSessionSpanMs", path),
		estimatedCost: nullableNonNegativeNumber(value, "estimatedCost", path),
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		evidenceReferencesResolved: 0,
		evidenceReferencesMissing: 0,
	} satisfies ContextEvaluationMetrics;

	for (const key of INTEGER_METRIC_KEYS) {
		metrics[key] = requiredNonNegativeInteger(value, key, path);
	}
	return metrics;
}

function parseRun(value: unknown, index: number): ContextEvaluationRun {
	const path = `runs[${index}]`;
	if (!isRecord(value)) throw new Error(`${path} must be an object`);

	return {
		workloadId: requiredString(value, "workloadId", path),
		providerModel: requiredString(value, "providerModel", path),
		contextWindow: requiredPositiveInteger(value, "contextWindow", path),
		taskInputHash: requiredString(value, "taskInputHash", path),
		initialContextHash: requiredString(value, "initialContextHash", path),
		controlledConfigHash: requiredString(value, "controlledConfigHash", path),
		treatmentConfig: optionalTreatmentConfig(value, path),
		metrics: parseMetrics(value.metrics, `${path}.metrics`),
		limitations: optionalLimitations(value, path),
	};
}

interface SessionUsageObservation {
	input: number;
	totalTokens: number;
	cacheRead: number;
	cacheWrite: number;
	costTotal: number | null;
}

interface SessionAssistantObservation {
	index: number;
	providerModel?: string;
	timestampMs: number | null;
	usage: SessionUsageObservation | null;
	toolCalls: number;
}

interface SessionCompactionObservation {
	index: number;
	tokensBefore: number;
	summary: string;
	timestampMs: number | null;
	evidenceReferences: EvidenceReference[];
	malformedEvidenceReferences: boolean;
}

function finiteNonNegative(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function entryTimestampMs(entry: RecordValue): number | null {
	const timestamp = entry.timestamp;
	if (typeof timestamp !== "string") return null;
	const parsed = Date.parse(timestamp);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseSessionUsage(message: RecordValue): SessionUsageObservation | null {
	const rawUsage = message.usage;
	if (!isRecord(rawUsage)) return null;
	const input = finiteNonNegative(rawUsage.input);
	const output = finiteNonNegative(rawUsage.output);
	if (input === undefined || output === undefined) return null;
	const totalTokens = finiteNonNegative(rawUsage.totalTokens) ?? input + output;
	const cacheRead = finiteNonNegative(rawUsage.cacheRead) ?? 0;
	const cacheWrite = finiteNonNegative(rawUsage.cacheWrite) ?? 0;
	const cost = isRecord(rawUsage.cost) ? finiteNonNegative(rawUsage.cost.total) : undefined;
	return { input, totalTokens, cacheRead, cacheWrite, costTotal: cost ?? null };
}

function countAssistantToolCalls(message: RecordValue): number {
	if (!Array.isArray(message.content)) return 0;
	return message.content.reduce((count, block) => {
		return count + (isRecord(block) && block.type === "toolCall" ? 1 : 0);
	}, 0);
}

function getAssistantObservation(entry: unknown, index: number): SessionAssistantObservation | null {
	if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message)) return null;
	if (entry.message.role !== "assistant") return null;
	const provider = entry.message.provider;
	const model = entry.message.model;
	const providerModel =
		typeof provider === "string" && provider.length > 0 && typeof model === "string" && model.length > 0
			? `${provider}/${model}`
			: undefined;
	return {
		index,
		providerModel,
		timestampMs: entryTimestampMs(entry),
		usage: parseSessionUsage(entry.message),
		toolCalls: countAssistantToolCalls(entry.message),
	};
}

function parseEvidenceReferences(details: unknown): { references: EvidenceReference[]; malformed: boolean } {
	if (!isRecord(details) || details.evidenceRefs === undefined) return { references: [], malformed: false };
	if (!Array.isArray(details.evidenceRefs)) return { references: [], malformed: true };
	return normalizeEvidenceReferences(details.evidenceRefs);
}

function getCompactionObservation(entry: unknown, index: number): SessionCompactionObservation | null {
	if (!isRecord(entry) || entry.type !== "compaction") return null;
	const tokensBefore = finiteNonNegative(entry.tokensBefore);
	if (tokensBefore === undefined) throw new Error(`Session compaction at entry ${index} has invalid tokensBefore.`);
	if (typeof entry.summary !== "string" || entry.summary.trim().length === 0) {
		throw new Error(`Session compaction at entry ${index} has no usable summary.`);
	}
	const evidence = parseEvidenceReferences(entry.details);
	return {
		index,
		tokensBefore,
		summary: entry.summary,
		timestampMs: entryTimestampMs(entry),
		evidenceReferences: evidence.references,
		malformedEvidenceReferences: evidence.malformed,
	};
}

function addLimitation(limitations: Set<string>, message: string): void {
	limitations.add(message);
}

function annotationCount(
	value: number | undefined,
	label: string,
	limitations: Set<string>,
): number {
	if (value === undefined) {
		addLimitation(limitations, `${label} was not annotated; defaulted to zero.`);
		return 0;
	}
	if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer.`);
	return value;
}

/** Derive a cautious evaluation run from a saved session JSONL value. */
export function collectContextEvaluationRunFromSession(
	entries: readonly unknown[],
	metadata: ContextSessionRunMetadata,
): ContextEvaluationRun {
	if (!Number.isInteger(metadata.contextWindow) || metadata.contextWindow <= 0) {
		throw new RangeError("contextWindow must be a positive integer.");
	}
	const requiredMetadata = [
		["workloadId", metadata.workloadId],
		["taskInputHash", metadata.taskInputHash],
		["initialContextHash", metadata.initialContextHash],
		["controlledConfigHash", metadata.controlledConfigHash],
	] as const;
	for (const [key, value] of requiredMetadata) {
		if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${key} must be a non-empty string.`);
	}

	const limitations = new Set<string>();
	const assistants = entries.map(getAssistantObservation).filter((item): item is SessionAssistantObservation => item !== null);
	const compactions = entries
		.map(getCompactionObservation)
		.filter((item): item is SessionCompactionObservation => item !== null);
	const derivedProviderModels = Array.from(
		new Set(assistants.flatMap((assistant) => (assistant.providerModel ? [assistant.providerModel] : []))),
	);
	if (derivedProviderModels.length > 1) {
		throw new Error(`Session contains multiple provider/models: ${derivedProviderModels.join(", ")}`);
	}
	const providerModel = metadata.providerModel ?? derivedProviderModels[0];
	if (!providerModel) throw new Error("Session has no provider/model and metadata.providerModel was not supplied.");
	if (metadata.providerModel && derivedProviderModels[0] && metadata.providerModel !== derivedProviderModels[0]) {
		throw new Error(`provider/model differs from supplied metadata: ${derivedProviderModels[0]}`);
	}

	const usageObservations = assistants.filter(
		(assistant): assistant is SessionAssistantObservation & { usage: SessionUsageObservation } => assistant.usage !== null,
	);
	if (usageObservations.length !== assistants.length) {
		addLimitation(limitations, "One or more assistant messages had incomplete usage metadata.");
	}
	const peakPromptTokens = usageObservations.reduce((maximum, assistant) => Math.max(maximum, assistant.usage.input), 0);
	const cumulativeTokens = usageObservations.reduce((total, assistant) => total + assistant.usage.totalTokens, 0);
	const cacheReadTokens = usageObservations.reduce((total, assistant) => total + assistant.usage.cacheRead, 0);
	const cacheWriteTokens = usageObservations.reduce((total, assistant) => total + assistant.usage.cacheWrite, 0);
	const costObservations = usageObservations.filter((assistant) => assistant.usage.costTotal !== null);
	const estimatedCost = costObservations.length === usageObservations.length && usageObservations.length > 0
		? costObservations.reduce((total, assistant) => total + (assistant.usage.costTotal ?? 0), 0)
		: null;
	if (estimatedCost === null) addLimitation(limitations, "Overall cost was not fully available in session usage metadata.");

	const timestamps = entries
		.map((entry) => (isRecord(entry) ? entryTimestampMs(entry) : null))
		.filter((timestamp): timestamp is number => timestamp !== null);
	const wallClockSessionSpanMs = timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : null;
	if (wallClockSessionSpanMs === null) {
		addLimitation(limitations, "Overall wall-clock session span could not be derived from timestamps.");
	}

	const tokensBefore = compactions.map((compaction) => compaction.tokensBefore);
	const tokensAfter = compactions.map((compaction) => {
		const nextAssistant = assistants.find((assistant) => assistant.index > compaction.index && assistant.usage !== null);
		if (!nextAssistant?.usage) {
			throw new Error(`Session compaction at entry ${compaction.index} has no subsequent assistant usage for tokensAfter.`);
		}
		return nextAssistant.usage.input;
	});
	const summaryTokens = compactions.length === 0 ? 0 : Math.max(...compactions.map((compaction) => estimateTextTokens(compaction.summary)));
	if (compactions.length > 0) {
		addLimitation(limitations, "Compaction latency and compaction cost are not persisted in session JSONL.");
	}

	const annotations = metadata.annotations ?? {};
	if (
		annotations.outcome !== undefined &&
		annotations.outcome !== "pass" &&
		annotations.outcome !== "fail" &&
		annotations.outcome !== "unknown"
	) {
		throw new Error("annotations.outcome must be pass, fail, or unknown.");
	}
	const outcome = annotations.outcome ?? "unknown";
	if (annotations.outcome === undefined) addLimitation(limitations, "Correctness outcome was not annotated; defaulted to unknown.");
	const criticalConstraintFailures = annotationCount(
		annotations.criticalConstraintFailures,
		"Critical-constraint failures",
		limitations,
	);
	const staleDecisionCount = annotationCount(annotations.staleDecisionCount, "Stale-decision count", limitations);
	const rediscoveryCount = annotationCount(annotations.rediscoveryCount, "Rediscovery count", limitations);
	const truncationCount = annotationCount(annotations.truncationCount, "Truncation count", limitations);
	const followUpRetrievals = annotationCount(annotations.followUpRetrievals, "Follow-up retrieval count", limitations);
	const repeatedReads = annotationCount(annotations.repeatedReads, "Repeated-read count", limitations);

	const sessionEntry = entries.find((entry) => isRecord(entry) && entry.type === "session");
	const sessionCwd = isRecord(sessionEntry) && typeof sessionEntry.cwd === "string" ? sessionEntry.cwd : undefined;
	const evidenceReferences = compactions.flatMap((compaction) => compaction.evidenceReferences);
	let evidenceReferencesResolved = 0;
	let evidenceReferencesMissing = 0;
	if (compactions.some((compaction) => compaction.malformedEvidenceReferences)) {
		addLimitation(limitations, "Malformed evidence references were omitted from session-derived counts.");
	}
	if (evidenceReferences.length > 0) {
		const cwd = metadata.cwd ?? sessionCwd;
		if (!cwd) {
			evidenceReferencesMissing = evidenceReferences.length;
			addLimitation(limitations, "Evidence references could not be resolved without a session cwd.");
		} else {
			const resolutions = resolveEvidenceReferences(evidenceReferences, cwd);
			evidenceReferencesResolved = resolutions.filter((item) => item.status === "available").length;
			evidenceReferencesMissing = resolutions.length - evidenceReferencesResolved;
		}
	}

	return {
		workloadId: metadata.workloadId,
		providerModel,
		contextWindow: metadata.contextWindow,
		taskInputHash: metadata.taskInputHash,
		initialContextHash: metadata.initialContextHash,
		controlledConfigHash: metadata.controlledConfigHash,
		treatmentConfig: metadata.treatmentConfig,
		limitations: Array.from(limitations),
		metrics: {
			outcome,
			tokensBefore,
			tokensAfter,
			summaryTokens,
			compactionLatencyMs: null,
			compactionCost: null,
			criticalConstraintFailures,
			staleDecisionCount,
			rediscoveryCount,
			turns: assistants.length,
			toolCalls: assistants.reduce((total, assistant) => total + assistant.toolCalls, 0),
			peakPromptTokens,
			cumulativeTokens,
			compactionCount: compactions.length,
			truncationCount,
			followUpRetrievals,
			repeatedReads,
			wallClockSessionSpanMs,
			estimatedCost,
			cacheReadTokens,
			cacheWriteTokens,
			evidenceReferencesResolved,
			evidenceReferencesMissing,
		},
	};
}

/** Parse and validate a recorded baseline or Context evaluation input. */
export function parseContextEvaluationInput(value: unknown): ContextEvaluationInput {
	if (!isRecord(value)) throw new Error("evaluation input must be an object");
	const isCurrentSchema =
		value.schemaVersion === CONTEXT_EVALUATION_SCHEMA_VERSION && value.evaluationType === CONTEXT_EVALUATION_TYPE;
	const isLegacySchema =
		value.schemaVersion === LEGACY_CONTEXT_EVALUATION_SCHEMA_VERSION && value.phase === LEGACY_CONTEXT_EVALUATION_PHASE;
	if (!isCurrentSchema && !isLegacySchema) {
		if (value.schemaVersion !== CONTEXT_EVALUATION_SCHEMA_VERSION) {
			throw new Error(`schemaVersion must be ${CONTEXT_EVALUATION_SCHEMA_VERSION}`);
		}
		throw new Error(`evaluationType must be ${CONTEXT_EVALUATION_TYPE}`);
	}
	if (value.variant !== "baseline" && value.variant !== "context") {
		throw new Error("variant must be baseline or context");
	}
	if (!Array.isArray(value.runs) || value.runs.length === 0) {
		throw new Error("runs must be a non-empty array");
	}

	const runs = value.runs.map(parseRun);
	const workloadIds = new Set<string>();
	for (const run of runs) {
		if (workloadIds.has(run.workloadId)) throw new Error(`duplicate workloadId: ${run.workloadId}`);
		workloadIds.add(run.workloadId);
	}

	return {
		schemaVersion: CONTEXT_EVALUATION_SCHEMA_VERSION,
		evaluationType: CONTEXT_EVALUATION_TYPE,
		variant: value.variant,
		runs,
	};
}

function indexRuns(runs: readonly ContextEvaluationRun[], variant: ContextEvaluationVariant): Map<string, ContextEvaluationRun> {
	const indexed = new Map<string, ContextEvaluationRun>();
	for (const run of runs) {
		if (indexed.has(run.workloadId)) throw new Error(`duplicate workloadId in ${variant}: ${run.workloadId}`);
		indexed.set(run.workloadId, run);
	}
	return indexed;
}

function requireSamePairContext(baseline: ContextEvaluationRun, context: ContextEvaluationRun): void {
	const sharedFields = [
		["provider/model", baseline.providerModel, context.providerModel],
		["contextWindow", baseline.contextWindow, context.contextWindow],
		["taskInputHash", baseline.taskInputHash, context.taskInputHash],
		["initialContextHash", baseline.initialContextHash, context.initialContextHash],
		["controlledConfigHash", baseline.controlledConfigHash, context.controlledConfigHash],
	] as const;
	for (const [name, baselineValue, contextValue] of sharedFields) {
		if (baselineValue !== contextValue) {
			throw new Error(`${name} differs between baseline and context for ${baseline.workloadId}`);
		}
	}
}

function metricDelta(context: number | null, baseline: number | null): number | null {
	return context === null || baseline === null ? null : context - baseline;
}

function lastValue(values: readonly number[]): number | null {
	return values.length === 0 ? null : (values[values.length - 1] ?? null);
}

function calculateDeltas(baseline: ContextEvaluationMetrics, context: ContextEvaluationMetrics): ContextEvaluationDeltas {
	const deltas = {
		lastTokensBefore: metricDelta(lastValue(context.tokensBefore), lastValue(baseline.tokensBefore)),
		lastTokensAfter: metricDelta(lastValue(context.tokensAfter), lastValue(baseline.tokensAfter)),
		summaryTokens: context.summaryTokens - baseline.summaryTokens,
		compactionLatencyMs: metricDelta(context.compactionLatencyMs, baseline.compactionLatencyMs),
		compactionCost: metricDelta(context.compactionCost, baseline.compactionCost),
		turns: 0,
		toolCalls: 0,
		peakPromptTokens: 0,
		cumulativeTokens: 0,
		compactionCount: 0,
		truncationCount: 0,
		followUpRetrievals: 0,
		repeatedReads: 0,
		wallClockSessionSpanMs: metricDelta(context.wallClockSessionSpanMs, baseline.wallClockSessionSpanMs),
		estimatedCost: metricDelta(context.estimatedCost, baseline.estimatedCost),
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		evidenceReferencesResolved: 0,
		evidenceReferencesMissing: 0,
	} satisfies ContextEvaluationDeltas;

	for (const key of DELTA_KEYS) deltas[key] = context[key] - baseline[key];
	return deltas;
}

function createPair(baseline: ContextEvaluationRun, context: ContextEvaluationRun): ContextEvaluationPair {
	requireSamePairContext(baseline, context);
	const correctnessRegression = baseline.metrics.outcome === "pass" && context.metrics.outcome === "fail";
	const criticalConstraintRegression =
		context.metrics.criticalConstraintFailures > baseline.metrics.criticalConstraintFailures;
	const staleDecisionRegression = context.metrics.staleDecisionCount > baseline.metrics.staleDecisionCount;
	const outcomeUnknown = baseline.metrics.outcome === "unknown" || context.metrics.outcome === "unknown";
	const unresolvedLimitations = [...(baseline.limitations ?? []), ...(context.limitations ?? [])];
	const blocked = correctnessRegression || criticalConstraintRegression || staleDecisionRegression;
	const status: ContextEvaluationDecision =
		blocked || outcomeUnknown || unresolvedLimitations.length > 0 ? (blocked ? "blocked" : "inconclusive") : "pass";
	const limitations = [
		"Efficiency deltas are descriptive and do not establish an efficiency improvement.",
		...unresolvedLimitations,
	];
	if (outcomeUnknown) limitations.push("At least one run has unknown correctness, so the pair cannot establish a quality result.");
	if (staleDecisionRegression) limitations.push("The Context run produced more stale-decision observations than baseline.");

	return {
		workloadId: baseline.workloadId,
		baseline,
		context,
		correctnessRegression,
		criticalConstraintRegression,
		staleDecisionRegression,
		status,
		deltas: calculateDeltas(baseline.metrics, context.metrics),
		limitations,
	};
}

/** Compare paired recorded runs without executing a model or changing runtime policy. */
export function compareContextEvaluationRuns(
	baselineRuns: readonly ContextEvaluationRun[],
	contextRuns: readonly ContextEvaluationRun[],
): ContextEvaluationReport {
	if (baselineRuns.length === 0 || contextRuns.length === 0) {
		throw new Error("baseline and context runs must both be non-empty");
	}

	const baselineByWorkload = indexRuns(baselineRuns, "baseline");
	const contextByWorkload = indexRuns(contextRuns, "context");
	for (const workloadId of baselineByWorkload.keys()) {
		if (!contextByWorkload.has(workloadId)) throw new Error(`missing context run for ${workloadId}`);
	}
	for (const workloadId of contextByWorkload.keys()) {
		if (!baselineByWorkload.has(workloadId)) throw new Error(`missing baseline run for ${workloadId}`);
	}

	const pairs = Array.from(baselineByWorkload.values()).map((baseline) => {
		const context = contextByWorkload.get(baseline.workloadId);
		if (!context) throw new Error(`missing context run for ${baseline.workloadId}`);
		return createPair(baseline, context);
	});
	const decision: ContextEvaluationDecision = pairs.some((pair) => pair.status === "blocked")
		? "blocked"
		: pairs.some((pair) => pair.status === "inconclusive")
			? "inconclusive"
			: "pass";

	return {
		schemaVersion: CONTEXT_EVALUATION_SCHEMA_VERSION,
		evaluationType: CONTEXT_EVALUATION_TYPE,
		baselineVariant: "baseline",
		contextVariant: "context",
		pairs,
		decision,
		efficiencyClaim: "not-established",
		limitations: [
			"This comparator reads recorded results only; it does not execute provider calls.",
			"A pass means no measured correctness, critical-constraint, or stale-decision regression in the supplied pairs; it does not prove general model quality.",
			"Efficiency metrics are reported as deltas but require workload review before any policy decision.",
		],
	};
}

interface CliArguments {
	baselinePath?: string;
	contextPath?: string;
	sessionPath?: string;
	variant?: ContextEvaluationVariant;
	workloadId?: string;
	contextWindow?: number;
	taskInputHash?: string;
	initialContextHash?: string;
	controlledConfigHash?: string;
	treatmentConfigPath?: string;
	providerModel?: string;
	cwd?: string;
	annotationsPath?: string;
	json: boolean;
	help: boolean;
}

function parseArguments(argv: string[]): CliArguments {
	const result: CliArguments = { json: false, help: false };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--json") {
			result.json = true;
			continue;
		}
		if (argument === "--help" || argument === "-h") {
			result.help = true;
			continue;
		}
		if (
			argument === "--baseline" ||
			argument === "--context" ||
			argument === "--session" ||
			argument === "--variant" ||
			argument === "--workload-id" ||
			argument === "--context-window" ||
			argument === "--task-input-hash" ||
			argument === "--initial-context-hash" ||
			argument === "--controlled-config-hash" ||
			argument === "--treatment-config" ||
			argument === "--provider-model" ||
			argument === "--cwd" ||
			argument === "--annotations"
		) {
			const value = argv[index + 1];
			if (!value) throw new Error(`${argument} requires a path`);
			switch (argument) {
				case "--baseline":
					result.baselinePath = value;
					break;
				case "--context":
					result.contextPath = value;
					break;
				case "--session":
					result.sessionPath = value;
					break;
				case "--variant":
					if (value !== "baseline" && value !== "context") throw new Error("--variant must be baseline or context");
					result.variant = value;
					break;
				case "--workload-id":
					result.workloadId = value;
					break;
				case "--context-window": {
					const contextWindow = Number(value);
					if (!Number.isInteger(contextWindow) || contextWindow <= 0) {
						throw new Error("--context-window must be a positive integer");
					}
					result.contextWindow = contextWindow;
					break;
				}
				case "--task-input-hash":
					result.taskInputHash = value;
					break;
				case "--initial-context-hash":
					result.initialContextHash = value;
					break;
				case "--controlled-config-hash":
					result.controlledConfigHash = value;
					break;
				case "--treatment-config":
					result.treatmentConfigPath = value;
					break;
				case "--provider-model":
					result.providerModel = value;
					break;
				case "--cwd":
					result.cwd = value;
					break;
				case "--annotations":
					result.annotationsPath = value;
					break;
			}
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	return result;
}

function loadInput(path: string): ContextEvaluationInput {
	const contents = readFileSync(path, "utf8");
	let value: unknown;
	try {
		value = JSON.parse(contents) as unknown;
	} catch (error) {
		throw new Error(`Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
	return parseContextEvaluationInput(value);
}

const SESSION_ANNOTATION_NUMBER_KEYS = [
	"criticalConstraintFailures",
	"staleDecisionCount",
	"rediscoveryCount",
	"truncationCount",
	"followUpRetrievals",
	"repeatedReads",
] as const satisfies ReadonlyArray<keyof Omit<ContextSessionRunAnnotations, "outcome">>;

function loadSessionAnnotations(path: string): ContextSessionRunAnnotations {
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(path, "utf8")) as unknown;
	} catch (error) {
		throw new Error(`Could not parse annotations ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!isRecord(value)) throw new Error(`Annotations ${path} must contain a JSON object.`);

	const annotations: ContextSessionRunAnnotations = {};
	if (value.outcome !== undefined) {
		if (value.outcome !== "pass" && value.outcome !== "fail" && value.outcome !== "unknown") {
			throw new Error("annotations.outcome must be pass, fail, or unknown.");
		}
		annotations.outcome = value.outcome;
	}
	for (const key of SESSION_ANNOTATION_NUMBER_KEYS) {
		const candidate = value[key];
		if (candidate === undefined) continue;
		if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < 0) {
			throw new Error(`annotations.${key} must be a non-negative integer.`);
		}
		annotations[key] = candidate;
	}
	return annotations;
}

function loadTreatmentConfig(path: string): ContextTreatmentConfig {
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(path, "utf8")) as unknown;
	} catch (error) {
		throw new Error(`Could not parse treatment config ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!isRecord(value)) throw new Error(`Treatment config ${path} must contain a JSON object.`);
	return optionalTreatmentConfig({ treatmentConfig: value }, "treatment") ?? {};
}

function loadSessionEntries(path: string): unknown[] {
	return readFileSync(path, "utf8")
		.split(/\r?\n/)
		.map((line, index) => ({ line: line.trim(), index }))
		.filter((item) => item.line.length > 0)
		.map((item) => {
			try {
				return JSON.parse(item.line) as unknown;
			} catch (error) {
				throw new Error(`Could not parse session JSONL ${path} line ${item.index + 1}: ${error instanceof Error ? error.message : String(error)}`);
			}
		});
}

function loadSessionInput(argumentsValue: CliArguments): ContextEvaluationInput {
	if (!argumentsValue.sessionPath) throw new Error("--session is required");
	const required = [
		["--variant", argumentsValue.variant],
		["--workload-id", argumentsValue.workloadId],
		["--context-window", argumentsValue.contextWindow],
		["--task-input-hash", argumentsValue.taskInputHash],
		["--initial-context-hash", argumentsValue.initialContextHash],
		["--controlled-config-hash", argumentsValue.controlledConfigHash],
	] as const;
	for (const [flag, value] of required) {
		if (value === undefined || value === "") throw new Error(`${flag} is required with --session`);
	}
	const run = collectContextEvaluationRunFromSession(loadSessionEntries(argumentsValue.sessionPath), {
		workloadId: argumentsValue.workloadId as string,
		contextWindow: argumentsValue.contextWindow as number,
		taskInputHash: argumentsValue.taskInputHash as string,
		initialContextHash: argumentsValue.initialContextHash as string,
		controlledConfigHash: argumentsValue.controlledConfigHash as string,
		treatmentConfig: argumentsValue.treatmentConfigPath
			? loadTreatmentConfig(argumentsValue.treatmentConfigPath)
			: undefined,
		providerModel: argumentsValue.providerModel,
		cwd: argumentsValue.cwd,
		annotations: argumentsValue.annotationsPath ? loadSessionAnnotations(argumentsValue.annotationsPath) : undefined,
	});
	return {
		schemaVersion: CONTEXT_EVALUATION_SCHEMA_VERSION,
		evaluationType: CONTEXT_EVALUATION_TYPE,
		variant: argumentsValue.variant as ContextEvaluationVariant,
		runs: [run],
	};
}

function printHumanReport(report: ContextEvaluationReport): string {
	const lines = [
		`${report.evaluationType}: decision=${report.decision}`,
		`Efficiency claim: ${report.efficiencyClaim}`,
	];
	for (const pair of report.pairs) {
		lines.push(
			`${pair.workloadId}: status=${pair.status}, correctness-regression=${pair.correctnessRegression}, critical-constraint-regression=${pair.criticalConstraintRegression}, stale-decision-regression=${pair.staleDecisionRegression}, turns-delta=${pair.deltas.turns}, peak-prompt-tokens-delta=${pair.deltas.peakPromptTokens}`,
		);
	}
	return `${lines.join("\n")}\n`;
}

function printSessionInput(input: ContextEvaluationInput): string {
	const run = input.runs[0];
	if (!run) return `${input.evaluationType}: no session run\n`;
	const limitations = run.limitations ?? [];
	return [
		`${input.evaluationType}: recorded ${input.variant} session`,
		`workload=${run.workloadId}, provider/model=${run.providerModel}, turns=${run.metrics.turns}, tool-calls=${run.metrics.toolCalls}, compactions=${run.metrics.compactionCount}`,
		`tokens-before=${run.metrics.tokensBefore.join(",") || "-"}, tokens-after=${run.metrics.tokensAfter.join(",") || "-"}`,
		`limitations=${limitations.length === 0 ? "none" : limitations.length}`,
	].join("\n") + "\n";
}

function printHelp(): string {
	return [
		"Usage: npm run evaluate:context -- --baseline PATH --context PATH [--json]",
		"       npm run evaluate:context -- --session PATH --variant baseline|context --workload-id ID --context-window TOKENS --task-input-hash HASH --initial-context-hash HASH --controlled-config-hash HASH [options]",
		"",
		"Compares recorded baseline and Context workload results, or derives a cautious run record from session JSONL without executing a model.",
		"Session options: --provider-model MODEL --cwd PATH --annotations PATH --treatment-config PATH --json",
	].join("\n");
}

function isMainModule(): boolean {
	const entrypoint = process.argv[1];
	return entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href;
}

if (isMainModule()) {
	try {
		const argumentsValue = parseArguments(process.argv.slice(2));
		if (argumentsValue.help) {
			process.stdout.write(`${printHelp()}\n`);
		} else {
			if (argumentsValue.sessionPath) {
				const input = loadSessionInput(argumentsValue);
				process.stdout.write(argumentsValue.json ? `${JSON.stringify(input, null, 2)}\n` : printSessionInput(input));
			} else {
				if (!argumentsValue.baselinePath || !argumentsValue.contextPath) {
					throw new Error("--baseline and --context are required");
				}
				const baseline = loadInput(argumentsValue.baselinePath);
				const context = loadInput(argumentsValue.contextPath);
				if (baseline.variant !== "baseline") throw new Error("baseline input must use variant baseline");
				if (context.variant !== "context") throw new Error("context input must use variant context");
				const report = compareContextEvaluationRuns(baseline.runs, context.runs);
				process.stdout.write(argumentsValue.json ? `${JSON.stringify(report, null, 2)}\n` : printHumanReport(report));
			}
		}
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
