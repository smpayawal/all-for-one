import type { ChildProcess } from "node:child_process";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import { spawnProcess, waitForChildProcess } from "../../utils/child-process.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, type TruncationResult, truncateHead } from "./truncate.ts";

const DEFAULT_MAX_FILES = 1000;
const STATUS_CAPTURE_BYTES = 4 * 1024 * 1024;
const STDERR_CAPTURE_BYTES = 64 * 1024;

const changesSchema = Type.Object({
	view: Type.Union([Type.Literal("summary"), Type.Literal("diff")]),
	path: Type.Optional(Type.String({ description: "Optional repository-relative path filter" })),
	staged: Type.Optional(
		Type.Boolean({ description: "When true inspect staged changes; when false inspect unstaged changes" }),
	),
});

export type ChangesToolInput = Static<typeof changesSchema>;

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "unmerged" | "untracked";

export interface ChangedFile {
	path: string;
	previousPath?: string;
	status: ChangeStatus;
	staged: boolean;
	unstaged: boolean;
}

export interface ChangesToolDetails {
	repository: boolean;
	files: ChangedFile[];
	diff?: string;
	truncated?: boolean;
	filesTruncated?: boolean;
	truncation?: TruncationResult;
}

export interface ChangesToolOptions {
	/** Maximum status entries returned. Default: 1000. */
	maxFiles?: number;
}

type CapturedProcessResult = {
	stdout: string;
	stderr: string;
	code: number;
	stdoutTruncated: boolean;
	totalStdoutBytes: number;
	totalStdoutLines: number;
};

type ByteCapture = {
	chunks: Buffer[];
	storedBytes: number;
	totalBytes: number;
	newlines: number;
	lastByte?: number;
	truncated: boolean;
};

function createByteCapture(): ByteCapture {
	return { chunks: [], storedBytes: 0, totalBytes: 0, newlines: 0, truncated: false };
}

function appendCapture(capture: ByteCapture, chunk: Buffer, limit: number): void {
	capture.totalBytes += chunk.length;
	for (const byte of chunk) {
		if (byte === 0x0a) capture.newlines++;
	}
	if (chunk.length > 0) capture.lastByte = chunk[chunk.length - 1];

	const remaining = Math.max(0, limit - capture.storedBytes);
	if (remaining > 0) {
		const stored = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
		capture.chunks.push(stored);
		capture.storedBytes += stored.length;
	}
	if (capture.totalBytes > limit) capture.truncated = true;
}

function capturedText(capture: ByteCapture): string {
	return Buffer.concat(capture.chunks, capture.storedBytes).toString("utf-8");
}

