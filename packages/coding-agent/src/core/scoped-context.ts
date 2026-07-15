import { dirname, isAbsolute, relative } from "node:path";
import { canonicalizePath, resolvePath } from "../utils/paths.ts";
import type { ProjectContextFile, ResourceLoader } from "./resource-loader.ts";

export interface ScopedContextLoadResult {
	addedFiles: ProjectContextFile[];
	warnings: string[];
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
	return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export class ScopedContextTracker {
	private readonly cwd: string;
	private readonly resourceLoader: ResourceLoader;
	private scopedContextFiles: ProjectContextFile[] = [];
	private warnings: string[] = [];

	constructor(cwd: string, resourceLoader: ResourceLoader) {
		this.cwd = cwd;
		this.resourceLoader = resourceLoader;
	}

	getFiles(): ProjectContextFile[] {
		return this.scopedContextFiles.slice();
	}

	getWarnings(): string[] {
		return this.warnings.slice();
	}

	reset(): void {
		this.scopedContextFiles = [];
		this.warnings = [];
	}

	loadForToolCall(
		toolName: string,
		args: Record<string, unknown>,
		activeContextFiles: ProjectContextFile[],
	): ScopedContextLoadResult {
		const getAgentsFilesForPath = this.resourceLoader.getAgentsFilesForPath;
		if (!getAgentsFilesForPath) return { addedFiles: [], warnings: [] };

		const rawPaths = getPathScopedToolPaths(toolName, args);
		if (rawPaths.length === 0) return { addedFiles: [], warnings: [] };

		const knownCanonicalPaths = new Set(activeContextFiles.map((file) => canonicalizePath(file.path)));
		const knownContents = new Set(activeContextFiles.map((file) => file.content));
		const newlyRelevantFiles: ProjectContextFile[] = [];
		const addedWarnings: string[] = [];

		for (const rawPath of rawPaths) {
			try {
				const resolvedPath = resolvePath(rawPath, this.cwd, {
					normalizeUnicodeSpaces: true,
					stripAtPrefix: true,
				});
				const result = getAgentsFilesForPath.call(this.resourceLoader, resolvedPath);
				for (const contextFile of result.agentsFiles) {
					const canonicalPath = canonicalizePath(contextFile.path);
					if (knownCanonicalPaths.has(canonicalPath) || knownContents.has(contextFile.content)) continue;
					knownCanonicalPaths.add(canonicalPath);
					knownContents.add(contextFile.content);
					newlyRelevantFiles.push(contextFile);
				}
				for (const warning of result.diagnostics.warnings) {
					this.addWarning(warning, addedWarnings);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.addWarning(`Path-scoped context lookup failed for ${rawPath}: ${message}`, addedWarnings);
			}
		}

		if (newlyRelevantFiles.length > 0) {
			this.scopedContextFiles.push(...newlyRelevantFiles);
			this.addSiblingScopeWarning(addedWarnings);
		}

		return { addedFiles: newlyRelevantFiles, warnings: addedWarnings };
	}

	private addWarning(warning: string, addedWarnings: string[]): void {
		if (this.warnings.includes(warning)) return;
		this.warnings.push(warning);
		addedWarnings.push(warning);
	}

	private addSiblingScopeWarning(addedWarnings: string[]): void {
		const directories = [
			...new Set(this.scopedContextFiles.map((file) => dirname(canonicalizePath(file.path)))),
		].sort();
		const hasSiblingScopes = directories.some((left, index) =>
			directories.slice(index + 1).some((right) => !isWithinPath(left, right) && !isWithinPath(right, left)),
		);
		if (!hasSiblingScopes) return;

		this.addWarning(
			`Multiple sibling scoped instruction directories are active: ${directories.join(", ")}. Scoped instructions accumulate for this session.`,
			addedWarnings,
		);
	}
}
