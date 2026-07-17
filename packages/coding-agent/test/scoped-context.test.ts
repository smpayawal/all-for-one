import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectContextFile, ResourceLoader } from "../src/core/resource-loader.ts";
import {
	DEFAULT_MAX_ACTIVE_SCOPES,
	DEFAULT_MAX_SCOPED_CONTEXT_CHARS,
	ScopedContextTracker,
} from "../src/core/scoped-context.ts";
import { canonicalizePath } from "../src/utils/paths.ts";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function createFixture() {
	const cwd = join(tmpdir(), `pi-scoped-context-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	const frontend = join(cwd, "frontend");
	const backend = join(cwd, "backend");
	mkdirSync(join(frontend, "src"), { recursive: true });
	mkdirSync(join(backend, "src"), { recursive: true });
	writeFileSync(join(cwd, "AGENTS.md"), "Root instructions");
	writeFileSync(join(frontend, "AGENTS.md"), "Frontend instructions");
	writeFileSync(join(backend, "AGENTS.md"), "Backend instructions");
	tempDirectories.push(cwd);

	const root: ProjectContextFile = { path: join(cwd, "AGENTS.md"), content: "Root instructions" };
	const frontendFile: ProjectContextFile = {
		path: join(frontend, "AGENTS.md"),
		content: "Frontend instructions",
	};
	const backendFile: ProjectContextFile = { path: join(backend, "AGENTS.md"), content: "Backend instructions" };

	function result(agentsFiles: ProjectContextFile[], warnings: string[] = []) {
		return {
			agentsFiles,
			diagnostics: {
				discoveredCount: agentsFiles.length,
				activeCount: agentsFiles.length,
				totalChars: agentsFiles.reduce((total, file) => total + file.content.length, 0),
				totalBytes: agentsFiles.reduce((total, file) => total + Buffer.byteLength(file.content, "utf8"), 0),
				duplicatePathCount: 0,
				duplicateContentCount: 0,
				duplicatePaths: [],
				duplicateContentPaths: [],
				warnings,
			},
		};
	}

	const resourceLoader = {
		getAgentsFilesForPath(targetPath: string) {
			if (targetPath.includes("outside")) return result([], ["outside project root"]);
			if (targetPath.includes("failed")) throw new Error("lookup failed");
			if (targetPath.includes("frontend")) return result([root, frontendFile]);
			if (targetPath.includes("backend")) return result([root, backendFile]);
			return result([root]);
		},
	} as unknown as ResourceLoader;

	return { cwd, root, frontend, backend, frontendFile, backendFile, resourceLoader };
}

describe("ScopedContextTracker", () => {
	it("uses the documented bounded defaults", () => {
		expect(DEFAULT_MAX_ACTIVE_SCOPES).toBe(8);
		expect(DEFAULT_MAX_SCOPED_CONTEXT_CHARS).toBe(32_000);
	});

	it("loads parent-child scopes and retains the first-mutation barrier inputs", () => {
		const fixture = createFixture();
		const tracker = new ScopedContextTracker(fixture.cwd, fixture.resourceLoader);
		const loaded = tracker.loadForToolCall("read", { path: "frontend/src/App.tsx" }, [fixture.root]);

		expect(loaded.changed).toBe(true);
		expect(loaded.addedFiles).toEqual([fixture.frontendFile]);
		expect(tracker.getFiles()).toEqual([fixture.frontendFile]);
		expect(tracker.getDiagnostics()).toMatchObject({
			activeScopes: [canonicalizePath(fixture.frontend)],
			activeChars: fixture.frontendFile.content.length,
		});
	});

	it("replaces unrelated siblings and permits a bounded multi-sibling union", () => {
		const fixture = createFixture();
		const tracker = new ScopedContextTracker(fixture.cwd, fixture.resourceLoader, {
			maxActiveScopes: 2,
		});
		tracker.loadForToolCall("read", { path: "frontend/src/App.tsx" }, [fixture.root]);

		const switched = tracker.loadForToolCall("write", { path: "backend/src/api.ts" }, [
			fixture.root,
			fixture.frontendFile,
		]);
		expect(switched.addedFiles).toEqual([fixture.backendFile]);
		expect(switched.diagnostics.replacedScopes).toEqual([canonicalizePath(fixture.frontend)]);
		expect(tracker.getFiles()).toEqual([fixture.backendFile]);

		const union = tracker.loadForToolCall(
			"apply_patch",
			{
				patch: "*** Begin Patch\n*** Update File: frontend/src/App.tsx\n@@\n-a\n+b\n*** Update File: backend/src/api.ts\n@@\n-a\n+b\n*** End Patch",
			},
			[fixture.root, fixture.backendFile],
		);
		expect(union.diagnostics.activeScopes).toEqual(
			[canonicalizePath(fixture.backend), canonicalizePath(fixture.frontend)].sort(),
		);
		expect(union.diagnostics.siblingConflicts).toHaveLength(1);
		expect(union.warnings).toContainEqual(expect.stringContaining("Semantic conflicts are not inferred"));

		const rootOnly = tracker.loadForToolCall("read", { path: "README.md" }, [
			fixture.root,
			fixture.frontendFile,
			fixture.backendFile,
		]);
		expect(rootOnly.changed).toBe(true);
		expect(rootOnly.diagnostics.activeScopes).toEqual([]);
		expect(rootOnly.diagnostics.replacedScopes).toEqual(
			[canonicalizePath(fixture.backend), canonicalizePath(fixture.frontend)].sort(),
		);
		expect(tracker.getFiles()).toEqual([]);
	});

	it("clears a nested scope when a later file resolves to root-only instructions", () => {
		const fixture = createFixture();
		const tracker = new ScopedContextTracker(fixture.cwd, fixture.resourceLoader);

		tracker.loadForToolCall("read", { path: "frontend/src/App.tsx" }, [fixture.root]);
		const rootOnly = tracker.loadForToolCall("read", { path: "README.md" }, [fixture.root, fixture.frontendFile]);

		expect(rootOnly.changed).toBe(true);
		expect(rootOnly.addedFiles).toEqual([]);
		expect(rootOnly.diagnostics.activeScopes).toEqual([]);
		expect(rootOnly.diagnostics.replacedScopes).toEqual([canonicalizePath(fixture.frontend)]);
		expect(tracker.getFiles()).toEqual([]);
	});

	it("clears nested scopes for a directory without nested instructions", () => {
		const fixture = createFixture();
		const tracker = new ScopedContextTracker(fixture.cwd, fixture.resourceLoader);

		tracker.loadForToolCall("read", { path: "frontend/src/App.tsx" }, [fixture.root]);
		const directoryOnly = tracker.loadForToolCall("ls", { path: "docs" }, [fixture.root, fixture.frontendFile]);

		expect(directoryOnly.changed).toBe(true);
		expect(directoryOnly.diagnostics.replacedScopes).toEqual([canonicalizePath(fixture.frontend)]);
		expect(tracker.getFiles()).toEqual([]);
	});

	it("clears a nested scope when the target only resolves to duplicate root instructions", () => {
		const fixture = createFixture();
		const duplicateRoot = { path: join(fixture.cwd, "duplicate-root", "AGENTS.md"), content: fixture.root.content };
		const loader = {
			getAgentsFilesForPath(targetPath: string) {
				return {
					agentsFiles: targetPath.includes("frontend")
						? [fixture.root, fixture.frontendFile]
						: [fixture.root, duplicateRoot],
					diagnostics: {
						discoveredCount: 2,
						activeCount: 2,
						totalChars: 0,
						totalBytes: 0,
						duplicatePathCount: 0,
						duplicateContentCount: 1,
						duplicatePaths: [],
						duplicateContentPaths: [],
						warnings: ["duplicate root instructions"],
					},
				};
			},
		} as unknown as ResourceLoader;
		const tracker = new ScopedContextTracker(fixture.cwd, loader);

		tracker.loadForToolCall("read", { path: "frontend/src/App.tsx" }, [fixture.root]);
		const duplicateOnly = tracker.loadForToolCall("read", { path: "docs/guide.md" }, [
			fixture.root,
			fixture.frontendFile,
		]);

		expect(duplicateOnly.changed).toBe(true);
		expect(duplicateOnly.diagnostics.replacedScopes).toEqual([canonicalizePath(fixture.frontend)]);
		expect(tracker.getFiles()).toEqual([]);
	});

	it("does not rebuild effective context when a root-only lookup leaves no nested scope active", () => {
		const fixture = createFixture();
		const tracker = new ScopedContextTracker(fixture.cwd, fixture.resourceLoader);

		const first = tracker.loadForToolCall("read", { path: "README.md" }, [fixture.root]);
		const second = tracker.loadForToolCall("read", { path: "docs/guide.md" }, [fixture.root]);

		expect(first.changed).toBe(false);
		expect(second.changed).toBe(false);
		expect(second.diagnostics.replacedScopes).toEqual([]);
	});

	it("deduplicates identical scoped content", () => {
		const fixture = createFixture();
		const duplicateBackend = { ...fixture.backendFile, content: fixture.frontendFile.content };
		const loader = {
			getAgentsFilesForPath(targetPath: string) {
				return {
					agentsFiles: targetPath.includes("backend")
						? [fixture.root, duplicateBackend]
						: [fixture.root, fixture.frontendFile],
					diagnostics: {
						discoveredCount: 2,
						activeCount: 2,
						totalChars: 0,
						totalBytes: 0,
						duplicatePathCount: 0,
						duplicateContentCount: 0,
						duplicatePaths: [],
						duplicateContentPaths: [],
						warnings: [],
					},
				};
			},
		} as unknown as ResourceLoader;
		const tracker = new ScopedContextTracker(fixture.cwd, loader);
		tracker.loadForToolCall("read", { path: "frontend/src/App.tsx" }, [fixture.root]);
		const duplicate = tracker.loadForToolCall("read", { path: "backend/src/api.ts" }, [
			fixture.root,
			fixture.frontendFile,
		]);

		expect(duplicate.addedFiles).toEqual([]);
		expect(tracker.getFiles()).toEqual([fixture.frontendFile]);
	});

	it("reports oversized and character-budget omissions without loading content", () => {
		const fixture = createFixture();
		const oversized = { ...fixture.frontendFile, content: "x".repeat(20) };
		const loader = {
			getAgentsFilesForPath: () => ({
				agentsFiles: [fixture.root, oversized],
				diagnostics: {
					discoveredCount: 2,
					activeCount: 2,
					totalChars: 0,
					totalBytes: 0,
					duplicatePathCount: 0,
					duplicateContentCount: 0,
					duplicatePaths: [],
					duplicateContentPaths: [],
					warnings: [],
				},
			}),
		} as unknown as ResourceLoader;
		const tracker = new ScopedContextTracker(fixture.cwd, loader, { maxScopedContextChars: 10 });
		const loaded = tracker.loadForToolCall("read", { path: "frontend/src/App.tsx" }, [fixture.root]);

		expect(loaded.addedFiles).toEqual([]);
		expect(loaded.diagnostics.oversizedScopes).toEqual([canonicalizePath(fixture.frontend)]);
		expect(loaded.diagnostics.activeChars).toBe(0);
		expect(loaded.warnings.join(" ")).toContain("character bound");
	});

	it("keeps lookup outside the root diagnostic-only and supports reset/reload", () => {
		const fixture = createFixture();
		const tracker = new ScopedContextTracker(fixture.cwd, fixture.resourceLoader);
		const outside = tracker.loadForToolCall("read", { path: "outside/file.ts" }, [fixture.root]);
		expect(outside.addedFiles).toEqual([]);
		expect(outside.warnings).toContain("outside project root");

		tracker.loadForToolCall("read", { path: "frontend/src/App.tsx" }, [fixture.root]);
		expect(tracker.getFiles()).toHaveLength(1);
		const outsideAfterScoped = tracker.loadForToolCall("read", { path: "outside/another.ts" }, [
			fixture.root,
			fixture.frontendFile,
		]);
		expect(outsideAfterScoped.changed).toBe(false);
		expect(tracker.getFiles()).toEqual([fixture.frontendFile]);
		tracker.reset();
		expect(tracker.getFiles()).toEqual([]);
		expect(tracker.getDiagnostics()).toEqual({
			activeScopes: [],
			replacedScopes: [],
			omittedScopes: [],
			oversizedScopes: [],
			siblingConflicts: [],
			activeChars: 0,
		});
	});

	it("preserves a nested scope when a root-only target shares a batch with an outside target", () => {
		const fixture = createFixture();
		const tracker = new ScopedContextTracker(fixture.cwd, fixture.resourceLoader);

		tracker.loadForToolCall("read", { path: "frontend/src/App.tsx" }, [fixture.root]);
		const mixed = tracker.loadForToolCall(
			"apply_patch",
			{
				patch: "*** Begin Patch\n*** Update File: README.md\n*** Update File: outside/file.ts\n*** End Patch",
			},
			[fixture.root, fixture.frontendFile],
		);

		expect(mixed.changed).toBe(false);
		expect(mixed.diagnostics.replacedScopes).toEqual([]);
		expect(tracker.getFiles()).toEqual([fixture.frontendFile]);
	});

	it("preserves a nested scope when a root-only target shares a batch with a failed lookup", () => {
		const fixture = createFixture();
		const tracker = new ScopedContextTracker(fixture.cwd, fixture.resourceLoader);

		tracker.loadForToolCall("read", { path: "frontend/src/App.tsx" }, [fixture.root]);
		const mixed = tracker.loadForToolCall(
			"apply_patch",
			{
				patch: "*** Begin Patch\n*** Update File: README.md\n*** Update File: failed/file.ts\n*** End Patch",
			},
			[fixture.root, fixture.frontendFile],
		);

		expect(mixed.changed).toBe(false);
		expect(mixed.diagnostics.replacedScopes).toEqual([]);
		expect(mixed.warnings).toContainEqual(expect.stringContaining("Path-scoped context lookup failed"));
		expect(tracker.getFiles()).toEqual([fixture.frontendFile]);
	});

	it("retains the current scope when a nested target shares a batch with a failed sibling", () => {
		const fixture = createFixture();
		const tracker = new ScopedContextTracker(fixture.cwd, fixture.resourceLoader);

		tracker.loadForToolCall("read", { path: "frontend/src/App.tsx" }, [fixture.root]);
		const mixed = tracker.loadForToolCall(
			"apply_patch",
			{
				patch: "*** Begin Patch\n*** Update File: backend/src/api.ts\n*** Update File: failed/file.ts\n*** End Patch",
			},
			[fixture.root, fixture.frontendFile],
		);

		expect(mixed.changed).toBe(true);
		expect(mixed.diagnostics.replacedScopes).toEqual([]);
		expect(tracker.getFiles()).toEqual(expect.arrayContaining([fixture.frontendFile, fixture.backendFile]));
	});

	it("clears nested scopes only after every root-only target resolves successfully", () => {
		const fixture = createFixture();
		const tracker = new ScopedContextTracker(fixture.cwd, fixture.resourceLoader);

		tracker.loadForToolCall("read", { path: "frontend/src/App.tsx" }, [fixture.root]);
		const rootOnly = tracker.loadForToolCall(
			"apply_patch",
			{
				patch: "*** Begin Patch\n*** Update File: README.md\n*** Update File: docs/guide.md\n*** End Patch",
			},
			[fixture.root, fixture.frontendFile],
		);

		expect(rootOnly.changed).toBe(true);
		expect(rootOnly.diagnostics.replacedScopes).toEqual([canonicalizePath(fixture.frontend)]);
		expect(tracker.getFiles()).toEqual([]);
	});
});
