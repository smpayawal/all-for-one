import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	ExecutionIntegrityTracker,
	type ExecutionIntegrityDecision,
	type ExecutionIntegritySnapshot,
	type ExecutionToolObservation,
} from "../packages/coding-agent/src/core/execution-integrity.ts";
import type {
	ValidationCommand,
	ValidationCommandDiscovery,
	ValidationExecutionProvenance,
} from "../packages/coding-agent/src/core/validation-commands.ts";

export const EXECUTION_SCENARIO_IDS = [
	"read-only-completion",
	"mutation-without-validation",
	"mutation-then-pass",
	"pass-then-mutation",
	"mutation-then-failure",
	"parallel-mutation-validation",
	"unknown-project",
	"compound-command",
	"bounded-continuation",
	"bounded-records",
] as const;

export type ExecutionScenarioId = (typeof EXECUTION_SCENARIO_IDS)[number];

export interface ExecutionScenarioReport {
	id: ExecutionScenarioId;
	description: string;
	executionStatus: "deterministic-fixture";
	decision: ExecutionIntegrityDecision;
	firstDecision?: ExecutionIntegrityDecision;
	mutationCount: number;
	mutationVersion: number;
	modifiedPathCount: number;
	recordedValidationCount: number;
	freshPassingValidationCount: number;
	freshFailingValidationCount: number;
	staleValidationCount: number;
	concurrentValidationCount: number;
	validationState: "none" | "missing" | "fresh" | "failed" | "stale" | "concurrent";
	continuationAttempts: number;
	limitations: string[];
}

export interface ExecutionBaselineReport {
	schemaVersion: 1;
	phase: "execution";
	title: "Execution integrity and adaptive validation baseline";
	settings: {
		mode: "enforce";
		maxContinuationAttempts: 1;
	};
	environment: {
		cwd: string;
		resourceLoading: "offline-deterministic-fixture";
		productionPolicyChanged: false;
	};
	scenarios: ExecutionScenarioReport[];
	limitations: string[];
}

export interface ExecutionBaselineOptions {
	cwd: string;
}

const SETTINGS = { mode: "enforce", maxContinuationAttempts: 1 } as const;

const VALIDATION_COMMAND: ValidationCommand = {
	kind: "test",
	command: "npm test",
	confidence: "verified",
	source: "fixture:package.json#scripts.test",
};

function discoveryWithCommand(command: ValidationCommand = VALIDATION_COMMAND): ValidationCommandDiscovery {
	return {
		ecosystems: ["node"],
		packageManager: "npm",
		packageManagers: ["npm"],
		commands: [command],
	};
}

function observation(
	toolCallId: string,
	toolName: string,
	args: Record<string, unknown>,
	options: { isError?: boolean; details?: unknown } = {},
): ExecutionToolObservation {
	return {
		toolCallId,
		toolName,
		args,
		isError: options.isError ?? false,
		details: options.details,
	};
}

function editObservation(index: number, path = `src/file-${index}.ts`): ExecutionToolObservation {
	return observation(`edit-${index}`, "edit", { path, edits: [] });
}

function validationObservation(
	index: number,
	cwd: string,
	command = VALIDATION_COMMAND.command,
	options: { isError?: boolean; exitCode?: number } = {},
): ExecutionToolObservation {
	const exitCode = options.exitCode ?? (options.isError ? 1 : 0);
	const executionProvenance: ValidationExecutionProvenance = {
		requestedCommand: command,
		executedCommand: command,
		cwd,
		executionKind: "local",
		exitCode,
	};
	return observation(
		`bash-${index}`,
		"bash",
		{ command },
		{
			isError: options.isError ?? false,
			details: { exitCode, executionProvenance },
		},
	);
}

function createTracker(cwd: string, discovery = discoveryWithCommand()): ExecutionIntegrityTracker {
	return new ExecutionIntegrityTracker({ settings: SETTINGS, cwd, discovery });
}

function validationState(snapshot: ExecutionIntegritySnapshot): ExecutionScenarioReport["validationState"] {
	if (snapshot.freshFailingValidationCount > 0) return "failed";
	if (snapshot.freshPassingValidationCount > 0) return "fresh";
	if (snapshot.concurrentValidationCount > 0) return "concurrent";
	if (snapshot.staleValidationCount > 0) return "stale";
	return snapshot.mutationCount > 0 ? "missing" : "none";
}

