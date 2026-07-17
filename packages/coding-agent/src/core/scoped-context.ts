import { dirname, isAbsolute, relative, sep } from "node:path";
import { canonicalizePath, resolvePath } from "../utils/paths.ts";
import type { ProjectContextFile, ResourceLoader } from "./resource-loader.ts";

export const DEFAULT_MAX_ACTIVE_SCOPES = 8;
export const DEFAULT_MAX_SCOPED_CONTEXT_CHARS = 32_000;

export interface ScopedContextDiagnostics {
	activeScopes: string[];
	replacedScopes: string[];
	omittedScopes: string[];
	oversizedScopes: string[];
	siblingConflicts: string[];
	activeChars: number;
}

export interface ScopedContextTrackerOptions {
	maxActiveScopes?: number;
	maxScopedContextChars?: number;
}

export interface ScopedContextLoadResult {
	addedFiles: ProjectContextFile[];
	warnings: string[];
	changed: boolean;
	diagnostics: ScopedContextDiagnostics;
}

export function getPathScopedToolPaths(toolName: string, args: Record<string, unknown>): string[] {
	if (toolName === "read" || toolName === "edit" || toolName === "write") {
		const path =
			typeof args.path === "string" ? args.path : typeof args.file_path === "string" ? args.file_path : undefined;
		return path ? [path] : [];
	}

	if (toolName === "grep" || toolName === "find" || toolName === "ls") {
		return typeof args.path === "string" && args.path.length > 0 ? [args.path] : [];
	}

	if (toolName === "apply_patch" && typeof args.patch === "string") {
		const paths: string[] = [];
		const pathPattern = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;
		for (const match of args.patch.matchAll(pathPattern)) {
			const path = match[1]?.trim();
			if (path) paths.push(path);
		}
		return paths;
	}

	return [];
}

export function isMutatingPathTool(toolName: string): boolean {
	return toolName === "edit" || toolName === "write" || toolName === "apply_patch";
}

