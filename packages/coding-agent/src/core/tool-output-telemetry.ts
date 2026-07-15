import { canonicalizePath, resolvePath } from "../utils/paths.ts";
import type { TruncationResult } from "./tools/truncate.ts";

export interface ToolOutputTelemetry {
	toolName: string;
	calls: number;
	successes: number;
	failures: number;
	rawOutputBytes: number;
	returnedOutputBytes: number;
	rawOutputLines: number;
	returnedOutputLines: number;
	truncationCount: number;
	truncatedBy: { lines: number; bytes: number };
	fullOutputAvailable: number;
	followUpRetrievals: number;
	repeatedReads: number;
}

type ToolOutputContent = ReadonlyArray<{ type: string; text?: string }>;

function countOutputLines(text: string): number {
	if (text.length === 0) return 0;
	return text.split("\n").length;
}

function getTextOutputStats(content: ToolOutputContent): { bytes: number; lines: number } {
	const text = content
		.map((item) => item.text ?? "")
		.filter((item) => item.length > 0)
		.join("\n");
	return { bytes: Buffer.byteLength(text, "utf8"), lines: countOutputLines(text) };
}

function isTruncationResult(value: unknown): value is TruncationResult {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<TruncationResult>;
	return (
		typeof candidate.totalBytes === "number" &&
		typeof candidate.outputBytes === "number" &&
		typeof candidate.totalLines === "number" &&
		typeof candidate.outputLines === "number" &&
		(candidate.truncatedBy === "lines" || candidate.truncatedBy === "bytes" || candidate.truncatedBy === null)
	);
}

function getTruncationDetails(details: unknown): TruncationResult | undefined {
	if (!details || typeof details !== "object") return undefined;
	const truncation = (details as { truncation?: unknown }).truncation;
	return isTruncationResult(truncation) ? truncation : undefined;
}

function getFullOutputPath(details: unknown): string | undefined {
	if (!details || typeof details !== "object") return undefined;
	const fullOutputPath = (details as { fullOutputPath?: unknown }).fullOutputPath;
	return typeof fullOutputPath === "string" && fullOutputPath.length > 0 ? fullOutputPath : undefined;
}

export class ToolOutputTelemetryStore {
	private readonly cwd: string;
	private readonly telemetry = new Map<string, ToolOutputTelemetry>();
	private readonly fullOutputOwners = new Map<string, Set<string>>();
	private readonly readPathCounts = new Map<string, number>();

	constructor(cwd: string) {
		this.cwd = cwd;
	}

	record(
		toolName: string,
		args: Record<string, unknown>,
		content: ToolOutputContent,
		details: unknown,
		isError: boolean,
	): void {
		const returned = getTextOutputStats(content);
		const truncation = getTruncationDetails(details);
		const existing = this.telemetry.get(toolName);
		const telemetry = existing ?? {
			toolName,
			calls: 0,
			successes: 0,
			failures: 0,
			rawOutputBytes: 0,
			returnedOutputBytes: 0,
			rawOutputLines: 0,
			returnedOutputLines: 0,
			truncationCount: 0,
			truncatedBy: { lines: 0, bytes: 0 },
			fullOutputAvailable: 0,
			followUpRetrievals: 0,
			repeatedReads: 0,
		};

		telemetry.calls += 1;
		if (isError) telemetry.failures += 1;
		else telemetry.successes += 1;
		telemetry.rawOutputBytes += truncation?.totalBytes ?? returned.bytes;
		telemetry.returnedOutputBytes += returned.bytes;
		telemetry.rawOutputLines += truncation?.totalLines ?? returned.lines;
		telemetry.returnedOutputLines += returned.lines;
		if (truncation?.truncated) {
			telemetry.truncationCount += 1;
			if (truncation.truncatedBy === "lines") telemetry.truncatedBy.lines += 1;
			if (truncation.truncatedBy === "bytes") telemetry.truncatedBy.bytes += 1;
		}

		const fullOutputPath = getFullOutputPath(details);
		if (fullOutputPath) {
			telemetry.fullOutputAvailable += 1;
			const canonicalFullOutputPath = canonicalizePath(resolvePath(fullOutputPath, this.cwd));
			const owners = this.fullOutputOwners.get(canonicalFullOutputPath) ?? new Set<string>();
			owners.add(toolName);
			this.fullOutputOwners.set(canonicalFullOutputPath, owners);
		}

		if (toolName === "read" && typeof args.path === "string") {
			const path = canonicalizePath(resolvePath(args.path, this.cwd));
			for (const owner of this.fullOutputOwners.get(path) ?? []) {
				const ownerTelemetry = this.telemetry.get(owner);
				if (ownerTelemetry) ownerTelemetry.followUpRetrievals += 1;
			}
			const previousReads = this.readPathCounts.get(path) ?? 0;
			if (previousReads > 0) telemetry.repeatedReads += 1;
			this.readPathCounts.set(path, previousReads + 1);
		}

		this.telemetry.set(toolName, telemetry);
	}

	list(): ToolOutputTelemetry[] {
		return Array.from(this.telemetry.values())
			.map((telemetry) => ({ ...telemetry, truncatedBy: { ...telemetry.truncatedBy } }))
			.sort((left, right) => left.toolName.localeCompare(right.toolName));
	}
}
