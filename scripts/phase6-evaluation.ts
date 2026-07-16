import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PHASE6_EVALUATION_SCHEMA_VERSION = 1 as const;
export const PHASE6_EVALUATION_PHASE = "P6-live-evaluation" as const;
const MAX_PHASE6_EVALUATION_RUNS = 256;
const MAX_PHASE6_EVALUATION_LIMITATIONS = 32;

export type Phase6EvaluationVariant = "baseline" | "phase6";
export type Phase6EvaluationOutcome = "pass" | "fail" | "unknown";
export type Phase6EvaluationDecision = "pass" | "blocked" | "inconclusive";
export interface Phase6ExecutionIntegrityTreatment {
	mode: "off" | "enforce";
	maxContinuationAttempts?: number;
}

export interface Phase6TreatmentConfig {
	executionIntegrity: Phase6ExecutionIntegrityTreatment;
}

export interface Phase6EvaluationMetrics {
	outcome: Phase6EvaluationOutcome;
	prematureCompletionCount: number | null;
	unsupportedSuccessClaimCount: number | null;
	userCorrectionTurns: number | null;
	relevantValidationCount: number;
	unnecessaryValidationCount: number;
	staleValidationCount: number;
	failedValidationCount: number;
	completionContinuationCount: number;
	falseCompletionBlockCount: number;
	turns: number;
	toolCalls: number;
	peakPromptTokens: number;
	cumulativeTokens: number;
	wallClockSessionSpanMs: number | null;
	estimatedCost: number | null;
	cacheReadTokens: number;
	cacheWriteTokens: number;
}

export interface Phase6EvaluationRun {
	workloadId: string;
	trialId: string;
	providerModel: string;
	contextWindow: number;
	taskInputHash: string;
	initialContextHash: string;
	controlledConfigHash: string;
	treatmentConfig: Phase6TreatmentConfig;
	metrics: Phase6EvaluationMetrics;
	limitations?: string[];
	variant: Phase6EvaluationVariant;
}

export interface Phase6EvaluationInput {
	schemaVersion: typeof PHASE6_EVALUATION_SCHEMA_VERSION;
	phase: typeof PHASE6_EVALUATION_PHASE;
	variant: Phase6EvaluationVariant;
	runs: Phase6EvaluationRun[];
}

export interface Phase6EvaluationDeltas {
	prematureCompletionCount: number | null;
	unsupportedSuccessClaimCount: number | null;
	userCorrectionTurns: number | null;
	relevantValidationCount: number;
	unnecessaryValidationCount: number;
	staleValidationCount: number;
	failedValidationCount: number;
	completionContinuationCount: number;
	falseCompletionBlockCount: number;
	turns: number;
	toolCalls: number;
	peakPromptTokens: number;
	cumulativeTokens: number;
	wallClockSessionSpanMs: number | null;
	estimatedCost: number | null;
	cacheReadTokens: number;
	cacheWriteTokens: number;
}

export interface Phase6EvaluationPair {
	workloadId: string;
	trialId: string;
	baseline: Phase6EvaluationRun;
	phase6: Phase6EvaluationRun;
	correctnessRegression: boolean;
	prematureCompletionRegression: boolean;
	unsupportedSuccessClaimRegression: boolean;
	falseCompletionBlockCount: number;
	status: Phase6EvaluationDecision;
	deltas: Phase6EvaluationDeltas;
	limitations: string[];
}

export interface Phase6EvaluationReport {
	schemaVersion: typeof PHASE6_EVALUATION_SCHEMA_VERSION;
	phase: typeof PHASE6_EVALUATION_PHASE;
	baselineVariant: "baseline";
	phase6Variant: "phase6";
	pairs: Phase6EvaluationPair[];
	decision: Phase6EvaluationDecision;
	efficiencyClaim: "not-established";
	limitations: string[];
}

type RecordValue = Record<string, unknown>;

const ANNOTATED_COUNT_KEYS = [
	"prematureCompletionCount",
	"unsupportedSuccessClaimCount",
	"userCorrectionTurns",
] as const;

const COUNT_KEYS = [
	"relevantValidationCount",
	"unnecessaryValidationCount",
	"staleValidationCount",
	"failedValidationCount",
	"completionContinuationCount",
	"falseCompletionBlockCount",
	"turns",
	"toolCalls",
	"peakPromptTokens",
	"cumulativeTokens",
	"cacheReadTokens",
	"cacheWriteTokens",
] as const;

function isRecord(value: unknown): value is RecordValue {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: RecordValue, key: string, path: string): string {
	const field = value[key];
	if (typeof field !== "string" || field.trim().length === 0) throw new Error(`${path}.${key} must be a non-empty string`);
	return field;
}

