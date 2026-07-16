import { formatPathRelativeToCwdOrAbsolute, resolvePath } from "../utils/paths.ts";
import type { CustomMessage } from "./messages.ts";
import { getPathScopedToolPaths, isMutatingPathTool } from "./scoped-context.ts";
import {
	matchValidationCommand,
	type ValidationCommand,
	type ValidationCommandConfidence,
	type ValidationCommandDiscovery,
	type ValidationCommandKind,
} from "./validation-commands.ts";

export type ExecutionIntegrityMode = "off" | "observe" | "enforce";

export interface ExecutionIntegritySettings {
	mode?: ExecutionIntegrityMode;
	maxContinuationAttempts?: number;
}

export interface NormalizedExecutionIntegritySettings {
	mode: ExecutionIntegrityMode;
	maxContinuationAttempts: number;
}

export const MAX_EXECUTION_INTEGRITY_MODIFIED_PATHS = 128;
export const MAX_EXECUTION_INTEGRITY_VALIDATIONS = 16;
export const MAX_EXECUTION_INTEGRITY_CONTINUATION_ATTEMPTS = 2;
export const MAX_EXECUTION_INTEGRITY_FEEDBACK_CHARS = 2_000;

const MAX_EXECUTION_INTEGRITY_DISCOVERED_COMMANDS = 32;
const MAX_EXECUTION_INTEGRITY_LIMITATIONS = 16;
const ARBITRARY_BASH_LIMITATION =
	"Arbitrary bash commands may mutate the workspace and are not fully classified by Phase 6.";

export type ValidationEvidenceStatus = "passed" | "failed" | "concurrent-with-mutation";

export interface ExecutionToolObservation {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	isError: boolean;
	details?: unknown;
}

export interface ExecutionIntegrityTurn {
	turnIndex: number;
	toolObservations: readonly ExecutionToolObservation[];
}

export interface ValidationEvidence {
	command: string;
	kind: ValidationCommandKind;
	confidence: ValidationCommandConfidence;
	source: string;
	status: ValidationEvidenceStatus;
	turnIndex: number;
	mutationVersion: number;
	fullOutputPath?: string;
}

export type CompletionDecisionReason =
	| "mode-off"
	| "no-known-mutation"
	| "no-validation-command"
	| "fresh-validation-passed"
	| "validation-missing"
	| "validation-stale"
	| "validation-failed"
	| "validation-concurrent-with-mutation"
	| "continuation-limit-reached";

export interface ExecutionIntegrityDecision {
	action: "allow" | "observe" | "continue";
	reason: CompletionDecisionReason;
	message?: string;
}

export interface ExecutionIntegrityFeedbackDetails {
	reason: CompletionDecisionReason;
	mutationVersion: number;
	continuationAttempt: number;
}

export interface ExecutionIntegritySnapshot {
	mode: ExecutionIntegrityMode;
	maxContinuationAttempts: number;
	mutationVersion: number;
	mutationCount: number;
	modifiedPaths: string[];
	discoveredValidationCommands: ValidationCommand[];
	validations: ValidationEvidence[];
	freshPassingValidationCount: number;
	freshFailingValidationCount: number;
	staleValidationCount: number;
	concurrentValidationCount: number;
	continuationAttempts: number;
	lastDecision?: ExecutionIntegrityDecision;
	limitations: string[];
}

export interface ExecutionIntegrityTrackerOptions {
	settings: ExecutionIntegritySettings;
	cwd: string;
	discovery: ValidationCommandDiscovery;
}