function createScenarioReport(
	id: ExecutionScenarioId,
	description: string,
	tracker: ExecutionIntegrityTracker,
	decision: ExecutionIntegrityDecision,
	firstDecision?: ExecutionIntegrityDecision,
): ExecutionScenarioReport {
	const snapshot = tracker.getSnapshot();
	return {
		id,
		description,
		executionStatus: "deterministic-fixture",
		decision,
		firstDecision,
		mutationCount: snapshot.mutationCount,
		mutationVersion: snapshot.mutationVersion,
		modifiedPathCount: snapshot.modifiedPaths.length,
		recordedValidationCount: snapshot.validations.length,
		freshPassingValidationCount: snapshot.freshPassingValidationCount,
		freshFailingValidationCount: snapshot.freshFailingValidationCount,
		staleValidationCount: snapshot.staleValidationCount,
		concurrentValidationCount: snapshot.concurrentValidationCount,
		validationState: validationState(snapshot),
		continuationAttempts: snapshot.continuationAttempts,
		limitations: [...snapshot.limitations],
	};
}

function readOnlyCompletion(cwd: string): ExecutionScenarioReport {
	const tracker = createTracker(cwd);
	return createScenarioReport(
		"read-only-completion",
		"A read-only task has no known built-in path mutation and is allowed to complete.",
		tracker,
		tracker.decideCompletion(),
	);
}

function mutationWithoutValidation(cwd: string): ExecutionScenarioReport {
	const tracker = createTracker(cwd);
	tracker.recordTurn({ turnIndex: 0, toolObservations: [editObservation(0)] });
	return createScenarioReport(
		"mutation-without-validation",
		"A successful edit has no matching validation result at the completion boundary.",
		tracker,
		tracker.decideCompletion(),
	);
}

function mutationThenPass(cwd: string): ExecutionScenarioReport {
	const tracker = createTracker(cwd);
	tracker.recordTurn({ turnIndex: 0, toolObservations: [editObservation(0)] });
	tracker.recordTurn({ turnIndex: 1, toolObservations: [validationObservation(1, cwd)] });
	return createScenarioReport(
		"mutation-then-pass",
		"A matching validation runs in a later turn and is fresh for the known mutation version.",
		tracker,
		tracker.decideCompletion(),
	);
}

function passThenMutation(cwd: string): ExecutionScenarioReport {
	const tracker = createTracker(cwd);
	tracker.recordTurn({ turnIndex: 0, toolObservations: [validationObservation(0, cwd)] });
	tracker.recordTurn({ turnIndex: 1, toolObservations: [editObservation(1)] });
	return createScenarioReport(
		"pass-then-mutation",
		"A later successful edit advances the mutation version and makes the earlier pass stale.",
		tracker,
		tracker.decideCompletion(),
	);
}

function mutationThenFailure(cwd: string): ExecutionScenarioReport {
	const tracker = createTracker(cwd);
	tracker.recordTurn({ turnIndex: 0, toolObservations: [editObservation(0)] });
	tracker.recordTurn({
		turnIndex: 1,
		toolObservations: [validationObservation(1, cwd, VALIDATION_COMMAND.command, { isError: true })],
	});
	return createScenarioReport(
		"mutation-then-failure",
		"A matching validation exits with an error after the mutation.",
		tracker,
		tracker.decideCompletion(),
	);
}

function parallelMutationValidation(cwd: string): ExecutionScenarioReport {
	const tracker = createTracker(cwd);
	tracker.recordTurn({
		turnIndex: 0,
		toolObservations: [editObservation(0), validationObservation(0, cwd)],
	});
	return createScenarioReport(
		"parallel-mutation-validation",
		"A mutation and matching validation in one completed tool batch are concurrent and not fresh evidence.",
		tracker,
		tracker.decideCompletion(),
	);
}

function unknownProject(cwd: string): ExecutionScenarioReport {
	const tracker = createTracker(cwd, { ecosystems: [], commands: [] });
	tracker.recordTurn({ turnIndex: 0, toolObservations: [editObservation(0)] });
	return createScenarioReport(
		"unknown-project",
		"A mutation in a project with no discovered validation command is not blocked.",
		tracker,
		tracker.decideCompletion(),
	);
}