function requiredNonNegativeInteger(value: RecordValue, key: string, path: string): number {
	const field = value[key];
	if (typeof field !== "number" || !Number.isFinite(field) || !Number.isInteger(field) || field < 0) {
		throw new Error(`${path}.${key} must be a non-negative integer`);
	}
	return field;
}

function requiredPositiveInteger(value: RecordValue, key: string, path: string): number {
	const field = requiredNonNegativeInteger(value, key, path);
	if (field <= 0) throw new Error(`${path}.${key} must be positive`);
	return field;
}

function nullableNonNegativeNumber(value: RecordValue, key: string, path: string): number | null {
	const field = value[key];
	if (field === null) return null;
	if (typeof field !== "number" || !Number.isFinite(field) || field < 0) {
		throw new Error(`${path}.${key} must be a finite non-negative number or null`);
	}
	return field;
}

function nullableNonNegativeInteger(value: RecordValue, key: string, path: string): number | null {
	const field = value[key];
	if (field === null) return null;
	return requiredNonNegativeInteger(value, key, path);
}

function parseLimitations(value: RecordValue, path: string): string[] | undefined {
	const field = value.limitations;
	if (field === undefined) return undefined;
	if (
		!Array.isArray(field) ||
		field.length > MAX_PHASE6_EVALUATION_LIMITATIONS ||
		field.some((item) => typeof item !== "string" || item.trim().length === 0)
	) {
		throw new Error(`${path}.limitations must contain at most ${MAX_PHASE6_EVALUATION_LIMITATIONS} non-empty strings`);
	}
	return [...field] as string[];
}

function parseTreatmentConfig(value: RecordValue, path: string): Phase6TreatmentConfig {
	const field = value.treatmentConfig;
	if (field === undefined) throw new Error(`${path}.treatmentConfig is required`);
	if (!isRecord(field)) throw new Error(`${path}.treatmentConfig must be an object`);
	if (Object.keys(field).some((key) => key !== "executionIntegrity")) {
		throw new Error(`${path}.treatmentConfig contains only approved treatment fields`);
	}
	const executionIntegrity = field.executionIntegrity;
	if (!isRecord(executionIntegrity)) {
		throw new Error(`${path}.treatmentConfig.executionIntegrity must be an object`);
	}
	if (Object.keys(executionIntegrity).some((key) => key !== "mode" && key !== "maxContinuationAttempts")) {
		throw new Error(`${path}.treatmentConfig.executionIntegrity contains only approved fields`);
	}
	const mode = executionIntegrity.mode;
	if (mode !== "off" && mode !== "enforce") {
		throw new Error(`${path}.treatmentConfig.executionIntegrity.mode must be off or enforce`);
	}
	const maxContinuationAttempts = executionIntegrity.maxContinuationAttempts;
	if (maxContinuationAttempts !== undefined) {
		if (
			typeof maxContinuationAttempts !== "number" ||
			!Number.isInteger(maxContinuationAttempts) ||
			maxContinuationAttempts < 0 ||
			maxContinuationAttempts > 2
		) {
			throw new Error(`${path}.treatmentConfig.executionIntegrity.maxContinuationAttempts must be an integer from 0 through 2`);
		}
	}
	return {
		executionIntegrity: {
			mode,
			...(maxContinuationAttempts === undefined ? {} : { maxContinuationAttempts }),
		},
	};
}

function parseMetrics(value: unknown, path: string): Phase6EvaluationMetrics {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	const outcome = value.outcome;
	if (outcome !== "pass" && outcome !== "fail" && outcome !== "unknown") {
		throw new Error(`${path}.outcome must be pass, fail, or unknown`);
	}

	const metrics = {
		outcome,
		prematureCompletionCount: nullableNonNegativeInteger(value, "prematureCompletionCount", path),
		unsupportedSuccessClaimCount: nullableNonNegativeInteger(value, "unsupportedSuccessClaimCount", path),
		userCorrectionTurns: nullableNonNegativeInteger(value, "userCorrectionTurns", path),
		wallClockSessionSpanMs: nullableNonNegativeNumber(value, "wallClockSessionSpanMs", path),
		estimatedCost: nullableNonNegativeNumber(value, "estimatedCost", path),
		relevantValidationCount: 0,
		unnecessaryValidationCount: 0,
		staleValidationCount: 0,
		failedValidationCount: 0,
		completionContinuationCount: 0,
		falseCompletionBlockCount: 0,
		turns: 0,
		toolCalls: 0,
		peakPromptTokens: 0,
		cumulativeTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
	} satisfies Phase6EvaluationMetrics;

	for (const key of COUNT_KEYS) metrics[key] = requiredNonNegativeInteger(value, key, path);
	return metrics;
}

