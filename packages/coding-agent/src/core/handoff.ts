export type HandoffStatus = "complete" | "partial" | "blocked";

export interface HandoffEvidence {
	ref: string;
	description: string;
}

export interface HandoffValidation {
	command: string;
	result: "passed" | "failed" | "not-run";
	output?: string;
}

export interface StructuredHandoff {
	id: string;
	status: HandoffStatus;
	goal: string;
	acceptanceCriteria: string[];
	constraints: string[];
	summary: string;
	completed: string[];
	remainingWork: string[];
	evidence: HandoffEvidence[];
	validation: HandoffValidation[];
	createdAt: string;
	updatedAt: string;
}

export interface CreateHandoffInput {
	status: HandoffStatus;
	goal: string;
	acceptanceCriteria?: string[];
	constraints?: string[];
	summary: string;
	completed?: string[];
	remainingWork?: string[];
	evidence?: HandoffEvidence[];
	validation?: HandoffValidation[];
	previousId?: string;
}

function nonEmpty(values: string[] | undefined): string[] {
	return [...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0))];
}

export function createStructuredHandoff(input: CreateHandoffInput, now = new Date().toISOString()): StructuredHandoff {
	const goal = input.goal.trim();
	const summary = input.summary.trim();
	if (!goal) throw new Error("A handoff goal is required.");
	if (!summary) throw new Error("A handoff summary is required.");

	return {
		id: input.previousId ?? `handoff_${now.replace(/[^0-9A-Za-z]/g, "").slice(0, 20)}`,
		status: input.status,
		goal,
		acceptanceCriteria: nonEmpty(input.acceptanceCriteria),
		constraints: nonEmpty(input.constraints),
		summary,
		completed: nonEmpty(input.completed),
		remainingWork: nonEmpty(input.remainingWork),
		evidence: input.evidence ?? [],
		validation: input.validation ?? [],
		createdAt: now,
		updatedAt: now,
	};
}

export function validateStructuredHandoff(handoff: StructuredHandoff): string[] {
	const errors: string[] = [];
	if (!handoff.id.trim()) errors.push("id is required");
	if (!handoff.goal.trim()) errors.push("goal is required");
	if (!handoff.summary.trim()) errors.push("summary is required");
	if (handoff.status === "partial" && handoff.remainingWork.length === 0) {
		errors.push("partial handoffs must state remaining work");
	}
	for (const evidence of handoff.evidence) {
		if (!evidence.ref.trim() || !evidence.description.trim()) errors.push("evidence requires ref and description");
	}
	for (const validation of handoff.validation) {
		if (!validation.command.trim()) errors.push("validation requires a command");
	}
	return errors;
}

export function formatStructuredHandoff(handoff: StructuredHandoff): string {
	const errors = validateStructuredHandoff(handoff);
	if (errors.length > 0) throw new Error(`Invalid structured handoff: ${errors.join(", ")}`);

	const lines = [
		`Handoff ${handoff.id} (${handoff.status})`,
		`Goal: ${handoff.goal}`,
		...(handoff.acceptanceCriteria.length > 0 ? [`Acceptance: ${handoff.acceptanceCriteria.join("; ")}`] : []),
		...(handoff.constraints.length > 0 ? [`Constraints: ${handoff.constraints.join("; ")}`] : []),
		`Summary: ${handoff.summary}`,
		`Completed: ${handoff.completed.length > 0 ? handoff.completed.join("; ") : "none recorded"}`,
		`Remaining: ${handoff.remainingWork.length > 0 ? handoff.remainingWork.join("; ") : "none recorded"}`,
	];
	if (handoff.evidence.length > 0)
		lines.push(`Evidence: ${handoff.evidence.map((item) => `${item.ref} (${item.description})`).join("; ")}`);
	if (handoff.validation.length > 0) {
		lines.push(`Validation: ${handoff.validation.map((item) => `${item.command}=${item.result}`).join("; ")}`);
	}
	return lines.join("\n");
}