export function normalizeExecutionIntegritySettings(
	settings?: ExecutionIntegritySettings,
): NormalizedExecutionIntegritySettings {
	const mode = settings?.mode === "observe" || settings?.mode === "enforce" ? settings.mode : "off";
	const configuredAttempts = settings?.maxContinuationAttempts;
	const maxContinuationAttempts =
		configuredAttempts === undefined
			? 1
			: typeof configuredAttempts === "number" && Number.isFinite(configuredAttempts)
				? Math.min(MAX_EXECUTION_INTEGRITY_CONTINUATION_ATTEMPTS, Math.max(0, Math.floor(configuredAttempts)))
				: 1;

	return { mode, maxContinuationAttempts };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCommand(command: string): string {
	return command.trim().replace(/\s+/g, " ");
}

function getExitCode(details: unknown): number | null | undefined {
	if (!isRecord(details) || !("exitCode" in details)) return undefined;
	const exitCode = details.exitCode;
	return typeof exitCode === "number" || exitCode === null ? exitCode : undefined;
}

function isSuccessfulValidation(observation: ExecutionToolObservation): boolean {
	if (observation.isError) return false;
	if (isRecord(observation.details) && observation.details.cancelled === true) return false;
	const exitCode = getExitCode(observation.details);
	if (exitCode !== undefined) return exitCode === 0;
	return true;
}

function getFullOutputPath(details: unknown): string | undefined {
	if (!isRecord(details)) return undefined;
	const fullOutputPath = details.fullOutputPath;
	return typeof fullOutputPath === "string" && fullOutputPath.trim().length > 0 ? fullOutputPath.trim() : undefined;
}

function getCommand(observation: ExecutionToolObservation): string | undefined {
	if (observation.toolName !== "bash") return undefined;
	const command = observation.args.command;
	return typeof command === "string" && command.trim().length > 0 ? command : undefined;
}

export class ExecutionIntegrityTracker {
	private settings: NormalizedExecutionIntegritySettings;
	private readonly cwd: string;
	private discovery: ValidationCommandDiscovery;
	private mutationVersion = 0;
	private mutationCount = 0;
	private modifiedPaths: string[] = [];
	private validations: ValidationEvidence[] = [];
	private continuationAttempts = 0;
	private lastDecision: ExecutionIntegrityDecision | undefined;
	private limitations: string[] = [];

	constructor(options: ExecutionIntegrityTrackerOptions) {
		this.settings = normalizeExecutionIntegritySettings(options.settings);
		this.cwd = options.cwd;
		this.discovery = this.limitDiscovery(options.discovery);
		this.resetRun();
	}

	updateSettings(settings: ExecutionIntegritySettings): void {
		this.settings = normalizeExecutionIntegritySettings(settings);
	}

	updateDiscovery(discovery: ValidationCommandDiscovery): void {
		this.discovery = this.limitDiscovery(discovery);
		if (this.settings.mode !== "off" && discovery.commands.length > MAX_EXECUTION_INTEGRITY_DISCOVERED_COMMANDS) {
			this.addLimitation("The discovered validation command list was bounded for execution-integrity diagnostics.");
		}
	}

	resetRun(): void {
		this.mutationVersion = 0;
		this.mutationCount = 0;
		this.modifiedPaths = [];
		this.validations = [];
		this.continuationAttempts = 0;
		this.lastDecision = undefined;
		this.limitations = [];
		if (this.settings.mode !== "off") {
			this.addLimitation(ARBITRARY_BASH_LIMITATION);
		}
	}

	recordTurn(turn: ExecutionIntegrityTurn): void {
		if (this.settings.mode === "off") return;

		const successfulMutations = turn.toolObservations.filter(
			(observation) => isMutatingPathTool(observation.toolName) && !observation.isError,
		);
		for (const observation of successfulMutations) {
			this.mutationVersion += 1;
			this.mutationCount += 1;
			for (const rawPath of getPathScopedToolPaths(observation.toolName, observation.args)) {
				this.recordModifiedPath(rawPath);
			}
		}

		for (const observation of turn.toolObservations) {
			const command = getCommand(observation);
			if (!command) continue;
			const discovered = matchValidationCommand(command, this.discovery);
			if (!discovered) continue;

			this.recordValidation({
				command: normalizeCommand(discovered.command),
				kind: discovered.kind,
				confidence: discovered.confidence,
				source: discovered.source,
				status:
					successfulMutations.length > 0
						? "concurrent-with-mutation"
						: isSuccessfulValidation(observation)
							? "passed"
							: "failed",
				turnIndex: turn.turnIndex,
				mutationVersion: this.mutationVersion,
				fullOutputPath: getFullOutputPath(observation.details),
			});
		}
	}

	recordUserBashValidation(
		command: string,
		result: { exitCode: number | undefined; cancelled: boolean; fullOutputPath?: string },
		turnIndex: number,
	): void {
		if (this.settings.mode === "off") return;
		this.recordTurn({
			turnIndex,
			toolObservations: [
				{
					toolCallId: `user-bash-${turnIndex}-${this.validations.length}`,
					toolName: "bash",
					args: { command },
					isError: result.cancelled || result.exitCode !== 0,
					details: result,
				},
			],
		});
	}

	decideCompletion(): ExecutionIntegrityDecision {
		if (this.settings.mode === "off") return this.setDecision({ action: "allow", reason: "mode-off" });
		if (this.mutationCount === 0) return this.setDecision({ action: "allow", reason: "no-known-mutation" });
		if (this.discovery.commands.length === 0) {
			this.addLimitation("No validation command was discovered; completion is not blocked by Phase 6.");
			return this.setDecision({ action: "observe", reason: "no-validation-command" });
		}

		const state = this.getCurrentValidationState();
		const reason = state.reason;
		if (this.settings.mode === "observe") return this.setDecision({ action: "observe", reason });
		if (state.reason === "fresh-validation-passed") {
			return this.setDecision({ action: "allow", reason: "fresh-validation-passed" });
		}
		if (this.continuationAttempts < this.settings.maxContinuationAttempts) {
			this.continuationAttempts += 1;
			return this.setDecision({ action: "continue", reason });
		}
		return this.setDecision({ action: "allow", reason: "continuation-limit-reached" });
	}

	createFeedbackMessage(): CustomMessage<ExecutionIntegrityFeedbackDetails> {
		const decision = this.lastDecision ?? { action: "observe", reason: "validation-missing" as const };
		const content = this.feedbackContent(decision.reason).slice(0, MAX_EXECUTION_INTEGRITY_FEEDBACK_CHARS);
		return {
			role: "custom",
			customType: "execution-integrity-feedback",
			content,
			display: false,
			details: {
				reason: decision.reason,
				mutationVersion: this.mutationVersion,
				continuationAttempt: this.continuationAttempts,
			},
			timestamp: Date.now(),
		};
	}

	getSnapshot(): ExecutionIntegritySnapshot {
		if (this.settings.mode === "off") {
			return {
				mode: "off",
				maxContinuationAttempts: this.settings.maxContinuationAttempts,
				mutationVersion: 0,
				mutationCount: 0,
				modifiedPaths: [],
				discoveredValidationCommands: [],
				validations: [],
				freshPassingValidationCount: 0,
				freshFailingValidationCount: 0,
				staleValidationCount: 0,
				concurrentValidationCount: 0,
				continuationAttempts: 0,
				limitations: [],
			};
		}

		const currentState = this.getCurrentValidationState();
		return {
			mode: this.settings.mode,
			maxContinuationAttempts: this.settings.maxContinuationAttempts,
			mutationVersion: this.mutationVersion,
			mutationCount: this.mutationCount,
			modifiedPaths: [...this.modifiedPaths],
			discoveredValidationCommands: this.discovery.commands.map((command) => ({ ...command })),
			validations: this.validations.map((validation) => ({ ...validation })),
			freshPassingValidationCount: currentState.freshPassingValidationCount,
			freshFailingValidationCount: currentState.freshFailingValidationCount,
			staleValidationCount: currentState.staleValidationCount,
			concurrentValidationCount: currentState.concurrentValidationCount,
			continuationAttempts: this.continuationAttempts,
			lastDecision: this.lastDecision ? { ...this.lastDecision } : undefined,
			limitations: [...this.limitations],
		};
	}

	private limitDiscovery(discovery: ValidationCommandDiscovery): ValidationCommandDiscovery {
		return {
			ecosystems: [...discovery.ecosystems],
			packageManager: discovery.packageManager,
			packageManagers: discovery.packageManagers ? [...discovery.packageManagers] : undefined,
			commands: discovery.commands
				.slice(0, MAX_EXECUTION_INTEGRITY_DISCOVERED_COMMANDS)
				.map((command) => ({ ...command })),
		};
	}

	private setDecision(decision: ExecutionIntegrityDecision): ExecutionIntegrityDecision {
		this.lastDecision = decision;
		return decision;
	}

	private recordModifiedPath(rawPath: string): void {
		const normalizedPath = rawPath.trim();
		if (!normalizedPath) return;
		let path = normalizedPath;
		try {
			path = formatPathRelativeToCwdOrAbsolute(
				resolvePath(normalizedPath, this.cwd, {
					trim: true,
					normalizeUnicodeSpaces: true,
					stripAtPrefix: true,
				}),
				this.cwd,
			);
		} catch {
			// Keep the tool-provided path when a platform-specific path cannot be normalized.
		}
		if (this.modifiedPaths.includes(path)) return;
		this.modifiedPaths.push(path);
		if (this.modifiedPaths.length > MAX_EXECUTION_INTEGRITY_MODIFIED_PATHS) {
			this.modifiedPaths = this.modifiedPaths.slice(-MAX_EXECUTION_INTEGRITY_MODIFIED_PATHS);
			this.addLimitation("The modified-path diagnostic reached its bound; older paths were evicted.");
		}
	}

	private recordValidation(validation: ValidationEvidence): void {
		this.validations.push(validation);
		if (this.validations.length > MAX_EXECUTION_INTEGRITY_VALIDATIONS) {
			this.validations = this.validations.slice(-MAX_EXECUTION_INTEGRITY_VALIDATIONS);
			this.addLimitation("The validation diagnostic reached its bound; older records were evicted.");
		}
	}

	private addLimitation(limitation: string): void {
		if (this.limitations.includes(limitation) || this.limitations.length >= MAX_EXECUTION_INTEGRITY_LIMITATIONS)
			return;
		this.limitations.push(limitation);
	}

	private getCurrentValidationState(): {
		reason: Exclude<
			CompletionDecisionReason,
			"mode-off" | "no-known-mutation" | "no-validation-command" | "continuation-limit-reached"
		>;
		freshPassingValidationCount: number;
		freshFailingValidationCount: number;
		staleValidationCount: number;
		concurrentValidationCount: number;
	} {
		const latest = new Map<string, ValidationEvidence>();
		for (const validation of this.validations) latest.set(validation.command, validation);

		let freshPassingValidationCount = 0;
		let freshFailingValidationCount = 0;
		let staleValidationCount = 0;
		let concurrentValidationCount = 0;
		for (const validation of latest.values()) {
			if (validation.mutationVersion !== this.mutationVersion) {
				staleValidationCount += 1;
				continue;
			}
			if (validation.status === "concurrent-with-mutation") {
				concurrentValidationCount += 1;
			} else if (validation.status === "passed") {
				freshPassingValidationCount += 1;
			} else {
				freshFailingValidationCount += 1;
			}
		}

		const reason =
			freshFailingValidationCount > 0
				? "validation-failed"
				: freshPassingValidationCount > 0
					? "fresh-validation-passed"
					: concurrentValidationCount > 0
						? "validation-concurrent-with-mutation"
						: staleValidationCount > 0
							? "validation-stale"
							: "validation-missing";

		return {
			reason,
			freshPassingValidationCount,
			freshFailingValidationCount,
			staleValidationCount,
			concurrentValidationCount,
		};
	}

	private feedbackContent(reason: CompletionDecisionReason): string {
		const alternative =
			"Validation may be prohibited by the user, unsupported by the environment, unavailable, or disproportionate; report the limitation accurately instead of running an unrelated or expensive check.";
		switch (reason) {
			case "validation-stale":
				return `Execution-integrity check: validation was recorded before later file changes, so that evidence is stale. Re-run the most relevant focused validation if permitted, or clearly report that the latest changes remain unverified. ${alternative}`;
			case "validation-failed":
				return `Execution-integrity check: the latest relevant validation failed. Determine whether the failure is caused by the current change, pre-existing, unrelated, or still unknown. Fix only related issues, or clearly report the unresolved limitation. ${alternative}`;
			case "validation-concurrent-with-mutation":
				return `Execution-integrity check: mutation and validation were issued in the same tool batch, so execution order is not reliable evidence that validation covered the final files. Re-run a focused validation in a later turn if useful and permitted. ${alternative}`;
			default:
				return `Execution-integrity check: this run changed files, but no fresh matching validation result is recorded. Run the most relevant focused validation if it is permitted and useful. Otherwise, clearly state why validation was not run and what remains unverified. Do not run unrelated or disproportionately expensive checks. ${alternative}`;
		}
	}
}