function parseRun(value: unknown, index: number, expectedVariant: Phase6EvaluationVariant): Phase6EvaluationRun {
	const path = `runs[${index}]`;
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	const variant = value.variant;
	if (variant !== expectedVariant) {
		throw new Error(`${path}.variant must match input variant ${expectedVariant}`);
	}
	return {
		workloadId: requiredString(value, "workloadId", path),
		trialId: requiredString(value, "trialId", path),
		providerModel: requiredString(value, "providerModel", path),
		contextWindow: requiredPositiveInteger(value, "contextWindow", path),
		taskInputHash: requiredString(value, "taskInputHash", path),
		initialContextHash: requiredString(value, "initialContextHash", path),
		controlledConfigHash: requiredString(value, "controlledConfigHash", path),
		treatmentConfig: parseTreatmentConfig(value, path),
		metrics: parseMetrics(value.metrics, `${path}.metrics`),
		limitations: parseLimitations(value, path),
		variant: expectedVariant,
	};
}

export function parsePhase6EvaluationInput(value: unknown): Phase6EvaluationInput {
	if (!isRecord(value)) throw new Error("Phase 6 evaluation input must be an object");
	if (value.schemaVersion !== PHASE6_EVALUATION_SCHEMA_VERSION) {
		throw new Error(`schemaVersion must be ${PHASE6_EVALUATION_SCHEMA_VERSION}`);
	}
	if (value.phase !== PHASE6_EVALUATION_PHASE) throw new Error(`phase must be ${PHASE6_EVALUATION_PHASE}`);
	const variant = value.variant;
	if (variant !== "baseline" && variant !== "phase6") {
		throw new Error("variant must be baseline or phase6");
	}
	if (!Array.isArray(value.runs) || value.runs.length === 0 || value.runs.length > MAX_PHASE6_EVALUATION_RUNS) {
		throw new Error(`runs must contain between 1 and ${MAX_PHASE6_EVALUATION_RUNS} entries`);
	}
	const runs = value.runs.map((run, index) => parseRun(run, index, variant));
	const workloadTrials = new Set<string>();
	for (const run of runs) {
		assertTreatmentMode(run, variant);
		const key = evaluationPairKey(run);
		if (workloadTrials.has(key)) throw new Error(`duplicate workload/trial: ${run.workloadId}/${run.trialId}`);
		workloadTrials.add(key);
	}
	return {
		schemaVersion: PHASE6_EVALUATION_SCHEMA_VERSION,
		phase: PHASE6_EVALUATION_PHASE,
		variant,
		runs,
	};
}

function evaluationPairKey(run: Pick<Phase6EvaluationRun, "workloadId" | "trialId">): string {
	return `${run.workloadId}\u0000${run.trialId}`;
}

function assertTreatmentMode(run: Phase6EvaluationRun, expectedVariant: Phase6EvaluationVariant): void {
	const expectedMode = expectedVariant === "baseline" ? "off" : "enforce";
	if (run.treatmentConfig?.executionIntegrity?.mode !== expectedMode) {
		throw new Error(`${expectedVariant} treatment must set executionIntegrity.mode to ${expectedMode}`);
	}
}

function indexRuns(runs: readonly Phase6EvaluationRun[], variant: Phase6EvaluationVariant): Map<string, Phase6EvaluationRun> {
	const indexed = new Map<string, Phase6EvaluationRun>();
	for (const [index, run] of runs.entries()) {
		if (run.variant !== variant) throw new Error(`run ${index} variant must be ${variant}`);
		assertTreatmentMode(run, variant);
		const key = evaluationPairKey(run);
		if (indexed.has(key)) throw new Error(`duplicate workload/trial in ${variant}: ${run.workloadId}/${run.trialId}`);
		indexed.set(key, run);
	}
	return indexed;
}

function requireSamePairContext(baseline: Phase6EvaluationRun, phase6: Phase6EvaluationRun): void {
	const sharedFields = [
		["provider/model", baseline.providerModel, phase6.providerModel],
		["contextWindow", baseline.contextWindow, phase6.contextWindow],
		["taskInputHash", baseline.taskInputHash, phase6.taskInputHash],
		["initialContextHash", baseline.initialContextHash, phase6.initialContextHash],
		["controlledConfigHash", baseline.controlledConfigHash, phase6.controlledConfigHash],
	] as const;
	for (const [name, baselineValue, phase6Value] of sharedFields) {
		if (baselineValue !== phase6Value) {
			throw new Error(`${name} differs between baseline and phase6 for ${baseline.workloadId}/${baseline.trialId}`);
		}
	}
}

