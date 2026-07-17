import { formatPathRelativeToCwdOrAbsolute, resolvePath } from "../utils/paths.ts";
import type { CustomMessage } from "./messages.ts";
import { getPathScopedToolPaths, isMutatingPathTool } from "./scoped-context.ts";
import {
	fingerprintValidationCommandDiscovery,
	matchValidationCommandWithScope,
	VALIDATION_DISCOVERY_INPUT_FILES,
	type ValidationCommand,
	type ValidationCommandConfidence,
	type ValidationCommandDiscovery,
	type ValidationCommandKind,
	type ValidationCommandMatchScope,
	type ValidationExecutionProvenance,
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
export const MAX_EXECUTION_INTEGRITY_DIAGNOSTIC_CHARS = 512;

const MAX_EXECUTION_INTEGRITY_DISCOVERED_COMMANDS = 32;
const MAX_EXECUTION_INTEGRITY_LIMITATIONS = 16;
const ARBITRARY_BASH_LIMITATION =
	"Arbitrary bash commands may mutate the workspace and are not fully classified by the execution-integrity boundary.";

export type ValidationEvidenceStatus = "passed" | "failed" | "unverified" | "concurrent-with-mutation";

export interface ExecutionToolObservation {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	isError: boolean;
	details?: unknown;
}

export interface ExecutionIntegrityUserValidationContext {
	mutationVersionAtStart: number;
	mutationVersionAtEnd: number;
	agentStreamingAtStart: boolean;
	pendingMutationAtStart: boolean;
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
	scope: ValidationCommandMatchScope;
	discoveryFingerprint: string;
	status: ValidationEvidenceStatus;
	turnIndex: number;
	mutationVersion: number;
	fullOutputPath?: string;
	executionProvenance?: ValidationExecutionProvenance;
	agentStreamingAtStart?: boolean;
	pendingMutationAtStart?: boolean;
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
	unverifiedValidationCount: number;
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

function normalizeBoundedDiagnostic(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const sanitized = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim();
	return sanitized ? sanitized.slice(0, MAX_EXECUTION_INTEGRITY_DIAGNOSTIC_CHARS) : undefined;
}

function normalizeRequiredDiagnostic(value: string): string {
	return normalizeBoundedDiagnostic(value) ?? "";
}

function getExecutionProvenance(details: unknown): ValidationExecutionProvenance | undefined {
	if (!isRecord(details) || !isRecord(details.executionProvenance)) return undefined;
	return normalizeExecutionProvenance(details.executionProvenance);
}

function normalizeExecutionProvenance(value: unknown): ValidationExecutionProvenance | undefined {
	if (!isRecord(value)) return undefined;
	const requestedCommand =
		typeof value.requestedCommand === "string" ? normalizeBoundedDiagnostic(value.requestedCommand) : undefined;
	const executedCommand =
		typeof value.executedCommand === "string" ? normalizeBoundedDiagnostic(value.executedCommand) : undefined;
	const cwd = typeof value.cwd === "string" ? normalizeBoundedDiagnostic(value.cwd) : undefined;
	const executionKind = value.executionKind;
	const exitCode = value.exitCode;
	if (
		!requestedCommand ||
		!executedCommand ||
		!cwd ||
		(executionKind !== "local" && executionKind !== "custom" && executionKind !== "remote") ||
		(exitCode !== null && (typeof exitCode !== "number" || !Number.isInteger(exitCode)))
	) {
		return undefined;
	}
	return {
		requestedCommand,
		executedCommand,
		cwd,
		executionKind,
		exitCode,
	};
}

function hasFreshLocalProvenance(
	provenance: ValidationExecutionProvenance | undefined,
	requestedCommand: string,
	cwd: string,
	cancelled: boolean,
): provenance is ValidationExecutionProvenance {
	return (
		provenance !== undefined &&
		provenance.requestedCommand === requestedCommand &&
		provenance.requestedCommand === provenance.executedCommand &&
		provenance.executionKind === "local" &&
		provenance.cwd === cwd &&
		provenance.exitCode === 0 &&
		!cancelled
	);
}

function getValidationStatus(
	observation: ExecutionToolObservation,
	requestedCommand: string,
	scope: ValidationCommandMatchScope,
	cwd: string,
	mutationOverlapped: boolean,
): { status: ValidationEvidenceStatus; executionProvenance?: ValidationExecutionProvenance } {
	const provenance = getExecutionProvenance(observation.details);
	if (mutationOverlapped) return { status: "concurrent-with-mutation", executionProvenance: provenance };
	const cancelled = isRecord(observation.details) && observation.details.cancelled === true;
	if (observation.isError || cancelled || (provenance !== undefined && provenance.exitCode !== 0)) {
		return { status: "failed", executionProvenance: provenance };
	}
	return {
		status:
			scope !== "exact" || !provenance || !hasFreshLocalProvenance(provenance, requestedCommand, cwd, cancelled)
				? "unverified"
				: "passed",
		executionProvenance: provenance,
	};
}

function getFullOutputPath(details: unknown): string | undefined {
	if (!isRecord(details)) return undefined;
	const fullOutputPath = details.fullOutputPath;
	return typeof fullOutputPath === "string" ? normalizeBoundedDiagnostic(fullOutputPath) : undefined;
}

function isValidationDiscoveryInputPath(rawPath: string, cwd: string): boolean {
	const normalizedPath = normalizeBoundedDiagnostic(rawPath);
	if (!normalizedPath) return false;
	let comparablePath = normalizedPath.replaceAll("\\", "/");
	try {
		comparablePath = formatPathRelativeToCwdOrAbsolute(
			resolvePath(normalizedPath, cwd, { trim: true, normalizeUnicodeSpaces: true, stripAtPrefix: true }),
			cwd,
		).replaceAll("\\", "/");
	} catch {
		// Compare the bounded tool-provided path when normalization is unavailable.
	}
	return VALIDATION_DISCOVERY_INPUT_FILES.some(
		(file) => comparablePath === file || comparablePath.endsWith(`/${file}`),
	);
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
	private discoveryFingerprint: string;
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
		this.discoveryFingerprint = fingerprintValidationCommandDiscovery(this.discovery);
		this.resetRun();
	}

	updateSettings(settings: ExecutionIntegritySettings): void {
		this.settings = normalizeExecutionIntegritySettings(settings);
	}

	updateDiscovery(discovery: ValidationCommandDiscovery): void {
		const limitedDiscovery = this.limitDiscovery(discovery);
		const nextFingerprint = fingerprintValidationCommandDiscovery(limitedDiscovery);
		const changed = nextFingerprint !== this.discoveryFingerprint;
		this.discovery = limitedDiscovery;
		this.discoveryFingerprint = nextFingerprint;
		if (this.settings.mode !== "off") {
			this.addLimitation(
				changed
					? "Validation command discovery changed; prior validation evidence is stale."
					: "Validation command discovery was refreshed; unchanged fingerprints remain configuration-sensitive.",
			);
		}
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

	recordTurn(turn: ExecutionIntegrityTurn): boolean {
		if (this.settings.mode === "off") return false;
		let validationManifestMutated = false;

		const successfulMutations = turn.toolObservations.filter(
			(observation) => isMutatingPathTool(observation.toolName) && !observation.isError,
		);
		for (const observation of successfulMutations) {
			this.mutationVersion += 1;
			this.mutationCount += 1;
			for (const rawPath of getPathScopedToolPaths(observation.toolName, observation.args)) {
				if (isValidationDiscoveryInputPath(rawPath, this.cwd)) validationManifestMutated = true;
				this.recordModifiedPath(rawPath);
			}
		}

		for (const observation of turn.toolObservations) {
			const command = getCommand(observation);
			if (!command) continue;
			const discovered = matchValidationCommandWithScope(command, this.discovery);
			if (!discovered) continue;
			const validationStatus = getValidationStatus(
				observation,
				command,
				discovered.scope,
				this.cwd,
				successfulMutations.length > 0,
			);

			this.recordValidation({
				command: normalizeRequiredDiagnostic(discovered.command.command),
				kind: discovered.command.kind,
				confidence: discovered.command.confidence,
				source: normalizeRequiredDiagnostic(discovered.command.source),
				scope: discovered.scope,
				discoveryFingerprint: this.discoveryFingerprint,
				status: validationStatus.status,
				turnIndex: turn.turnIndex,
				mutationVersion: this.mutationVersion,
				fullOutputPath: getFullOutputPath(observation.details),
				executionProvenance: validationStatus.executionProvenance,
			});
		}
		return validationManifestMutated;
	}

	recordUserBashValidation(
		command: string,
		result: {
			exitCode: number | undefined;
			cancelled: boolean;
			fullOutputPath?: string;
			executionProvenance?: ValidationExecutionProvenance;
		},
		turnIndex: number,
		context?: ExecutionIntegrityUserValidationContext,
	): void {
		if (this.settings.mode === "off") return;
		const discovered = matchValidationCommandWithScope(command, this.discovery);
		if (!discovered) return;
		const mutationOverlapped =
			context?.pendingMutationAtStart === true ||
			(context !== undefined && context.mutationVersionAtStart !== context.mutationVersionAtEnd);
		const executionProvenance = normalizeExecutionProvenance(result.executionProvenance);
		const status = mutationOverlapped
			? "concurrent-with-mutation"
			: result.cancelled || result.exitCode !== 0
				? "failed"
				: discovered.scope === "exact" &&
						hasFreshLocalProvenance(executionProvenance, command, this.cwd, result.cancelled)
					? "passed"
					: "unverified";
		this.recordValidation({
			command: normalizeRequiredDiagnostic(discovered.command.command),
			kind: discovered.command.kind,
			confidence: discovered.command.confidence,
			source: normalizeRequiredDiagnostic(discovered.command.source),
			scope: discovered.scope,
			discoveryFingerprint: this.discoveryFingerprint,
			status,
			turnIndex,
			mutationVersion: this.mutationVersion,
			fullOutputPath: normalizeBoundedDiagnostic(result.fullOutputPath),
			executionProvenance,
			agentStreamingAtStart: context?.agentStreamingAtStart,
			pendingMutationAtStart: context?.pendingMutationAtStart,
		});
	}

	decideCompletion(): ExecutionIntegrityDecision {
		if (this.settings.mode === "off") return this.setDecision({ action: "allow", reason: "mode-off" });
		if (this.mutationCount === 0) return this.setDecision({ action: "allow", reason: "no-known-mutation" });
		if (this.discovery.commands.length === 0) {
			this.addLimitation("No validation command was discovered; completion is not blocked by this boundary.");
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
				unverifiedValidationCount: 0,
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
			unverifiedValidationCount: currentState.unverifiedValidationCount,
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
		const normalizedPath = normalizeBoundedDiagnostic(rawPath);
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
		path = normalizeBoundedDiagnostic(path) ?? normalizedPath;
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
		unverifiedValidationCount: number;
		staleValidationCount: number;
		concurrentValidationCount: number;
	} {
		const latestExactByCommand = new Map<string, ValidationEvidence>();
		const latestTargetedByExecutedCommand = new Map<string, ValidationEvidence>();
		for (const validation of this.validations) {
			if (validation.scope === "exact") {
				latestExactByCommand.set(validation.command, validation);
				continue;
			}
			const executedCommand = validation.executionProvenance?.executedCommand ?? validation.command;
			latestTargetedByExecutedCommand.set(executedCommand, validation);
		}

		let freshPassingValidationCount = 0;
		let freshFailingValidationCount = 0;
		let unverifiedValidationCount = 0;
		let staleValidationCount = 0;
		let concurrentValidationCount = 0;
		unverifiedValidationCount += latestTargetedByExecutedCommand.size;
		for (const validation of latestExactByCommand.values()) {
			if (validation.status === "unverified") {
				unverifiedValidationCount += 1;
				continue;
			}
			if (validation.discoveryFingerprint !== this.discoveryFingerprint) {
				staleValidationCount += 1;
				continue;
			}
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
			unverifiedValidationCount,
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
