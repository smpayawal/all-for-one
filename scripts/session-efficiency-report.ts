import { closeSync, openSync, readSync } from "node:fs";
import { pathToFileURL } from "node:url";

interface SessionReportOptions {
	includeToolBreakdown?: boolean;
}

interface ToolMetric {
	calls: number;
	successes: number;
	failures: number;
	returnedBytes: number;
	returnedLines: number;
	truncations: number;
	fullOutputAvailable: number;
}

export interface SessionEfficiencyReport {
	schemaVersion: 2;
	session: {
		version: number | null;
		model: { provider: string; modelId: string } | null;
		thinkingLevel: string | null;
		durationMs: number | null;
	};
	usage: {
		inputTokens: number | null;
		outputTokens: number | null;
		cacheReadTokens: number | null;
		cacheWriteTokens: number | null;
		totalTokens: number | null;
	};
	activity: {
		assistantTurns: number;
		toolCalls: number;
		toolSuccesses: number;
		toolFailures: number;
		repeatedReads: number;
		uniqueFilesRead: number;
		filesReadBeforeFirstMutation: number | null;
		mutationCalls: number;
		validationCalls: number;
		truncations: number;
		fullOutputAvailable: number;
		followUpRetrievals: number;
		compactions: number;
		cancellations: number;
		timeouts: number;
	};
	heuristics: {
		cancellationTextMentions: number;
		timeoutTextMentions: number;
	};
	quality: {
		malformedLines: number;
		unmatchedToolResults: number;
	};
	tools?: Record<string, ToolMetric>;
}

type JsonObject = Record<string, unknown>;

interface PendingToolCall {
	name: string;
	args: JsonObject;
}

const MUTATION_TOOLS = new Set(["edit", "write", "apply_patch"]);
const VALIDATION_PATTERN =
	/(?:^|\s)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|check|lint|build|typecheck)|(?:^|\s)(?:vitest|jest|pytest|cargo\s+test|go\s+test|tsc)(?:\s|$)/i;

function asObject(value: unknown): JsonObject | null {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function asString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstNumber(source: JsonObject | null, keys: readonly string[]): number | null {
	if (!source) return null;
	for (const key of keys) {
		const value = asNumber(source[key]);
		if (value !== null) return value;
	}
	return null;
}

function sumNullable(current: number | null, next: number | null): number | null {
	if (next === null) return current;
	return (current ?? 0) + next;
}

function getUsage(message: JsonObject): JsonObject | null {
	return asObject(message.usage) ?? asObject(asObject(message.metrics)?.usage);
}

function getText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((item) => {
			const object = asObject(item);
			return object ? asString(object.text) ?? "" : "";
		})
		.filter(Boolean)
		.join("\n");
}

function countLines(text: string): number {
	return text.length === 0 ? 0 : text.split("\n").length;
}

function getToolCall(item: JsonObject): { id: string | null; call: PendingToolCall } | null {
	const type = asString(item.type);
	if (type !== "toolCall" && type !== "tool_call") return null;
	const name = asString(item.name) ?? asString(item.toolName);
	if (!name) return null;
	return {
		id: asString(item.id) ?? asString(item.toolCallId),
		call: {
			name,
			args: asObject(item.arguments) ?? asObject(item.input) ?? {},
		},
	};
}

function getToolMetric(metrics: Map<string, ToolMetric>, name: string): ToolMetric {
	const existing = metrics.get(name);
	if (existing) return existing;
	const created: ToolMetric = {
		calls: 0,
		successes: 0,
		failures: 0,
		returnedBytes: 0,
		returnedLines: 0,
		truncations: 0,
		fullOutputAvailable: 0,
	};
	metrics.set(name, created);
	return created;
}

function getTruncation(details: JsonObject | null): { truncated: boolean; fullOutputAvailable: boolean } {
	const truncation = asObject(details?.truncation);
	return {
		truncated: truncation?.truncated === true || truncation?.truncatedBy === "lines" || truncation?.truncatedBy === "bytes",
		fullOutputAvailable: asString(details?.fullOutputPath) !== null,
	};
}

