import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, realpath, rename, rm, stat, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep, win32 } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { detectLineEnding, normalizeToLF, restoreLineEndings, stripBom } from "./edit-diff.ts";
import { withFileMutationQueues } from "./file-mutation-queue.ts";
import { resolveCanonicalPath } from "./path-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const MAX_PATCH_BYTES = 1024 * 1024;
const DEFAULT_MAX_OPERATIONS = 100;
const DEFAULT_MAX_PREFLIGHT_BYTES = 64 * 1024 * 1024;

const applyPatchSchema = Type.Object({
	patch: Type.String({
		description: "Patch enclosed by *** Begin Patch and *** End Patch markers",
		maxLength: MAX_PATCH_BYTES,
	}),
});

export type ApplyPatchToolInput = Static<typeof applyPatchSchema>;

export interface ApplyPatchToolDetails {
	changedFiles: string[];
	addedFiles: string[];
	updatedFiles: string[];
	deletedFiles: string[];
}

export interface ApplyPatchToolOptions {
	/** Maximum file operations accepted in one patch. Default: 100. */
	maxOperations?: number;
	/** Maximum aggregate size of existing files retained during preflight. Default: 64 MiB. */
	maxPreflightBytes?: number;
}

type PatchHunk = {
	oldLines: string[];
	newLines: string[];
};

type PatchOperation =
	| { type: "add"; path: string; content: string }
	| { type: "update"; path: string; hunks: PatchHunk[] }
	| { type: "delete"; path: string };

type ResolvedPatchOperation = PatchOperation & {
	absolutePath: string;
};

interface FileState {
	exists: boolean;
	contentHash: string | null;
	mode: number | undefined;
}

type PlannedPatchOperation = ResolvedPatchOperation & {
	original: Buffer | null;
	preflight: FileState;
	nextContent?: string;
};

function getContentHash(content: Buffer): string {
	return createHash("sha256").update(content).digest("hex");
}

function getFileMode(mode: number): number | undefined {
	return process.platform === "win32" ? undefined : mode & 0o7777;
}

async function readFileState(path: string): Promise<{ state: FileState; content: Buffer | null }> {
	try {
		const fileStats = await stat(path);
		const content = await readFile(path);
		return {
			state: {
				exists: true,
				contentHash: getContentHash(content),
				mode: getFileMode(fileStats.mode),
			},
			content,
		};
	} catch (error) {
		if (!isMissingPathError(error)) throw error;
		return { state: { exists: false, contentHash: null, mode: undefined }, content: null };
	}
}

function statesMatch(expected: FileState, actual: FileState): boolean {
	return (
		expected.exists === actual.exists && expected.contentHash === actual.contentHash && expected.mode === actual.mode
	);
}

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error.code === "ENOENT" || error.code === "ENOTDIR")
	);
}

function parseOperationHeader(line: string): { type: PatchOperation["type"]; path: string } | undefined {
	const match = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
	if (!match) return undefined;
	const action = match[1];
	return {
		type: action === "Add" ? "add" : action === "Update" ? "update" : "delete",
		path: match[2].trim(),
	};
}

function parseUpdateHunks(path: string, lines: string[]): PatchHunk[] {
	if (lines.length === 0 || !/^@@(?: .*)?$/.test(lines[0])) {
		throw new Error(`Update File ${path} must contain at least one @@ hunk.`);
	}

	const hunks: PatchHunk[] = [];
	let index = 0;
	while (index < lines.length) {
		if (!/^@@(?: .*)?$/.test(lines[index])) {
			throw new Error(`Malformed hunk header in ${path} at patch line ${index + 1}.`);
		}
		index++;
		const oldLines: string[] = [];
		const newLines: string[] = [];
		let hasChange = false;
		while (index < lines.length && !/^@@(?: .*)?$/.test(lines[index])) {
			const line = lines[index];
			const prefix = line[0];
			if (prefix !== " " && prefix !== "+" && prefix !== "-") {
				throw new Error(`Malformed hunk line in ${path}: every line must start with space, +, or -.`);
			}
			const text = line.slice(1);
			if (prefix !== "+") oldLines.push(text);
			if (prefix !== "-") newLines.push(text);
			if (prefix === "+" || prefix === "-") hasChange = true;
			index++;
		}
		if (!hasChange) {
			throw new Error(`Hunk ${hunks.length + 1} in ${path} does not contain a change.`);
		}
		if (oldLines.length === 0) {
			throw new Error(`Hunk ${hunks.length + 1} in ${path} must include context or removed lines.`);
		}
		hunks.push({ oldLines, newLines });
	}
	return hunks;
}

