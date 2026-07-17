import { describe, expect, it } from "vitest";
import {
	ExecutionIntegrityTracker,
	MAX_EXECUTION_INTEGRITY_CONTINUATION_ATTEMPTS,
	MAX_EXECUTION_INTEGRITY_MODIFIED_PATHS,
	MAX_EXECUTION_INTEGRITY_VALIDATIONS,
} from "../src/core/execution-integrity.ts";
import type { ValidationCommandDiscovery, ValidationExecutionProvenance } from "../src/core/validation-commands.ts";

const discovery: ValidationCommandDiscovery = {
	ecosystems: ["node", "rust", "python"],
	packageManager: "npm",
	commands: [
		{
			kind: "test",
			command: "npm test",
			confidence: "verified",
			source: "package.json#scripts.test",
		},
		{
			kind: "check",
			command: "npm run check",
			confidence: "verified",
			source: "package.json#scripts.check",
		},
	],
};

function validationProvenance(
	command = "npm test",
	overrides: Record<string, unknown> = {},
): ValidationExecutionProvenance {
	return {
		requestedCommand: command,
		executedCommand: command,
		cwd: "/tmp/phase6-project",
		executionKind: "local",
		exitCode: 0,
		...overrides,
	};
}

function createTracker(
	mode: "off" | "observe" | "enforce" = "enforce",
	maxContinuationAttempts = 1,
): ExecutionIntegrityTracker {
	return new ExecutionIntegrityTracker({
		cwd: "/tmp/phase6-project",
		settings: { mode, maxContinuationAttempts },
		discovery,
	});
}

function mutation(toolName = "edit", path = "src/example.ts", isError = false) {
	return {
		toolCallId: `${toolName}-1`,
		toolName,
		args: toolName === "apply_patch" ? { patch: `*** Update File: ${path}\n` } : { path },
		isError,
	};
}

function validation(
	command = "npm test",
	isError = false,
	details: unknown = { executionProvenance: validationProvenance(command) },
) {
	return {
		toolCallId: "bash-1",
		toolName: "bash",
		args: { command },
		isError,
		details,
	};
}