function metricDelta(phase6: number | null, baseline: number | null): number | null {
	return phase6 === null || baseline === null ? null : phase6 - baseline;
}

function calculateDeltas(baseline: Phase6EvaluationMetrics, phase6: Phase6EvaluationMetrics): Phase6EvaluationDeltas {
	return {
		prematureCompletionCount: metricDelta(phase6.prematureCompletionCount, baseline.prematureCompletionCount),
		unsupportedSuccessClaimCount: metricDelta(
			phase6.unsupportedSuccessClaimCount,
			baseline.unsupportedSuccessClaimCount,
		),
		userCorrectionTurns: metricDelta(phase6.userCorrectionTurns, baseline.userCorrectionTurns),
		relevantValidationCount: phase6.relevantValidationCount - baseline.relevantValidationCount,
		unnecessaryValidationCount: phase6.unnecessaryValidationCount - baseline.unnecessaryValidationCount,
		staleValidationCount: phase6.staleValidationCount - baseline.staleValidationCount,
		failedValidationCount: phase6.failedValidationCount - baseline.failedValidationCount,
		completionContinuationCount: phase6.completionContinuationCount - baseline.completionContinuationCount,
		falseCompletionBlockCount: phase6.falseCompletionBlockCount - baseline.falseCompletionBlockCount,
		turns: phase6.turns - baseline.turns,
		toolCalls: phase6.toolCalls - baseline.toolCalls,
		peakPromptTokens: phase6.peakPromptTokens - baseline.peakPromptTokens,
		cumulativeTokens: phase6.cumulativeTokens - baseline.cumulativeTokens,
		wallClockSessionSpanMs: metricDelta(phase6.wallClockSessionSpanMs, baseline.wallClockSessionSpanMs),
		estimatedCost: metricDelta(phase6.estimatedCost, baseline.estimatedCost),
		cacheReadTokens: phase6.cacheReadTokens - baseline.cacheReadTokens,
		cacheWriteTokens: phase6.cacheWriteTokens - baseline.cacheWriteTokens,
	};
}

function createPair(baseline: Phase6EvaluationRun, phase6: Phase6EvaluationRun): Phase6EvaluationPair {
	requireSamePairContext(baseline, phase6);
	const correctnessRegression = baseline.metrics.outcome === "pass" && phase6.metrics.outcome === "fail";
	const prematureCompletionRegression =
		baseline.metrics.prematureCompletionCount !== null &&
		phase6.metrics.prematureCompletionCount !== null &&
		phase6.metrics.prematureCompletionCount > baseline.metrics.prematureCompletionCount;
	const unsupportedSuccessClaimRegression =
		baseline.metrics.unsupportedSuccessClaimCount !== null &&
		phase6.metrics.unsupportedSuccessClaimCount !== null &&
		phase6.metrics.unsupportedSuccessClaimCount > baseline.metrics.unsupportedSuccessClaimCount;
	const annotationMissing = ANNOTATED_COUNT_KEYS.some(
		(key) => baseline.metrics[key] === null || phase6.metrics[key] === null,
	);
	const unknownCorrectness = baseline.metrics.outcome === "unknown" || phase6.metrics.outcome === "unknown";
	const blocked = correctnessRegression || prematureCompletionRegression || unsupportedSuccessClaimRegression;
	const status: Phase6EvaluationDecision = blocked
		? "blocked"
		: unknownCorrectness || annotationMissing
			? "inconclusive"
			: "pass";
	const limitations = [
		"Efficiency deltas are descriptive and do not establish an efficiency improvement.",
		"A passing validation is evidence for the recorded command and mutation version, not proof of complete task correctness.",
	];
	if (unknownCorrectness) limitations.push("At least one run has unknown correctness; human or external annotation is required.");
	if (annotationMissing) limitations.push("One or more quality annotations are missing; the pair is inconclusive for those metrics.");
	if (phase6.metrics.falseCompletionBlockCount > 0) {
		limitations.push("False completion blocks are reported for review and do not by themselves establish a quality improvement.");
	}
	limitations.push(...(baseline.limitations ?? []), ...(phase6.limitations ?? []));

	return {
		workloadId: baseline.workloadId,
		trialId: baseline.trialId,
		baseline,
		phase6,
		correctnessRegression,
		prematureCompletionRegression,
		unsupportedSuccessClaimRegression,
		falseCompletionBlockCount: phase6.metrics.falseCompletionBlockCount,
		status,
		deltas: calculateDeltas(baseline.metrics, phase6.metrics),
		limitations: [...new Set(limitations)],
	};
}