function parsePatch(patch: string, maxOperations: number): PatchOperation[] {
	if (Buffer.byteLength(patch, "utf-8") > MAX_PATCH_BYTES) {
		throw new Error(`Patch exceeds the ${MAX_PATCH_BYTES} byte limit.`);
	}

	const lines = patch.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	if (lines[lines.length - 1] === "") lines.pop();
	if (lines[0] !== "*** Begin Patch" || lines[lines.length - 1] !== "*** End Patch") {
		throw new Error("Patch must start with *** Begin Patch and end with *** End Patch.");
	}

	const operations: PatchOperation[] = [];
	const paths = new Set<string>();
	let index = 1;
	while (index < lines.length - 1) {
		const header = parseOperationHeader(lines[index]);
		if (!header) {
			throw new Error(`Expected a file operation header at patch line ${index + 1}.`);
		}
		index++;
		const body: string[] = [];
		while (index < lines.length - 1 && !parseOperationHeader(lines[index])) {
			body.push(lines[index]);
			index++;
		}

		const normalizedPath = header.path.replace(/\\/g, "/");
		if (paths.has(normalizedPath)) {
			throw new Error(`Patch contains more than one operation for ${header.path}.`);
		}
		paths.add(normalizedPath);

		if (header.type === "add") {
			if (body.some((line) => !line.startsWith("+"))) {
				throw new Error(`Add File ${header.path} may contain only lines prefixed with +.`);
			}
			operations.push({
				type: "add",
				path: normalizedPath,
				content: body.length > 0 ? `${body.map((line) => line.slice(1)).join("\n")}\n` : "",
			});
		} else if (header.type === "update") {
			operations.push({ type: "update", path: normalizedPath, hunks: parseUpdateHunks(header.path, body) });
		} else {
			if (body.length > 0) {
				throw new Error(`Delete File ${header.path} must not contain patch body lines.`);
			}
			operations.push({ type: "delete", path: normalizedPath });
		}

		if (operations.length > maxOperations) {
			throw new Error(`Patch exceeds the ${maxOperations} file operation limit.`);
		}
	}

	if (operations.length === 0) {
		throw new Error("Patch does not contain any file operations.");
	}
	return operations;
}

function resolvePatchPath(path: string, cwd: string): string {
	const parts = path.split("/");
	if (
		path.length === 0 ||
		path.includes("\0") ||
		isAbsolute(path) ||
		win32.isAbsolute(path) ||
		parts.includes("..") ||
		parts.every((part) => part === "" || part === ".")
	) {
		throw new Error(`Unsafe patch path: ${path}`);
	}

	const root = resolve(cwd);
	const absolutePath = resolve(root, path);
	const relativePath = relative(root, absolutePath);
	if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
		throw new Error(`Unsafe patch path: ${path}`);
	}
	return absolutePath;
}