function getStructuredTermination(
	message: JsonObject,
	details: JsonObject | null,
): "cancellation" | "timeout" | null {
	const execution = asObject(details?.execution);
	const result = asObject(details?.result);
	const candidates = [
		message.termination,
		message.terminationKind,
		details?.termination,
		details?.terminationKind,
		execution?.termination,
		execution?.terminationKind,
		result?.termination,
		result?.terminationKind,
	];
	for (const candidate of candidates) {
		const normalized = asString(candidate)?.toLowerCase();
		if (!normalized) continue;
		if (normalized === "timeout" || normalized === "timed-out" || normalized === "timed_out") return "timeout";
		if (["abort", "aborted", "cancel", "canceled", "cancelled"].includes(normalized)) return "cancellation";
	}
	return null;
}

function getToolResultName(message: JsonObject, pendingCalls: Map<string, PendingToolCall>): string | null {
	const direct = asString(message.toolName) ?? asString(message.name);
	if (direct) return direct;
	const id = asString(message.toolCallId) ?? asString(message.id);
	return id ? pendingCalls.get(id)?.name ?? null : null;
}

function isValidationCall(name: string, args: JsonObject): boolean {
	if (name !== "bash") return false;
	const command = asString(args.command) ?? asString(args.cmd);
	return command ? VALIDATION_PATTERN.test(command) : false;
}

function normalizeReadKey(args: JsonObject): string | null {
	const path = asString(args.path) ?? asString(args.file_path) ?? asString(args.filePath);
	return path?.replaceAll("\\", "/") ?? null;
}

