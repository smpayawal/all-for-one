export type ToolActionStatus = "pending" | "running" | "success" | "failure" | "warning" | "cancelled" | "unknown";

export type ExecutionGroupStatus = "pending" | "running" | "success" | "failure" | "warning" | "cancelled" | "unknown";

export interface ExecutionGroupActionState {
	status: ToolActionStatus;
}

export interface ExecutionGroupStatusSummary {
	status: ExecutionGroupStatus;
	actionCount: number;
	pendingCount: number;
	runningCount: number;
	successCount: number;
	failureCount: number;
	warningCount: number;
	cancelledCount: number;
	unknownCount: number;
}

export function summarizeExecutionGroup(actions: readonly ExecutionGroupActionState[]): ExecutionGroupStatusSummary {
	const counts = {
		pendingCount: 0,
		runningCount: 0,
		successCount: 0,
		failureCount: 0,
		warningCount: 0,
		cancelledCount: 0,
		unknownCount: 0,
	};

	for (const action of actions) {
		switch (action.status) {
			case "pending":
				counts.pendingCount += 1;
				break;
			case "running":
				counts.runningCount += 1;
				break;
			case "success":
				counts.successCount += 1;
				break;
			case "failure":
				counts.failureCount += 1;
				break;
			case "warning":
				counts.warningCount += 1;
				break;
			case "cancelled":
				counts.cancelledCount += 1;
				break;
			case "unknown":
				counts.unknownCount += 1;
				break;
		}
	}

	const actionCount = actions.length;
	let status: ExecutionGroupStatus = "unknown";
	if (actionCount === 0) {
		status = "unknown";
	} else if (counts.failureCount > 0) {
		status = "failure";
	} else if (counts.runningCount > 0) {
		status = "running";
	} else if (counts.warningCount > 0) {
		status = "warning";
	} else if (counts.cancelledCount > 0 && counts.pendingCount === 0 && counts.unknownCount === 0) {
		status = "cancelled";
	} else if (counts.successCount === actionCount) {
		status = "success";
	} else if (counts.pendingCount > 0) {
		status = "pending";
	} else if (counts.unknownCount > 0) {
		status = "unknown";
	}

	return { status, actionCount, ...counts };
}

export function getExecutionGroupStatusSymbol(status: ExecutionGroupStatus | ToolActionStatus): string {
	switch (status) {
		case "success":
			return "✓";
		case "running":
			return "◐";
		case "failure":
			return "!";
		case "warning":
			return "!";
		case "cancelled":
			return "×";
		case "pending":
			return "·";
		case "unknown":
			return "?";
	}
}

export function formatExecutionGroupStatus(summary: ExecutionGroupStatusSummary): string {
	const actions = `${summary.actionCount} action${summary.actionCount === 1 ? "" : "s"}`;
	switch (summary.status) {
		case "success":
			return `${getExecutionGroupStatusSymbol(summary.status)} ${actions}`;
		case "running":
			return `${getExecutionGroupStatusSymbol(summary.status)} ${summary.runningCount} running · ${actions}`;
		case "failure":
			return `${getExecutionGroupStatusSymbol(summary.status)} ${summary.failureCount} failed · ${actions}`;
		case "warning":
			return `${getExecutionGroupStatusSymbol(summary.status)} ${summary.warningCount} warning · ${actions}`;
		case "cancelled":
			return `${getExecutionGroupStatusSymbol(summary.status)} ${summary.cancelledCount} cancelled · ${actions}`;
		case "pending":
			return `${getExecutionGroupStatusSymbol(summary.status)} ${summary.pendingCount} pending · ${actions}`;
		case "unknown":
			return `${getExecutionGroupStatusSymbol(summary.status)} ${actions} · unknown`;
	}
}