function isPathInside(root: string, target: string): boolean {
	const relativePath = relative(root, target);
	return (
		relativePath === "" ||
		(relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
	);
}

async function assertRealPathInsideWorkspace(path: string, cwd: string) {
	const [realRoot, canonicalTarget] = await Promise.all([realpath(cwd), resolveCanonicalPath(path)]);
	if (!isPathInside(realRoot, canonicalTarget.path)) {
		throw new Error(`Unsafe patch path escapes the workspace through a symbolic link: ${path}`);
	}
	return canonicalTarget;
}

function findHunkMatch(lines: string[], oldLines: string[], start: number): number[] {
	const matches: number[] = [];
	for (let index = start; index <= lines.length - oldLines.length; index++) {
		if (oldLines.every((line, offset) => lines[index + offset] === line)) {
			matches.push(index);
		}
	}
	return matches;
}

function applyHunks(content: string, hunks: PatchHunk[], path: string): string {
	const lines = content.split("\n");
	let searchFrom = 0;
	for (let index = 0; index < hunks.length; index++) {
		const hunk = hunks[index];
		const matches = findHunkMatch(lines, hunk.oldLines, searchFrom);
		if (matches.length === 0) {
			throw new Error(`Failed to apply hunk ${index + 1} to ${path}: expected context was not found.`);
		}
		if (matches.length > 1) {
			throw new Error(`Failed to apply hunk ${index + 1} to ${path}: context matched more than once.`);
		}
		const match = matches[0];
		lines.splice(match, hunk.oldLines.length, ...hunk.newLines);
		searchFrom = match + hunk.newLines.length;
	}
	return lines.join("\n");
}

async function planPatchOperations(
	operations: ResolvedPatchOperation[],
	cwd: string,
	maxPreflightBytes: number,
	signal?: AbortSignal,
): Promise<PlannedPatchOperation[]> {
	const planned: PlannedPatchOperation[] = [];
	let preflightBytes = 0;
	const throwIfAborted = (): void => {
		if (signal?.aborted) throw new Error("Operation aborted");
	};

	for (const operation of operations) {
		throwIfAborted();
		await assertRealPathInsideWorkspace(operation.absolutePath, cwd);
		throwIfAborted();

		if (operation.type === "add") {
			const current = await readFileState(operation.absolutePath);
			if (current.state.exists) {
				throw new Error(`Cannot add ${operation.path}: file already exists.`);
			}
			planned.push({
				...operation,
				original: null,
				preflight: current.state,
				nextContent: operation.content,
			});
			continue;
		}

		const current = await readFileState(operation.absolutePath);
		if (!current.state.exists || current.content === null) {
			throw new Error(`Cannot ${operation.type} ${operation.path}: file does not exist.`);
		}
		if (current.content.byteLength > maxPreflightBytes - preflightBytes) {
			throw new Error(`Patch preflight exceeds the ${maxPreflightBytes} byte limit at ${operation.path}.`);
		}
		preflightBytes += current.content.byteLength;
		if (preflightBytes > maxPreflightBytes) {
			throw new Error(`Patch preflight exceeds the ${maxPreflightBytes} byte limit at ${operation.path}.`);
		}
		throwIfAborted();

		if (operation.type === "delete") {
			planned.push({ ...operation, original: current.content, preflight: current.state });
			continue;
		}

		const rawContent = current.content.toString("utf-8");
		const { bom, text } = stripBom(rawContent);
		const lineEnding = detectLineEnding(text);
		const normalized = normalizeToLF(text);
		const updated = applyHunks(normalized, operation.hunks, operation.path);
		planned.push({
			...operation,
			original: current.content,
			preflight: current.state,
			nextContent: bom + restoreLineEndings(updated, lineEnding),
		});
	}
	throwIfAborted();
	return planned;
}

async function writeAtomically(path: string, content: Buffer, mode: number | undefined): Promise<void> {
	const temporaryPath = resolve(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
	let fileHandle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		fileHandle = await open(temporaryPath, "wx", mode ?? 0o666);
		await fileHandle.writeFile(content);
		await fileHandle.sync();
		await fileHandle.close();
		fileHandle = undefined;
		if (mode !== undefined) await chmod(temporaryPath, mode);
		await rename(temporaryPath, path);
	} finally {
		if (fileHandle) await fileHandle.close().catch(() => undefined);
		await rm(temporaryPath, { force: true }).catch(() => undefined);
	}
}

async function assertPreflightUnchanged(operation: PlannedPatchOperation): Promise<void> {
	const current = await readFileState(operation.absolutePath);
	if (!statesMatch(operation.preflight, current.state)) {
		throw new Error(`Patch commit aborted because ${operation.path} changed after preflight.`);
	}
}

async function commitPatchOperations(planned: PlannedPatchOperation[], cwd: string): Promise<void> {
	const applied: PlannedPatchOperation[] = [];
	try {
		for (const operation of planned) {
			await assertRealPathInsideWorkspace(operation.absolutePath, cwd);
			await assertPreflightUnchanged(operation);
			if (operation.type === "delete") {
				await unlink(operation.absolutePath);
			} else {
				await mkdir(dirname(operation.absolutePath), { recursive: true });
				await writeAtomically(
					operation.absolutePath,
					Buffer.from(operation.nextContent ?? "", "utf-8"),
					operation.preflight.mode,
				);
			}
			applied.push(operation);
		}
	} catch (error) {
		const rollbackErrors: string[] = [];
		for (const operation of applied.reverse()) {
			try {
				if (operation.original === null) {
					await rm(operation.absolutePath, { force: true });
				} else {
					await mkdir(dirname(operation.absolutePath), { recursive: true });
					await writeAtomically(operation.absolutePath, operation.original, operation.preflight.mode);
				}
			} catch (rollbackError) {
				rollbackErrors.push(
					`${operation.path}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
				);
			}
		}
		const changed = applied.map((operation) => operation.path).join(", ") || "none";
		const rollback =
			rollbackErrors.length === 0 ? "Rollback completed." : `Rollback failed for ${rollbackErrors.join("; ")}.`;
		throw new Error(
			`Patch commit failed after changing ${changed}: ${error instanceof Error ? error.message : String(error)}. ${rollback}`,
		);
	}
}

function formatSummary(details: ApplyPatchToolDetails): string {
	const total = details.changedFiles.length;
	if (total === 1) {
		const action =
			details.addedFiles.length === 1 ? "added" : details.updatedFiles.length === 1 ? "updated" : "deleted";
		return `Applied patch: 1 file ${action}.`;
	}
	return `Applied patch: ${total} files changed (${details.addedFiles.length} added, ${details.updatedFiles.length} updated, ${details.deletedFiles.length} deleted).`;
}

export function createApplyPatchToolDefinition(
	cwd: string,
	options?: ApplyPatchToolOptions,
): ToolDefinition<typeof applyPatchSchema, ApplyPatchToolDetails> {
	return {
		name: "apply_patch",
		label: "apply_patch",
		description:
			"Apply a coherent multi-hunk or multi-file patch that adds, updates, or deletes files. Use for changes spanning files or distant hunks. The complete patch is preflighted before any file is changed, canonical paths enforce workspace and symlink safety, overlapping mutations are serialized, and later write failures trigger best-effort in-process rollback. This is not a filesystem transaction: process crashes, power loss, or OS interruption can still leave partial changes.",
		promptSnippet: "Apply coherent multi-hunk or multi-file changes",
		promptGuidelines: ["Use apply_patch for coherent multi-hunk or multi-file changes."],
		parameters: applyPatchSchema,
		executionMode: "sequential",
		async execute(_toolCallId, { patch }: ApplyPatchToolInput, signal?: AbortSignal) {
			if (signal?.aborted) throw new Error("Operation aborted");
			const parsed = parsePatch(patch, options?.maxOperations ?? DEFAULT_MAX_OPERATIONS);
			const resolved: ResolvedPatchOperation[] = parsed.map((operation) => ({
				...operation,
				absolutePath: resolvePatchPath(operation.path, cwd),
			}));
			const queuePaths = [...new Set(resolved.map((operation) => operation.absolutePath))].sort();
			const maxPreflightBytes = options?.maxPreflightBytes ?? DEFAULT_MAX_PREFLIGHT_BYTES;

			return withFileMutationQueues(queuePaths, async () => {
				const canonicalTargets = new Set<string>();
				for (const operation of resolved) {
					if (signal?.aborted) throw new Error("Operation aborted");
					const canonicalTarget = await assertRealPathInsideWorkspace(operation.absolutePath, cwd);
					const targetKey = canonicalTarget.caseInsensitive
						? canonicalTarget.path.toLowerCase()
						: canonicalTarget.path;
					if (canonicalTargets.has(targetKey)) {
						throw new Error(`Patch contains multiple operations for the same target: ${operation.path}.`);
					}
					canonicalTargets.add(targetKey);
				}
				const planned = await planPatchOperations(resolved, cwd, maxPreflightBytes, signal);
				if (signal?.aborted) throw new Error("Operation aborted");
				// Cancellation is honored through preflight. Once commit starts, finish or roll back
				// so an abort cannot leave a silently partial multi-file patch.
				await commitPatchOperations(planned, cwd);
				const details: ApplyPatchToolDetails = {
					changedFiles: parsed.map((operation) => operation.path),
					addedFiles: parsed.filter((operation) => operation.type === "add").map((operation) => operation.path),
					updatedFiles: parsed
						.filter((operation) => operation.type === "update")
						.map((operation) => operation.path),
					deletedFiles: parsed
						.filter((operation) => operation.type === "delete")
						.map((operation) => operation.path),
				};
				return {
					content: [{ type: "text", text: formatSummary(details) }],
					details,
				};
			});
		},
	};
}

export function createApplyPatchTool(cwd: string, options?: ApplyPatchToolOptions): AgentTool<typeof applyPatchSchema> {
	return wrapToolDefinition(createApplyPatchToolDefinition(cwd, options));
}