function sortedToolMetrics(metrics: Map<string, ToolMetric>): Record<string, ToolMetric> {
	return Object.fromEntries([...metrics.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function analyzeSessionLines(lines: Iterable<string>, options: SessionReportOptions = {}): SessionEfficiencyReport {
	let sessionVersion: number | null = null;
	let model: { provider: string; modelId: string } | null = null;
	let thinkingLevel: string | null = null;
	let firstTimestamp: number | null = null;
	let lastTimestamp: number | null = null;
	let malformedLines = 0;
	let unmatchedToolResults = 0;
	let assistantTurns = 0;
	let toolCalls = 0;
	let toolSuccesses = 0;
	let toolFailures = 0;
	let repeatedReads = 0;
	let filesReadBeforeFirstMutation: number | null = null;
	let mutationCalls = 0;
	let validationCalls = 0;
	let truncations = 0;
	let fullOutputAvailable = 0;
	let followUpRetrievals = 0;
	let compactions = 0;
	let cancellations = 0;
	let timeouts = 0;
	let cancellationTextMentions = 0;
	let timeoutTextMentions = 0;
	let inputTokens: number | null = null;
	let outputTokens: number | null = null;
	let cacheReadTokens: number | null = null;
	let cacheWriteTokens: number | null = null;
	let totalTokens: number | null = null;

	const pendingCalls = new Map<string, PendingToolCall>();
	const readCounts = new Map<string, number>();
	const fullOutputOwners = new Set<string>();
	const toolMetrics = new Map<string, ToolMetric>();

	for (const line of lines) {
		if (!line.trim()) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			malformedLines += 1;
			continue;
		}
		const entry = asObject(parsed);
		if (!entry) {
			malformedLines += 1;
			continue;
		}

		const timestamp = asString(entry.timestamp);
		const timestampMs = timestamp ? Date.parse(timestamp) : Number.NaN;
		if (Number.isFinite(timestampMs)) {
			firstTimestamp = firstTimestamp === null ? timestampMs : Math.min(firstTimestamp, timestampMs);
			lastTimestamp = lastTimestamp === null ? timestampMs : Math.max(lastTimestamp, timestampMs);
		}

		const type = asString(entry.type);
		if (type === "session") {
			sessionVersion = asNumber(entry.version);
			continue;
		}
		if (type === "model_change") {
			const provider = asString(entry.provider);
			const modelId = asString(entry.modelId);
			if (provider && modelId) model = { provider, modelId };
			continue;
		}
		if (type === "thinking_level_change") {
			thinkingLevel = asString(entry.thinkingLevel);
			continue;
		}
		if (type === "compaction") {
			compactions += 1;
			continue;
		}
		if (type !== "message") continue;

		const message = asObject(entry.message);
		if (!message) continue;
		const role = asString(message.role);
		if (role === "assistant") {
			assistantTurns += 1;
			const provider = asString(message.provider);
			const modelId = asString(message.model);
			if (provider && modelId) model = { provider, modelId };
			const usage = getUsage(message);
			inputTokens = sumNullable(inputTokens, firstNumber(usage, ["input", "inputTokens", "promptTokens"]));
			outputTokens = sumNullable(outputTokens, firstNumber(usage, ["output", "outputTokens", "completionTokens"]));
			cacheReadTokens = sumNullable(cacheReadTokens, firstNumber(usage, ["cacheRead", "cacheReadTokens"]));
			cacheWriteTokens = sumNullable(cacheWriteTokens, firstNumber(usage, ["cacheWrite", "cacheWriteTokens"]));
			totalTokens = sumNullable(totalTokens, firstNumber(usage, ["total", "totalTokens"]));

			for (const rawItem of Array.isArray(message.content) ? message.content : []) {
				const item = asObject(rawItem);
				if (!item) continue;
				const parsedCall = getToolCall(item);
				if (!parsedCall) continue;
				const { id, call } = parsedCall;
				toolCalls += 1;
				getToolMetric(toolMetrics, call.name).calls += 1;
				if (id) pendingCalls.set(id, call);
				if (call.name === "read") {
					const key = normalizeReadKey(call.args);
					if (key) {
						const previous = readCounts.get(key) ?? 0;
						if (previous > 0) repeatedReads += 1;
						readCounts.set(key, previous + 1);
						if (fullOutputOwners.has(key)) followUpRetrievals += 1;
					}
				}
				if (MUTATION_TOOLS.has(call.name)) {
					mutationCalls += 1;
					filesReadBeforeFirstMutation ??= readCounts.size;
				}
				if (isValidationCall(call.name, call.args)) validationCalls += 1;
			}
			continue;
		}

		if (role !== "toolResult" && role !== "tool_result") continue;
		const name = getToolResultName(message, pendingCalls);
		if (!name) {
			unmatchedToolResults += 1;
			continue;
		}
		const metric = getToolMetric(toolMetrics, name);
		const isError = message.isError === true;
		if (isError) {
			toolFailures += 1;
			metric.failures += 1;
		} else {
			toolSuccesses += 1;
			metric.successes += 1;
		}
		const text = getText(message.content);
		metric.returnedBytes += Buffer.byteLength(text, "utf8");
		metric.returnedLines += countLines(text);
		const details = asObject(message.details);
		const truncation = getTruncation(details);
		if (truncation.truncated) {
			truncations += 1;
			metric.truncations += 1;
		}
		if (truncation.fullOutputAvailable) {
			fullOutputAvailable += 1;
			metric.fullOutputAvailable += 1;
			const path = asString(details?.fullOutputPath)?.replaceAll("\\", "/");
			if (path) fullOutputOwners.add(path);
		}
		const termination = getStructuredTermination(message, details);
		if (termination === "cancellation") cancellations += 1;
		if (termination === "timeout") timeouts += 1;
		if (/cancel(?:led|ed)/iu.test(text)) cancellationTextMentions += 1;
		if (/timed?\s*out|timeout/iu.test(text)) timeoutTextMentions += 1;
	}

	if (totalTokens === null && (inputTokens !== null || outputTokens !== null)) {
		totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0);
	}

	const report: SessionEfficiencyReport = {
		schemaVersion: 2,
		session: {
			version: sessionVersion,
			model,
			thinkingLevel,
			durationMs: firstTimestamp !== null && lastTimestamp !== null ? Math.max(0, lastTimestamp - firstTimestamp) : null,
		},
		usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens },
		activity: {
			assistantTurns,
			toolCalls,
			toolSuccesses,
			toolFailures,
			repeatedReads,
			uniqueFilesRead: readCounts.size,
			filesReadBeforeFirstMutation,
			mutationCalls,
			validationCalls,
			truncations,
			fullOutputAvailable,
			followUpRetrievals,
			compactions,
			cancellations,
			timeouts,
		},
		heuristics: { cancellationTextMentions, timeoutTextMentions },
		quality: { malformedLines, unmatchedToolResults },
	};
	if (options.includeToolBreakdown !== false) report.tools = sortedToolMetrics(toolMetrics);
	return report;
}