function isWithinPath(child: string, parent: string): boolean {
	const relativePath = relative(parent, child);
	return (
		relativePath === "" ||
		(relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
	);
}

function sortPaths(paths: Iterable<string>): string[] {
	return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

function scopeDepth(scope: string): number {
	return scope.split(sep).filter(Boolean).length;
}

function emptyDiagnostics(): ScopedContextDiagnostics {
	return {
		activeScopes: [],
		replacedScopes: [],
		omittedScopes: [],
		oversizedScopes: [],
		siblingConflicts: [],
		activeChars: 0,
	};
}

interface ScopeRecord {
	directory: string;
	files: ProjectContextFile[];
}

export class ScopedContextTracker {
	private readonly cwd: string;
	private readonly resourceLoader: ResourceLoader;
	private readonly maxActiveScopes: number;
	private readonly maxScopedContextChars: number;
	private scopeRecords = new Map<string, ScopeRecord>();
	private warnings: string[] = [];
	private diagnostics: ScopedContextDiagnostics = emptyDiagnostics();

	constructor(cwd: string, resourceLoader: ResourceLoader, options?: ScopedContextTrackerOptions) {
		this.cwd = cwd;
		this.resourceLoader = resourceLoader;
		this.maxActiveScopes = options?.maxActiveScopes ?? DEFAULT_MAX_ACTIVE_SCOPES;
		this.maxScopedContextChars = options?.maxScopedContextChars ?? DEFAULT_MAX_SCOPED_CONTEXT_CHARS;
		if (!Number.isInteger(this.maxActiveScopes) || this.maxActiveScopes < 1) {
			throw new RangeError("maxActiveScopes must be a positive integer");
		}
		if (!Number.isInteger(this.maxScopedContextChars) || this.maxScopedContextChars < 1) {
			throw new RangeError("maxScopedContextChars must be a positive integer");
		}
	}

	getFiles(): ProjectContextFile[] {
		return [...this.scopeRecords.values()]
			.flatMap((record) => record.files)
			.sort((left, right) => canonicalizePath(left.path).localeCompare(canonicalizePath(right.path)));
	}

	getWarnings(): string[] {
		return this.warnings.slice();
	}

	getDiagnostics(): ScopedContextDiagnostics {
		return {
			activeScopes: this.diagnostics.activeScopes.slice(),
			replacedScopes: this.diagnostics.replacedScopes.slice(),
			omittedScopes: this.diagnostics.omittedScopes.slice(),
			oversizedScopes: this.diagnostics.oversizedScopes.slice(),
			siblingConflicts: this.diagnostics.siblingConflicts.slice(),
			activeChars: this.diagnostics.activeChars,
		};
	}

	reset(): void {
		this.scopeRecords.clear();
		this.warnings = [];
		this.diagnostics = emptyDiagnostics();
	}

	loadForToolCall(
		toolName: string,
		args: Record<string, unknown>,
		activeContextFiles: ProjectContextFile[],
	): ScopedContextLoadResult {
		const emptyResult = (changed = false): ScopedContextLoadResult => ({
			addedFiles: [],
			warnings: [],
			changed,
			diagnostics: this.getDiagnostics(),
		});
		const getAgentsFilesForPath = this.resourceLoader.getAgentsFilesForPath;
		if (!getAgentsFilesForPath) return emptyResult();

		const rawPaths = getPathScopedToolPaths(toolName, args);
		if (rawPaths.length === 0) return emptyResult();

		const previousFiles = this.getFiles();
		const previousByPath = new Map(previousFiles.map((file) => [canonicalizePath(file.path), file]));
		const trackedCanonicalPaths = new Set(previousByPath.keys());
		const trackedContents = new Set(previousFiles.map((file) => file.content));
		const baseCanonicalPaths = new Set<string>();
		const baseContents = new Set<string>();
		for (const file of activeContextFiles) {
			const canonicalPath = canonicalizePath(file.path);
			if (trackedCanonicalPaths.has(canonicalPath)) continue;
			baseCanonicalPaths.add(canonicalPath);
			baseContents.add(file.content);
		}

		const candidateFiles = new Map<string, { directory: string; file: ProjectContextFile }>();
		const requestedDirectories = new Set<string>();
		const addedWarnings: string[] = [];
		let allLookupsSuccessfulInProject = true;
		let lookupHasNonBaseContent = false;

		for (const rawPath of rawPaths) {
			try {
				const resolvedPath = resolvePath(rawPath, this.cwd, {
					normalizeUnicodeSpaces: true,
					stripAtPrefix: true,
				});
				const result = getAgentsFilesForPath.call(this.resourceLoader, resolvedPath);
				const isOutsideProject = result.diagnostics.warnings.some((warning) =>
					/outside(?: the)? project root/i.test(warning),
				);
				if (isOutsideProject) {
					allLookupsSuccessfulInProject = false;
					for (const warning of result.diagnostics.warnings) this.addWarning(warning, addedWarnings);
					continue;
				}
				if (result.diagnostics.lookupIncomplete === true || (result.diagnostics.readFailures?.length ?? 0) > 0) {
					allLookupsSuccessfulInProject = false;
				}
				if (
					result.agentsFiles.some((contextFile) => {
						const canonicalPath = canonicalizePath(contextFile.path);
						return !baseCanonicalPaths.has(canonicalPath) && !baseContents.has(contextFile.content);
					})
				) {
					lookupHasNonBaseContent = true;
				}
				for (const contextFile of result.agentsFiles) {
					const canonicalPath = canonicalizePath(contextFile.path);
					const directory = dirname(canonicalPath);
					const trackedFile = previousByPath.get(canonicalPath);
					if (trackedFile && trackedFile.content === contextFile.content) {
						requestedDirectories.add(directory);
						continue;
					}
					if (
						baseCanonicalPaths.has(canonicalPath) ||
						baseContents.has(contextFile.content) ||
						trackedContents.has(contextFile.content)
					)
						continue;
					requestedDirectories.add(directory);
					if (!candidateFiles.has(canonicalPath)) {
						candidateFiles.set(canonicalPath, { directory, file: contextFile });
					}
				}
				for (const warning of result.diagnostics.warnings) this.addWarning(warning, addedWarnings);
			} catch (error) {
				allLookupsSuccessfulInProject = false;
				const message = error instanceof Error ? error.message : String(error);
				this.addWarning(`Path-scoped context lookup failed for ${rawPath}: ${message}`, addedWarnings);
			}
		}

		const rootOnlyLookup =
			requestedDirectories.size === 0 && allLookupsSuccessfulInProject && !lookupHasNonBaseContent;
		if (requestedDirectories.size === 0 && !rootOnlyLookup) {
			return { addedFiles: [], warnings: addedWarnings, changed: false, diagnostics: this.getDiagnostics() };
		}

		const oldDirectories = [...this.scopeRecords.keys()];
		const replacedScopes = rootOnlyLookup
			? oldDirectories
			: allLookupsSuccessfulInProject
				? oldDirectories.filter(
						(oldDirectory) =>
							!Array.from(requestedDirectories).some(
								(requestedDirectory) =>
									isWithinPath(oldDirectory, requestedDirectory) ||
									isWithinPath(requestedDirectory, oldDirectory),
							),
					)
				: [];
		const nextRecords = new Map<string, ScopeRecord>();
		for (const [directory, record] of this.scopeRecords) {
			if (!replacedScopes.includes(directory)) nextRecords.set(directory, record);
		}
		for (const { directory, file } of candidateFiles.values()) {
			const record = nextRecords.get(directory) ?? { directory, files: [] };
			if (!record.files.some((existing) => canonicalizePath(existing.path) === canonicalizePath(file.path))) {
				record.files.push(file);
			}
			nextRecords.set(directory, record);
		}

		const omittedScopes = new Set<string>();
		const oversizedScopes = new Set<string>();
		const selectedRecords = new Map<string, ScopeRecord>();
		let activeChars = 0;
		const records = [...nextRecords.values()].sort(
			(left, right) =>
				scopeDepth(left.directory) - scopeDepth(right.directory) || left.directory.localeCompare(right.directory),
		);
		for (const record of records) {
			if (selectedRecords.size >= this.maxActiveScopes) {
				omittedScopes.add(record.directory);
				continue;
			}
			const files: ProjectContextFile[] = [];
			for (const file of record.files.sort((left, right) =>
				canonicalizePath(left.path).localeCompare(canonicalizePath(right.path)),
			)) {
				const chars = file.content.length;
				if (chars > this.maxScopedContextChars) {
					oversizedScopes.add(record.directory);
					continue;
				}
				if (activeChars + chars > this.maxScopedContextChars) {
					omittedScopes.add(record.directory);
					continue;
				}
				files.push(file);
				activeChars += chars;
			}
			if (files.length > 0) selectedRecords.set(record.directory, { directory: record.directory, files });
			else omittedScopes.add(record.directory);
		}

		const activeScopes = sortPaths(selectedRecords.keys());
		const siblingConflicts: string[] = [];
		for (let index = 0; index < activeScopes.length; index += 1) {
			for (const right of activeScopes.slice(index + 1)) {
				const left = activeScopes[index]!;
				if (!isWithinPath(left, right) && !isWithinPath(right, left)) siblingConflicts.push(`${left} <-> ${right}`);
			}
		}

		this.scopeRecords = selectedRecords;
		this.diagnostics = {
			activeScopes,
			replacedScopes: sortPaths(replacedScopes),
			omittedScopes: sortPaths(omittedScopes),
			oversizedScopes: sortPaths(oversizedScopes),
			siblingConflicts: sortPaths(siblingConflicts),
			activeChars,
		};

		if (this.diagnostics.oversizedScopes.length > 0) {
			this.addWarning(
				`Scoped instruction files exceeded the ${this.maxScopedContextChars}-character bound and were omitted: ${this.diagnostics.oversizedScopes.join(", ")}.`,
				addedWarnings,
			);
		}
		if (this.diagnostics.omittedScopes.length > 0) {
			this.addWarning(
				`Scoped instruction scopes were omitted by the ${this.maxActiveScopes}-scope/${this.maxScopedContextChars}-character bound: ${this.diagnostics.omittedScopes.join(", ")}.`,
				addedWarnings,
			);
		}
		if (siblingConflicts.length > 0) {
			this.addWarning(
				`Multiple sibling scoped instruction directories are active for this tool call: ${siblingConflicts.join(", ")}. Semantic conflicts are not inferred.`,
				addedWarnings,
			);
		}

		const currentFiles = this.getFiles();
		const currentByPath = new Map(currentFiles.map((file) => [canonicalizePath(file.path), file]));
		const addedFiles = currentFiles.filter((file) => {
			const previous = previousByPath.get(canonicalizePath(file.path));
			return !previous || previous.content !== file.content;
		});
		const changed =
			previousFiles.length !== currentFiles.length ||
			previousFiles.some((file) => currentByPath.get(canonicalizePath(file.path))?.content !== file.content);
		return { addedFiles, warnings: addedWarnings, changed, diagnostics: this.getDiagnostics() };
	}

	private addWarning(warning: string, addedWarnings: string[]): void {
		if (this.warnings.includes(warning)) return;
		this.warnings.push(warning);
		addedWarnings.push(warning);
	}
}