function compoundCommand(cwd: string): ExecutionScenarioReport {
	const tracker = createTracker(cwd);
	tracker.recordTurn({ turnIndex: 0, toolObservations: [editObservation(0)] });
	tracker.recordTurn({
		turnIndex: 1,
		toolObservations: [validationObservation(1, cwd, "npm test && echo done")],
	});
	return createScenarioReport(
		"compound-command",
		"A compound shell command is rejected by the grounded matcher and does not become validation evidence.",
		tracker,
		tracker.decideCompletion(),
	);
}

function boundedContinuation(cwd: string): ExecutionScenarioReport {
	const tracker = createTracker(cwd);
	tracker.recordTurn({ turnIndex: 0, toolObservations: [editObservation(0)] });
	const firstDecision = tracker.decideCompletion();
	return createScenarioReport(
		"bounded-continuation",
		"Enforcement requests one hidden continuation and then allows completion at the configured limit.",
		tracker,
		tracker.decideCompletion(),
		firstDecision,
	);
}

function boundedRecords(cwd: string): ExecutionScenarioReport {
	const tracker = createTracker(cwd);
	tracker.recordTurn({
		turnIndex: 0,
		toolObservations: Array.from({ length: 140 }, (_, index) => editObservation(index)),
	});
	tracker.recordTurn({
		turnIndex: 1,
		toolObservations: Array.from({ length: 20 }, (_, index) => validationObservation(index, cwd)),
	});
	return createScenarioReport(
		"bounded-records",
		"Modified paths and validation evidence retain only their bounded newest records.",
		tracker,
		tracker.decideCompletion(),
	);
}

export function collectExecutionBaseline(options: ExecutionBaselineOptions): ExecutionBaselineReport {
	const cwd = resolve(options.cwd);
	return {
		schemaVersion: 1,
		phase: "execution",
		title: "Execution integrity and adaptive validation baseline",
		settings: SETTINGS,
		environment: {
			cwd,
			resourceLoading: "offline-deterministic-fixture",
			productionPolicyChanged: false,
		},
		scenarios: [
			readOnlyCompletion(cwd),
			mutationWithoutValidation(cwd),
			mutationThenPass(cwd),
			passThenMutation(cwd),
			mutationThenFailure(cwd),
			parallelMutationValidation(cwd),
			unknownProject(cwd),
			compoundCommand(cwd),
			boundedContinuation(cwd),
			boundedRecords(cwd),
		],
		limitations: [
			"This baseline is offline and model-free; it does not measure quality, latency, cost, or user correction behavior.",
			"Fixtures exercise recorded observations only and do not execute repository validation commands.",
			"A passing validation is evidence for the current known mutation version, not proof of complete task correctness.",
		],
	};
}

function parseArguments(argv: string[]): { cwd: string; json: boolean; help: boolean } {
	let cwd = process.cwd();
	let json = false;
	let help = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--json") {
			json = true;
			continue;
		}
		if (argument === "--help" || argument === "-h") {
			help = true;
			continue;
		}
		if (argument === "--cwd") {
			const value = argv[index + 1];
			if (!value) throw new Error("--cwd requires a path");
			cwd = value;
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	return { cwd, json, help };
}

function printHumanReport(report: ExecutionBaselineReport): string {
	const lines = [
		`${report.phase}: ${report.title}`,
		`Fixture mode: ${report.environment.resourceLoading}; settings=${report.settings.mode}/${report.settings.maxContinuationAttempts}`,
	];
	for (const scenario of report.scenarios) {
		lines.push(
			`${scenario.id}: ${scenario.decision.action}/${scenario.decision.reason}, mutations=${scenario.mutationCount}, validations=${scenario.recordedValidationCount}, state=${scenario.validationState}, continuations=${scenario.continuationAttempts}`,
		);
	}
	return `${lines.join("\n")}\n`;
}

function printHelp(): string {
	return [
		"Usage: npm run baseline:execution -- [--json] [--cwd PATH]",
		"",
		"Runs deterministic, offline Execution execution-integrity fixtures without a provider or repository validation commands.",
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
			const report = collectExecutionBaseline({ cwd: argumentsValue.cwd });
			process.stdout.write(argumentsValue.json ? `${JSON.stringify(report, null, 2)}\n` : printHumanReport(report));
		}
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