function* readSessionLines(path: string): Generator<string> {
	const descriptor = openSync(path, "r");
	const buffer = Buffer.allocUnsafe(64 * 1_024);
	const decoder = new TextDecoder("utf-8");
	let carry = "";
	try {
		while (true) {
			const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
			if (bytesRead === 0) break;
			carry += decoder.decode(buffer.subarray(0, bytesRead), { stream: true });
			let newline = carry.indexOf("\n");
			while (newline >= 0) {
				const rawLine = carry.slice(0, newline);
				yield rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
				carry = carry.slice(newline + 1);
				newline = carry.indexOf("\n");
			}
		}
		carry += decoder.decode();
		if (carry) yield carry.endsWith("\r") ? carry.slice(0, -1) : carry;
	} finally {
		closeSync(descriptor);
	}
}

export function analyzeSessionContent(content: string, options: SessionReportOptions = {}): SessionEfficiencyReport {
	return analyzeSessionLines(content.split(/\r?\n/u), options);
}

export function analyzeSessionFile(path: string, options: SessionReportOptions = {}): SessionEfficiencyReport {
	return analyzeSessionLines(readSessionLines(path), options);
}

export function formatSessionEfficiencyReport(report: SessionEfficiencyReport): string {
	const model = report.session.model ? `${report.session.model.provider}/${report.session.model.modelId}` : "not recorded";
	const duration = report.session.durationMs === null ? "not recorded" : `${report.session.durationMs} ms`;
	const tokens = report.usage.totalTokens === null ? "not recorded" : report.usage.totalTokens.toLocaleString("en-US");
	const lines = [
		"Session efficiency report",
		`Model: ${model}`,
		`Thinking: ${report.session.thinkingLevel ?? "not recorded"}`,
		`Duration: ${duration}`,
		`Recorded tokens: ${tokens}`,
		`Assistant turns: ${report.activity.assistantTurns}`,
		`Tool calls: ${report.activity.toolCalls} (${report.activity.toolSuccesses} succeeded, ${report.activity.toolFailures} failed)`,
		`Reads: ${report.activity.uniqueFilesRead} unique, ${report.activity.repeatedReads} repeated`,
		`Mutations: ${report.activity.mutationCalls}`,
		`Validation calls: ${report.activity.validationCalls}`,
		`Truncations: ${report.activity.truncations}; follow-up retrievals: ${report.activity.followUpRetrievals}`,
		`Compactions: ${report.activity.compactions}`,
		`Structured termination: ${report.activity.cancellations} cancellations, ${report.activity.timeouts} timeouts`,
		`Text heuristics: ${report.heuristics.cancellationTextMentions} cancellation mentions, ${report.heuristics.timeoutTextMentions} timeout mentions`,
		`Malformed lines skipped: ${report.quality.malformedLines}`,
		"",
		"This offline report uses recorded session evidence only. Text-derived termination mentions are labeled as heuristics and are not counted as structured termination. It does not estimate monetary cost or include prompt, response, file, or tool-output contents.",
	];
	return lines.join("\n");
}

function printHelp(): void {
	console.log("Usage: npm run report:session -- <session.jsonl> [--json]");
	console.log("Reads a Pi session JSONL file offline and prints privacy-safe efficiency metrics.");
}

export function runSessionEfficiencyCli(argv: readonly string[]): number {
	if (argv.includes("--help") || argv.includes("-h")) {
		printHelp();
		return 0;
	}
	const json = argv.includes("--json");
	const path = argv.find((argument) => !argument.startsWith("-"));
	if (!path) {
		console.error("Missing session JSONL path. Run with --help for usage.");
		return 2;
	}
	try {
		const report = analyzeSessionFile(path);
		console.log(json ? JSON.stringify(report, null, 2) : formatSessionEfficiencyReport(report));
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Unable to read session file: ${message}`);
		return 1;
	}
}

const isMainModule = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) process.exitCode = runSessionEfficiencyCli(process.argv.slice(2));
