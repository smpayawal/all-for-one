import type { StreamFn, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai/compat";
import type { SessionEntry } from "../session-manager.ts";
import {
	compactWithTurnPrefixInstructions,
	type CompactionPreparation,
	type CompactionResult,
} from "./compaction.ts";
import type { CompactionTelemetryRecorder } from "./telemetry.ts";
import { assertCompactionResultValid, validateCompactionResult } from "./validation.ts";

const REPAIRABLE_COMPACTION_ISSUES = new Set([
	"summary-empty",
	"summary-too-large",
	"missing-section",
	"duplicate-section",
	"empty-goal",
]);

function formatCompactionRepairInstructions(issues: readonly { message: string; code: string }[]): string {
	return [
		"The previous native compaction summary failed deterministic structural validation.",
		"Repair the summary using the following issues:",
		...issues.map((issue) => `- ${issue.message}`),
		"Preserve valid content, remove stale content, and return only the required structured summary.",
	].join("\n");
}

/**
 * Run native Pi compaction with All-For-One's deterministic validation and one bounded repair attempt.
 *
 * Keeping this policy inside the compaction package prevents session orchestration from owning
 * compaction-specific validation details while preserving the existing native compaction call path.
 */
export async function compactWithValidationAndRepair(
	preparation: CompactionPreparation,
	pathEntries: SessionEntry[],
	model: Model<any>,
	apiKey: string | undefined,
	headers: Record<string, string> | undefined,
	customInstructions: string | undefined,
	signal: AbortSignal,
	thinkingLevel: ThinkingLevel,
	streamFn: StreamFn,
	env: Record<string, string> | undefined,
	telemetry?: CompactionTelemetryRecorder,
): Promise<CompactionResult> {
	const run = (instructions?: string, turnPrefixRepairInstructions?: string) =>
		compactWithTurnPrefixInstructions(
			preparation,
			model,
			apiKey,
			headers,
			instructions,
			signal,
			thinkingLevel,
			streamFn,
			env,
			turnPrefixRepairInstructions,
		);

	let initialResult: CompactionResult;
	try {
		initialResult = await run(customInstructions);
	} catch (error) {
		if (!(error instanceof Error) || !error.message.includes("turn-prefix summary is malformed")) throw error;
		telemetry?.recordStructuralValidationFailure();
		telemetry?.recordRepairAttempt();
		const repairInstructions = formatCompactionRepairInstructions([
			{ code: "missing-section", message: error.message },
		]);
		const combinedInstructions = customInstructions
			? `${customInstructions}\n\n${repairInstructions}`
			: repairInstructions;
		try {
			const repairedResult = await run(combinedInstructions, repairInstructions);
			assertCompactionResultValid(repairedResult, pathEntries);
			telemetry?.recordRepairSuccess();
			return repairedResult;
		} catch (repairError) {
			telemetry?.recordRepairFailure();
			throw repairError;
		}
	}
	const initialValidation = validateCompactionResult(initialResult, pathEntries);
	if (initialValidation.valid) return initialResult;
	telemetry?.recordStructuralValidationFailure();

	if (!initialValidation.issues.some((issue) => REPAIRABLE_COMPACTION_ISSUES.has(issue.code))) {
		assertCompactionResultValid(initialResult, pathEntries);
	}

	const repairInstructions = formatCompactionRepairInstructions(initialValidation.issues);
	const combinedInstructions = customInstructions
		? `${customInstructions}\n\n${repairInstructions}`
		: repairInstructions;
	telemetry?.recordRepairAttempt();
	try {
		const repairedResult = await run(combinedInstructions);
		assertCompactionResultValid(repairedResult, pathEntries);
		telemetry?.recordRepairSuccess();
		return repairedResult;
	} catch (repairError) {
		telemetry?.recordRepairFailure();
		throw repairError;
	}
}