describe("ExecutionIntegrityTracker", () => {
	it("allows completion without known mutations", () => {
		const tracker = createTracker("observe");

		expect(tracker.decideCompletion()).toEqual({ action: "allow", reason: "no-known-mutation" });
	});

	it("does not track or diagnose in off mode", () => {
		const tracker = createTracker("off");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });

		expect(tracker.getSnapshot()).toMatchObject({
			mode: "off",
			mutationCount: 0,
			validations: [],
			limitations: [],
			continuationAttempts: 0,
		});
		expect(tracker.decideCompletion()).toEqual({ action: "allow", reason: "mode-off" });
	});

	it("requests enforcement feedback when a successful mutation has no validation", () => {
		const tracker = createTracker();
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });

		expect(tracker.decideCompletion()).toMatchObject({ action: "continue", reason: "validation-missing" });
		expect(tracker.getSnapshot()).toMatchObject({ mutationVersion: 1, mutationCount: 1, continuationAttempts: 1 });

		const feedback = tracker.createFeedbackMessage();
		expect(feedback).toMatchObject({
			role: "custom",
			customType: "execution-integrity-feedback",
			display: false,
		});
		expect(feedback.content).toContain("no fresh matching validation result");
		expect(feedback.content.length).toBeLessThanOrEqual(2_000);
		expect(feedback.details).toMatchObject({
			reason: "validation-missing",
			mutationVersion: 1,
			continuationAttempt: 1,
		});
	});

	it("observes missing validation without queuing in observe mode", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });

		expect(tracker.decideCompletion()).toEqual({ action: "observe", reason: "validation-missing" });
		expect(tracker.getSnapshot().continuationAttempts).toBe(0);
	});

	it("records a fresh pass only after a later turn", () => {
		const tracker = createTracker();
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordTurn({ turnIndex: 1, toolObservations: [validation()] });

		expect(tracker.decideCompletion()).toEqual({ action: "allow", reason: "fresh-validation-passed" });
		expect(tracker.getSnapshot()).toMatchObject({
			freshPassingValidationCount: 1,
			freshFailingValidationCount: 0,
			staleValidationCount: 0,
		});
	});

	it("accepts successful user-run validation and rejects cancellation", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordUserBashValidation(
			"npm test",
			{
				exitCode: 0,
				cancelled: false,
				fullOutputPath: "/tmp/phase6-test-output.txt",
				executionProvenance: validationProvenance(),
			},
			1,
		);

		expect(tracker.decideCompletion()).toEqual({ action: "observe", reason: "fresh-validation-passed" });
		expect(tracker.getSnapshot().validations[0]?.fullOutputPath).toBe("/tmp/phase6-test-output.txt");

		tracker.recordTurn({ turnIndex: 2, toolObservations: [mutation("write", "src/changed.ts")] });
		tracker.recordUserBashValidation(
			"npm test",
			{
				exitCode: undefined,
				cancelled: true,
				executionProvenance: validationProvenance("npm test", { exitCode: null }),
			},
			3,
		);

		expect(tracker.decideCompletion()).toEqual({ action: "observe", reason: "validation-failed" });
	});

	it("does not treat targeted or no-op validation flags as fresh enforcement evidence", () => {
		const tracker = createTracker();
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordTurn({ turnIndex: 1, toolObservations: [validation("npm test -- --help")] });
		tracker.recordTurn({ turnIndex: 2, toolObservations: [validation("npm test -- test/example.test.ts")] });

		expect(tracker.decideCompletion()).toEqual({ action: "continue", reason: "validation-missing" });
		expect(tracker.getSnapshot().validations[0]).toMatchObject({
			scope: "targeted-unverified",
			status: "unverified",
		});
	});

	it("does not treat a successful user-run targeted command as exact evidence", () => {
		const tracker = createTracker();
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordUserBashValidation(
			"npm test -- test/example.test.ts",
			{
				exitCode: 0,
				cancelled: false,
				executionProvenance: validationProvenance("npm test -- test/example.test.ts"),
			},
			1,
		);

		expect(tracker.getSnapshot().validations.at(-1)).toMatchObject({
			scope: "targeted-unverified",
			status: "unverified",
		});
		expect(tracker.getSnapshot()).toMatchObject({
			unverifiedValidationCount: 1,
			freshPassingValidationCount: 0,
		});
		expect(tracker.decideCompletion()).toEqual({ action: "continue", reason: "validation-missing" });
	});

	it("does not treat an exact command without execution provenance as fresh evidence", () => {
		const tracker = createTracker();
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordTurn({ turnIndex: 1, toolObservations: [validation("npm test", false, { exitCode: 0 })] });

		expect(tracker.decideCompletion()).toEqual({ action: "continue", reason: "validation-missing" });
		expect(tracker.getSnapshot()).toMatchObject({
			unverifiedValidationCount: 1,
			freshPassingValidationCount: 0,
		});
	});

	it.each([
		["a custom execution kind", { executionKind: "custom" }],
		["a remote execution kind", { executionKind: "remote" }],
		["a different working directory", { cwd: "/tmp/other-project" }],
		["a transformed command", { executedCommand: "npm test -- --run" }],
		["a different requested command", { requestedCommand: "npm run check" }],
	] as const)("does not treat exact validation with %s as fresh evidence", (_label, overrides) => {
		const tracker = createTracker();
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordTurn({
			turnIndex: 1,
			toolObservations: [
				validation("npm test", false, {
					executionProvenance: validationProvenance("npm test", overrides),
				}),
			],
		});

		expect(tracker.decideCompletion()).toEqual({ action: "continue", reason: "validation-missing" });
		expect(tracker.getSnapshot()).toMatchObject({
			unverifiedValidationCount: 1,
			freshPassingValidationCount: 0,
		});
	});

	it("keeps an exact pass when a later targeted diagnostic uses the same discovered command", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordTurn({ turnIndex: 1, toolObservations: [validation("npm test")] });
		tracker.recordTurn({ turnIndex: 2, toolObservations: [validation("npm test -- test/example.test.ts")] });

		expect(tracker.decideCompletion()).toEqual({ action: "observe", reason: "fresh-validation-passed" });
		expect(tracker.getSnapshot().validations).toHaveLength(2);
		expect(tracker.getSnapshot()).toMatchObject({
			freshPassingValidationCount: 1,
			unverifiedValidationCount: 1,
		});
	});

	it("marks user validation concurrent when mutation overlaps its execution", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordUserBashValidation("npm test", { exitCode: 0, cancelled: false }, 1, {
			mutationVersionAtStart: 1,
			mutationVersionAtEnd: 2,
			agentStreamingAtStart: true,
			pendingMutationAtStart: true,
		});

		expect(tracker.getSnapshot().validations.at(-1)).toMatchObject({ status: "concurrent-with-mutation" });
		expect(tracker.decideCompletion()).toEqual({ action: "observe", reason: "validation-concurrent-with-mutation" });
	});

	it("does not classify streaming alone as mutation overlap", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordUserBashValidation(
			"npm test",
			{ exitCode: 0, cancelled: false, executionProvenance: validationProvenance() },
			1,
			{
				mutationVersionAtStart: 1,
				mutationVersionAtEnd: 1,
				agentStreamingAtStart: true,
				pendingMutationAtStart: false,
			},
		);

		expect(tracker.getSnapshot().validations.at(-1)).toMatchObject({ status: "passed" });
		expect(tracker.decideCompletion()).toEqual({ action: "observe", reason: "fresh-validation-passed" });
	});

	it("invalidates prior evidence when discovery changes and records refresh limitations", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordTurn({ turnIndex: 1, toolObservations: [validation()] });
		tracker.updateDiscovery({
			...discovery,
			commands: [{ ...discovery.commands[1], command: "npm run check:changed" }],
		});

		expect(tracker.getSnapshot().limitations).toContain(
			"Validation command discovery changed; prior validation evidence is stale.",
		);
		expect(tracker.decideCompletion()).toEqual({ action: "observe", reason: "validation-stale" });
	});

	it("bounds and sanitizes paths and full-output references", () => {
		const tracker = createTracker("observe");
		const longPath = `src/${"x".repeat(700)}\u0000.ts`;
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation("edit", longPath)] });
		tracker.recordTurn({
			turnIndex: 1,
			toolObservations: [
				validation("npm test", false, { exitCode: 0, fullOutputPath: `${"/tmp/"}${"y".repeat(700)}\u0007.log` }),
			],
		});

		const snapshot = tracker.getSnapshot();
		expect(snapshot.modifiedPaths[0]?.length).toBeLessThanOrEqual(512);
		expect(snapshot.modifiedPaths[0]).not.toMatch(/[\u0000-\u001f\u007f]/);
		expect(snapshot.validations[0]?.fullOutputPath?.length).toBeLessThanOrEqual(512);
		expect(snapshot.validations[0]?.fullOutputPath).not.toMatch(/[\u0000-\u001f\u007f]/);
	});

	it("marks a pass stale after a later successful mutation", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordTurn({ turnIndex: 1, toolObservations: [validation()] });
		tracker.recordTurn({ turnIndex: 2, toolObservations: [mutation("write", "src/other.ts")] });

		expect(tracker.decideCompletion()).toEqual({ action: "observe", reason: "validation-stale" });
		expect(tracker.getSnapshot()).toMatchObject({ staleValidationCount: 1, mutationVersion: 2 });
	});

	it("prioritizes the latest fresh failed validation", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordTurn({ turnIndex: 1, toolObservations: [validation()] });
		tracker.recordTurn({ turnIndex: 2, toolObservations: [validation("npm test", true)] });

		expect(tracker.decideCompletion()).toEqual({ action: "observe", reason: "validation-failed" });
		expect(tracker.getSnapshot().freshFailingValidationCount).toBe(1);
	});

	it("marks same-turn mutation and validation as concurrent", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation(), validation()] });

		expect(tracker.decideCompletion()).toEqual({ action: "observe", reason: "validation-concurrent-with-mutation" });
		expect(tracker.getSnapshot()).toMatchObject({ concurrentValidationCount: 1, freshPassingValidationCount: 0 });
	});

	it("does not count failed mutations", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation("edit", "src/blocked.ts", true)] });

		expect(tracker.getSnapshot()).toMatchObject({ mutationVersion: 0, mutationCount: 0, modifiedPaths: [] });
		expect(tracker.decideCompletion()).toEqual({ action: "allow", reason: "no-known-mutation" });
	});

	it("tracks apply_patch paths through the existing scoped path helper", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation("apply_patch", "src/patched.ts")] });

		expect(tracker.getSnapshot().modifiedPaths).toEqual(["src/patched.ts"]);
	});

	it("exposes the arbitrary bash mutation limitation", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({
			turnIndex: 0,
			toolObservations: [{ ...validation("npm test"), toolCallId: "bash-read", isError: false }],
		});

		expect(tracker.getSnapshot().limitations).toContain(
			"Arbitrary bash commands may mutate the workspace and are not fully classified by Phase 6.",
		);
	});

	it("allows completion without blocking when no command was discovered", () => {
		const tracker = new ExecutionIntegrityTracker({
			cwd: "/tmp/phase6-project",
			settings: { mode: "enforce", maxContinuationAttempts: 1 },
			discovery: { ecosystems: [], commands: [] },
		});
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });

		expect(tracker.decideCompletion()).toEqual({ action: "observe", reason: "no-validation-command" });
	});

	it("rejects compound commands by grounding matching in discovery", () => {
		const tracker = createTracker("observe");
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });
		tracker.recordTurn({ turnIndex: 1, toolObservations: [validation("npm test && npm run check")] });

		expect(tracker.getSnapshot().validations).toEqual([]);
		expect(tracker.decideCompletion()).toEqual({ action: "observe", reason: "validation-missing" });
	});

	it("keeps path and validation records bounded", () => {
		const tracker = createTracker("observe");
		for (let index = 0; index < MAX_EXECUTION_INTEGRITY_MODIFIED_PATHS + 8; index += 1) {
			tracker.recordTurn({ turnIndex: index, toolObservations: [mutation("edit", `src/file-${index}.ts`)] });
		}
		for (let index = 0; index < MAX_EXECUTION_INTEGRITY_VALIDATIONS + 8; index += 1) {
			tracker.recordTurn({ turnIndex: index + 200, toolObservations: [validation()] });
		}

		const snapshot = tracker.getSnapshot();
		expect(snapshot.modifiedPaths).toHaveLength(MAX_EXECUTION_INTEGRITY_MODIFIED_PATHS);
		expect(snapshot.validations).toHaveLength(MAX_EXECUTION_INTEGRITY_VALIDATIONS);
		expect(snapshot.limitations.length).toBeGreaterThan(0);
	});

	it("stops after the configured continuation limit", () => {
		const tracker = createTracker("enforce", MAX_EXECUTION_INTEGRITY_CONTINUATION_ATTEMPTS);
		tracker.recordTurn({ turnIndex: 0, toolObservations: [mutation()] });

		expect(tracker.decideCompletion().action).toBe("continue");
		expect(tracker.decideCompletion().action).toBe("continue");
		expect(tracker.decideCompletion()).toEqual({ action: "allow", reason: "continuation-limit-reached" });
		expect(tracker.getSnapshot().continuationAttempts).toBe(MAX_EXECUTION_INTEGRITY_CONTINUATION_ATTEMPTS);
	});
});