async function runGit(
	cwd: string,
	args: string[],
	signal: AbortSignal | undefined,
	stdoutLimit: number,
): Promise<CapturedProcessResult> {
	if (signal?.aborted) throw new Error("Operation aborted");

	let child: ChildProcess;
	try {
		child = spawnProcess("git", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
	} catch (error) {
		throw new Error(`Failed to run git: ${error instanceof Error ? error.message : String(error)}`);
	}

	const stdout = createByteCapture();
	const stderr = createByteCapture();
	child.stdout?.on("data", (chunk: Buffer) => appendCapture(stdout, chunk, stdoutLimit));
	child.stderr?.on("data", (chunk: Buffer) => appendCapture(stderr, chunk, STDERR_CAPTURE_BYTES));

	let aborted = false;
	const onAbort = () => {
		aborted = true;
		if (!child.killed) child.kill();
	};
	signal?.addEventListener("abort", onAbort, { once: true });

	let code: number | null;
	try {
		code = await waitForChildProcess(child);
	} catch (error) {
		if (aborted || signal?.aborted) throw new Error("Operation aborted");
		throw new Error(`Failed to run git: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		signal?.removeEventListener("abort", onAbort);
	}

	if (aborted || signal?.aborted) throw new Error("Operation aborted");
	return {
		stdout: capturedText(stdout),
		stderr: capturedText(stderr),
		code: code ?? 1,
		stdoutTruncated: stdout.truncated,
		totalStdoutBytes: stdout.totalBytes,
		totalStdoutLines: stdout.newlines + (stdout.totalBytes > 0 && stdout.lastByte !== 0x0a ? 1 : 0),
	};
}

function statusFromCodes(indexStatus: string, worktreeStatus: string): ChangeStatus {
	const codes = `${indexStatus}${worktreeStatus}`;
	if (codes.includes("R")) return "renamed";
	if (codes.includes("C")) return "copied";
	if (codes.includes("U")) return "unmerged";
	if (codes.includes("D")) return "deleted";
	if (codes.includes("A")) return "added";
	return "modified";
}

function trackedFile(path: string, xy: string, previousPath?: string): ChangedFile {
	const indexStatus = xy[0] ?? ".";
	const worktreeStatus = xy[1] ?? ".";
	return {
		path,
		...(previousPath ? { previousPath } : {}),
		status: statusFromCodes(indexStatus, worktreeStatus),
		staged: indexStatus !== ".",
		unstaged: worktreeStatus !== ".",
	};
}

function parseGitStatus(output: string): ChangedFile[] {
	const records = output.split("\0");
	if (records[records.length - 1] === "") records.pop();
	const files: ChangedFile[] = [];

	for (let index = 0; index < records.length; index++) {
		const record = records[index];
		if (record.startsWith("? ")) {
			files.push({ path: record.slice(2), status: "untracked", staged: false, unstaged: true });
			continue;
		}
		if (record.startsWith("! ")) continue;

		const ordinary = /^1 (\S{2}) \S+ \S+ \S+ \S+ \S+ \S+ (.*)$/.exec(record);
		if (ordinary) {
			files.push(trackedFile(ordinary[2], ordinary[1]));
			continue;
		}

		const renamed = /^2 (\S{2}) \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.*)$/.exec(record);
		if (renamed) {
			const previousPath = records[++index];
			if (previousPath === undefined) break;
			files.push(trackedFile(renamed[2], renamed[1], previousPath));
			continue;
		}

		const unmerged = /^u (\S{2}) \S+ \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.*)$/.exec(record);
		if (unmerged) {
			files.push({ ...trackedFile(unmerged[2], unmerged[1]), status: "unmerged" });
		}
	}

	return files.sort((a, b) => a.path.localeCompare(b.path));
}

function isNotGitRepository(stderr: string): boolean {
	return /not a git repository/i.test(stderr);
}

function filterFiles(files: ChangedFile[], staged: boolean | undefined): ChangedFile[] {
	if (staged === undefined) return files;
	return files.filter((file) => (staged ? file.staged : file.unstaged));
}

function buildTruncation(result: CapturedProcessResult): TruncationResult {
	const base = truncateHead(result.stdout);
	if (!result.stdoutTruncated) return base;
	return {
		...base,
		truncated: true,
		truncatedBy: "bytes",
		totalBytes: result.totalStdoutBytes,
		totalLines: result.totalStdoutLines,
		maxBytes: DEFAULT_MAX_BYTES,
		maxLines: DEFAULT_MAX_LINES,
	};
}

function textResult(details: ChangesToolDetails) {
	const output = {
		repository: details.repository,
		files: details.files,
		...(details.diff !== undefined ? { diff: details.diff, truncated: details.truncated ?? false } : {}),
		...(details.filesTruncated ? { filesTruncated: true } : {}),
	};
	return {
		content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
		details,
	};
}

export function createChangesToolDefinition(
	cwd: string,
	options?: ChangesToolOptions,
): ToolDefinition<typeof changesSchema, ChangesToolDetails> {
	return {
		name: "changes",
		label: "changes",
		description:
			"Inspect Git working-tree changes as a structured summary or bounded diff. Untracked files are listed but their contents are not included in diffs.",
		promptSnippet: "Inspect Git status or diffs without composing shell commands",
		parameters: changesSchema,
		async execute(_toolCallId, { view, path, staged }: ChangesToolInput, signal?: AbortSignal) {
			const statusArgs = ["status", "--porcelain=v2", "-z", "--untracked-files=all"];
			if (path) statusArgs.push("--", path);
			const status = await runGit(cwd, statusArgs, signal, STATUS_CAPTURE_BYTES);
			if (status.code !== 0) {
				if (isNotGitRepository(status.stderr)) {
					return textResult({ repository: false, files: [] });
				}
				throw new Error(status.stderr.trim() || `git status exited with code ${status.code}`);
			}

			const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;
			const fileScope = view === "diff" && staged === undefined ? false : staged;
			const parsedFiles = filterFiles(parseGitStatus(status.stdout), fileScope);
			const filesTruncated = status.stdoutTruncated || parsedFiles.length > maxFiles;
			const files = parsedFiles.slice(0, maxFiles);
			if (view === "summary") {
				return textResult({ repository: true, files, ...(filesTruncated ? { filesTruncated: true } : {}) });
			}

			const diffArgs = ["diff", "--no-ext-diff", "--no-color"];
			if (staged === true) diffArgs.push("--cached");
			if (path) diffArgs.push("--", path);
			const diffResult = await runGit(cwd, diffArgs, signal, DEFAULT_MAX_BYTES * 2);
			if (diffResult.code !== 0) {
				throw new Error(diffResult.stderr.trim() || `git diff exited with code ${diffResult.code}`);
			}
			const truncation = buildTruncation(diffResult);
			return textResult({
				repository: true,
				files,
				diff: truncation.content,
				truncated: truncation.truncated,
				...(filesTruncated ? { filesTruncated: true } : {}),
				...(truncation.truncated ? { truncation } : {}),
			});
		},
	};
}

export function createChangesTool(cwd: string, options?: ChangesToolOptions): AgentTool<typeof changesSchema> {
	return wrapToolDefinition(createChangesToolDefinition(cwd, options));
}
