import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EXECUTION_EVALUATION_SCHEMA_VERSION = 2 as const;
export const EXECUTION_EVALUATION_TYPE = "execution-integrity" as const;
const LEGACY_EXECUTION_EVALUATION_SCHEMA_VERSION = 1;
const LEGACY_EXECUTION_EVALUATION_PHASE = "execution-live-evaluation";
const MAX_EXECUTION_EVALUATION_RUNS = 256;
const MAX_EXECUTION_EVALUATION_LIMITATIONS = 32;

export type ExecutionEvaluationVariant = "baseline" | "execution";
export type ExecutionEvaluationOutcome = "pass" | "fail" | "unknown";
export type ExecutionEvaluationDecision = "pass" | "blocked" | "inconclusive";
export interface ExecutionExecutionIntegrityTreatment {
	mode: "off" | "enforce";
	maxContinuationAttempts?: number;
}

export interface ExecutionTreatmentConfig {
	executionIntegrity: ExecutionExecutionIntegrityTreatment;
}

export interface ExecutionEvaluationMetrics {
	outcome: ExecutionEvaluationOutcome;
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

export interface ExecutionEvaluationRun {
	workloadId: string;
	trialId: string;
	providerModel: string;
	contextWindow: number;
	taskInputHash: string;
	initialContextHash: string;
	controlledConfigHash: string;
	treatmentConfig: ExecutionTreatmentConfig;
	metrics: ExecutionEvaluationMetrics;
	limitations?: string[];
	variant: ExecutionEvaluationVariant;
}

export interface ExecutionEvaluationInput {
	schemaVersion: typeof EXECUTION_EVALUATION_SCHEMA_VERSION;
	evaluationType: typeof EXECUTION_EVALUATION_TYPE;
	variant: ExecutionEvaluationVariant;
	runs: ExecutionEvaluationRun[];
}

export interface ExecutionEvaluationDeltas {
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

export interface ExecutionEvaluationPair {
	workloadId: string;
	trialId: string;
	baseline: ExecutionEvaluationRun;
	execution: ExecutionEvaluationRun;
	correctnessRegression: boolean;
	prematureCompletionRegression: boolean;
	unsupportedSuccessClaimRegression: boolean;
	falseCompletionBlockCount: number;
	status: ExecutionEvaluationDecision;
	deltas: ExecutionEvaluationDeltas;
	limitations: string[];
}

export interface ExecutionEvaluationReport {
	schemaVersion: typeof EXECUTION_EVALUATION_SCHEMA_VERSION;
	evaluationType: typeof EXECUTION_EVALUATION_TYPE;
	baselineVariant: "baseline";
	executionVariant: "execution";
	pairs: ExecutionEvaluationPair[];
	decision: ExecutionEvaluationDecision;
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
		field.length > MAX_EXECUTION_EVALUATION_LIMITATIONS ||
		field.some((item) => typeof item !== "string" || item.trim().length === 0)
	) {
		throw new Error(`${path}.limitations must contain at most ${MAX_EXECUTION_EVALUATION_LIMITATIONS} non-empty strings`);
	}
	return [...field] as string[];
}

function parseTreatmentConfig(value: RecordValue, path: string): ExecutionTreatmentConfig {
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

function parseMetrics(value: unknown, path: string): ExecutionEvaluationMetrics {
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
	} satisfies ExecutionEvaluationMetrics;

	for (const key of COUNT_KEYS) metrics[key] = requiredNonNegativeInteger(value, key, path);
	return metrics;
}

function parseRun(value: unknown, index: number, expectedVariant: ExecutionEvaluationVariant): ExecutionEvaluationRun {
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

export function parseExecutionEvaluationInput(value: unknown): ExecutionEvaluationInput {
	if (!isRecord(value)) throw new Error("Execution evaluation input must be an object");
	const isCurrentSchema =
		value.schemaVersion === EXECUTION_EVALUATION_SCHEMA_VERSION && value.evaluationType === EXECUTION_EVALUATION_TYPE;
	const isLegacySchema =
		value.schemaVersion === LEGACY_EXECUTION_EVALUATION_SCHEMA_VERSION && value.phase === LEGACY_EXECUTION_EVALUATION_PHASE;
	if (!isCurrentSchema && !isLegacySchema) {
		if (value.schemaVersion !== EXECUTION_EVALUATION_SCHEMA_VERSION) {
			throw new Error(`schemaVersion must be ${EXECUTION_EVALUATION_SCHEMA_VERSION}`);
		}
		throw new Error(`evaluationType must be ${EXECUTION_EVALUATION_TYPE}`);
	}
	const variant = value.variant;
	if (variant !== "baseline" && variant !== "execution") {
		throw new Error("variant must be baseline or execution");
	}
	if (!Array.isArray(value.runs) || value.runs.length === 0 || value.runs.length > MAX_EXECUTION_EVALUATION_RUNS) {
		throw new Error(`runs must contain between 1 and ${MAX_EXECUTION_EVALUATION_RUNS} entries`);
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
		schemaVersion: EXECUTION_EVALUATION_SCHEMA_VERSION,
		evaluationType: EXECUTION_EVALUATION_TYPE,
		variant,
		runs,
	};
}

function evaluationPairKey(run: Pick<ExecutionEvaluationRun, "workloadId" | "trialId">): string {
	return `${run.workloadId}\u0000${run.trialId}`;
}

function assertTreatmentMode(run: ExecutionEvaluationRun, expectedVariant: ExecutionEvaluationVariant): void {
	const expectedMode = expectedVariant === "baseline" ? "off" : "enforce";
	if (run.treatmentConfig?.executionIntegrity?.mode !== expectedMode) {
		throw new Error(`${expectedVariant} treatment must set executionIntegrity.mode to ${expectedMode}`);
	}
}

function indexRuns(runs: readonly ExecutionEvaluationRun[], variant: ExecutionEvaluationVariant): Map<string, ExecutionEvaluationRun> {
	const indexed = new Map<string, ExecutionEvaluationRun>();
	for (const [index, run] of runs.entries()) {
		if (run.variant !== variant) throw new Error(`run ${index} variant must be ${variant}`);
		assertTreatmentMode(run, variant);
		const key = evaluationPairKey(run);
		if (indexed.has(key)) throw new Error(`duplicate workload/trial in ${variant}: ${run.workloadId}/${run.trialId}`);
		indexed.set(key, run);
	}
	return indexed;
}

function requireSamePairContext(baseline: ExecutionEvaluationRun, execution: ExecutionEvaluationRun): void {
	const sharedFields = [
		["provider/model", baseline.providerModel, execution.providerModel],
		["contextWindow", baseline.contextWindow, execution.contextWindow],
		["taskInputHash", baseline.taskInputHash, execution.taskInputHash],
		["initialContextHash", baseline.initialContextHash, execution.initialContextHash],
		["controlledConfigHash", baseline.controlledConfigHash, execution.controlledConfigHash],
	] as const;
	for (const [name, baselineValue, executionValue] of sharedFields) {
		if (baselineValue !== executionValue) {
			throw new Error(`${name} differs between baseline and execution for ${baseline.workloadId}/${baseline.trialId}`);
		}
	}
}

function metricDelta(execution: number | null, baseline: number | null): number | null {
	return execution === null || baseline === null ? null : execution - baseline;
}

function calculateDeltas(baseline: ExecutionEvaluationMetrics, execution: ExecutionEvaluationMetrics): ExecutionEvaluationDeltas {
	return {
		prematureCompletionCount: metricDelta(execution.prematureCompletionCount, baseline.prematureCompletionCount),
		unsupportedSuccessClaimCount: metricDelta(
			execution.unsupportedSuccessClaimCount,
			baseline.unsupportedSuccessClaimCount,
		),
		userCorrectionTurns: metricDelta(execution.userCorrectionTurns, baseline.userCorrectionTurns),
		relevantValidationCount: execution.relevantValidationCount - baseline.relevantValidationCount,
		unnecessaryValidationCount: execution.unnecessaryValidationCount - baseline.unnecessaryValidationCount,
		staleValidationCount: execution.staleValidationCount - baseline.staleValidationCount,
		failedValidationCount: execution.failedValidationCount - baseline.failedValidationCount,
		completionContinuationCount: execution.completionContinuationCount - baseline.completionContinuationCount,
		falseCompletionBlockCount: execution.falseCompletionBlockCount - baseline.falseCompletionBlockCount,
		turns: execution.turns - baseline.turns,
		toolCalls: execution.toolCalls - baseline.toolCalls,
		peakPromptTokens: execution.peakPromptTokens - baseline.peakPromptTokens,
		cumulativeTokens: execution.cumulativeTokens - baseline.cumulativeTokens,
		wallClockSessionSpanMs: metricDelta(execution.wallClockSessionSpanMs, baseline.wallClockSessionSpanMs),
		estimatedCost: metricDelta(execution.estimatedCost, baseline.estimatedCost),
		cacheReadTokens: execution.cacheReadTokens - baseline.cacheReadTokens,
		cacheWriteTokens: execution.cacheWriteTokens - baseline.cacheWriteTokens,
	};
}

function createPair(baseline: ExecutionEvaluationRun, execution: ExecutionEvaluationRun): ExecutionEvaluationPair {
	requireSamePairContext(baseline, execution);
	const correctnessRegression = baseline.metrics.outcome === "pass" && execution.metrics.outcome === "fail";
	const prematureCompletionRegression =
		baseline.metrics.prematureCompletionCount !== null &&
		execution.metrics.prematureCompletionCount !== null &&
		execution.metrics.prematureCompletionCount > baseline.metrics.prematureCompletionCount;
	const unsupportedSuccessClaimRegression =
		baseline.metrics.unsupportedSuccessClaimCount !== null &&
		execution.metrics.unsupportedSuccessClaimCount !== null &&
		execution.metrics.unsupportedSuccessClaimCount > baseline.metrics.unsupportedSuccessClaimCount;
	const annotationMissing = ANNOTATED_COUNT_KEYS.some(
		(key) => baseline.metrics[key] === null || execution.metrics[key] === null,
	);
	const unknownCorrectness = baseline.metrics.outcome === "unknown" || execution.metrics.outcome === "unknown";
	const blocked = correctnessRegression || prematureCompletionRegression || unsupportedSuccessClaimRegression;
	const status: ExecutionEvaluationDecision = blocked
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
	if (execution.metrics.falseCompletionBlockCount > 0) {
		limitations.push("False completion blocks are reported for review and do not by themselves establish a quality improvement.");
	}
	limitations.push(...(baseline.limitations ?? []), ...(execution.limitations ?? []));

	return {
		workloadId: baseline.workloadId,
		trialId: baseline.trialId,
		baseline,
		execution,
		correctnessRegression,
		prematureCompletionRegression,
		unsupportedSuccessClaimRegression,
		falseCompletionBlockCount: execution.metrics.falseCompletionBlockCount,
		status,
		deltas: calculateDeltas(baseline.metrics, execution.metrics),
		limitations: [...new Set(limitations)],
	};
}

/** Compare recorded baseline and treatment runs without invoking a provider or modifying runtime policy. */
export function compareExecutionEvaluationRuns(
	baselineRuns: readonly ExecutionEvaluationRun[],
	executionRuns: readonly ExecutionEvaluationRun[],
): ExecutionEvaluationReport {
	if (baselineRuns.length === 0 || executionRuns.length === 0) throw new Error("baseline and execution runs must both be non-empty");
	const baselineByWorkload = indexRuns(baselineRuns, "baseline");
	const executionByWorkload = indexRuns(executionRuns, "execution");
	for (const [key, baseline] of baselineByWorkload) {
		if (!executionByWorkload.has(key)) throw new Error(`missing execution run for ${baseline.workloadId}/${baseline.trialId}`);
	}
	for (const [key, execution] of executionByWorkload) {
		if (!baselineByWorkload.has(key)) throw new Error(`missing baseline run for ${execution.workloadId}/${execution.trialId}`);
	}

	const pairs = Array.from(baselineByWorkload.values()).map((baseline) => {
		const execution = executionByWorkload.get(evaluationPairKey(baseline));
		if (!execution) throw new Error(`missing execution run for ${baseline.workloadId}/${baseline.trialId}`);
		return createPair(baseline, execution);
	});
	const decision: ExecutionEvaluationDecision = pairs.some((pair) => pair.status === "blocked")
		? "blocked"
		: pairs.some((pair) => pair.status === "inconclusive")
			? "inconclusive"
			: "pass";

	return {
		schemaVersion: EXECUTION_EVALUATION_SCHEMA_VERSION,
		evaluationType: EXECUTION_EVALUATION_TYPE,
		baselineVariant: "baseline",
		executionVariant: "execution",
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
	executionPath?: string;
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
		if (argument === "--baseline" || argument === "--execution") {
			const value = argv[index + 1];
			if (!value) throw new Error(`${argument} requires a path`);
			if (argument === "--baseline") result.baselinePath = value;
			else result.executionPath = value;
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	return result;
}

function loadInput(path: string, expectedVariant: ExecutionEvaluationVariant): ExecutionEvaluationInput {
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(path, "utf8")) as unknown;
	} catch (error) {
		throw new Error(`Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
	const input = parseExecutionEvaluationInput(value);
	if (input.variant !== expectedVariant) throw new Error(`${path} must contain variant ${expectedVariant}`);
	return input;
}

function printHumanReport(report: ExecutionEvaluationReport): string {
	const lines = [
		`${report.evaluationType}: decision=${report.decision}, efficiencyClaim=${report.efficiencyClaim}, pairs=${report.pairs.length}`,
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
		"Usage: npm run evaluate:execution -- --baseline PATH --execution PATH [--json]",
		"",
		"Compares paired, recorded Execution runs without invoking a provider or executing validation commands.",
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
			if (!argumentsValue.baselinePath || !argumentsValue.executionPath) {
				throw new Error("--baseline and --execution are required");
			}
			const baseline = loadInput(argumentsValue.baselinePath, "baseline");
			const execution = loadInput(argumentsValue.executionPath, "execution");
			const report = compareExecutionEvaluationRuns(baseline.runs, execution.runs);
			process.stdout.write(argumentsValue.json ? `${JSON.stringify(report, null, 2)}\n` : printHumanReport(report));
		}
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