/** Compare recorded baseline and treatment runs without invoking a provider or modifying runtime policy. */
export function comparePhase6EvaluationRuns(
	baselineRuns: readonly Phase6EvaluationRun[],
	phase6Runs: readonly Phase6EvaluationRun[],
): Phase6EvaluationReport {
	if (baselineRuns.length === 0 || phase6Runs.length === 0) throw new Error("baseline and phase6 runs must both be non-empty");
	const baselineByWorkload = indexRuns(baselineRuns, "baseline");
	const phase6ByWorkload = indexRuns(phase6Runs, "phase6");
	for (const [key, baseline] of baselineByWorkload) {
		if (!phase6ByWorkload.has(key)) throw new Error(`missing phase6 run for ${baseline.workloadId}/${baseline.trialId}`);
	}
	for (const [key, phase6] of phase6ByWorkload) {
		if (!baselineByWorkload.has(key)) throw new Error(`missing baseline run for ${phase6.workloadId}/${phase6.trialId}`);
	}

	const pairs = Array.from(baselineByWorkload.values()).map((baseline) => {
		const phase6 = phase6ByWorkload.get(evaluationPairKey(baseline));
		if (!phase6) throw new Error(`missing phase6 run for ${baseline.workloadId}/${baseline.trialId}`);
		return createPair(baseline, phase6);
	});
	const decision: Phase6EvaluationDecision = pairs.some((pair) => pair.status === "blocked")
		? "blocked"
		: pairs.some((pair) => pair.status === "inconclusive")
			? "inconclusive"
			: "pass";

	return {
		schemaVersion: PHASE6_EVALUATION_SCHEMA_VERSION,
		phase: PHASE6_EVALUATION_PHASE,
		baselineVariant: "baseline",
		phase6Variant: "phase6",
		pairs,
		decision,
		efficiencyClaim: "not-established",
		limitations: [
			"This evaluator reads recorded results only and never invokes a model.",
			"Correctness, premature completion, unsupported-success, and user-correction metrics require suitable human or external annotation.",
			"False completion blocks are retained for review; token, cost, turn, and latency deltas alone do not establish an improvement.",
		],
	};
}

interface CliArguments {
	baselinePath?: string;
	phase6Path?: string;
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
		if (argument === "--baseline" || argument === "--phase6") {
			const value = argv[index + 1];
			if (!value) throw new Error(`${argument} requires a path`);
			if (argument === "--baseline") result.baselinePath = value;
			else result.phase6Path = value;
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	return result;
}

function loadInput(path: string, expectedVariant: Phase6EvaluationVariant): Phase6EvaluationInput {
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(path, "utf8")) as unknown;
	} catch (error) {
		throw new Error(`Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
	const input = parsePhase6EvaluationInput(value);
	if (input.variant !== expectedVariant) throw new Error(`${path} must contain variant ${expectedVariant}`);
	return input;
}

function printHumanReport(report: Phase6EvaluationReport): string {
	const lines = [
		`${report.phase}: decision=${report.decision}, efficiencyClaim=${report.efficiencyClaim}, pairs=${report.pairs.length}`,
	];
	for (const pair of report.pairs) {
		lines.push(
			`${pair.workloadId}/${pair.trialId}: ${pair.status}, correctnessRegression=${pair.correctnessRegression}, prematureRegression=${pair.prematureCompletionRegression}, unsupportedSuccessRegression=${pair.unsupportedSuccessClaimRegression}, falseBlocks=${pair.falseCompletionBlockCount}`,
		);
	}
	return `${lines.join("\n")}\n`;
}

function printHelp(): string {
	return [
		"Usage: npm run evaluate:phase6 -- --baseline PATH --phase6 PATH [--json]",
		"",
		"Compares paired, recorded Phase 6 runs without invoking a provider or executing validation commands.",
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
			if (!argumentsValue.baselinePath || !argumentsValue.phase6Path) {
				throw new Error("--baseline and --phase6 are required");
			}
			const baseline = loadInput(argumentsValue.baselinePath, "baseline");
			const phase6 = loadInput(argumentsValue.phase6Path, "phase6");
			const report = comparePhase6EvaluationRuns(baseline.runs, phase6.runs);
			process.stdout.write(argumentsValue.json ? `${JSON.stringify(report, null, 2)}\n` : printHumanReport(report));
		}
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
