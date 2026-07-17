import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	getProjectMemoryPath,
	MAX_MEMORY_ENTRIES,
	MAX_MEMORY_ENTRY_TEXT_CHARS,
	MAX_MEMORY_FILE_BYTES,
	ProjectMemoryStore,
	scanMemoryText,
} from "../src/core/memory.ts";

describe("ProjectMemoryStore", () => {
	let root: string;
	let agentDir: string;

	beforeEach(() => {
		root = join(tmpdir(), `pi-memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(root, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("uses a stable project-scoped location outside the repository", () => {
		const projectPath = getProjectMemoryPath(join(root, "project"), agentDir);
		const otherProjectPath = getProjectMemoryPath(join(root, "other"), agentDir);

		expect(projectPath).toContain(join(agentDir, "projects"));
		expect(projectPath).not.toBe(otherProjectPath);
	});

	it("supports add, search, duplicate detection, inspect, and delete", () => {
		const store = new ProjectMemoryStore(join(root, "project"), agentDir);

		expect(store.read()).toEqual({ entries: [], warnings: [] });
		const first = store.add("Use the package-local check command.", "convention");
		expect(first.created).toBe(true);
		expect(store.add("Use the package-local check command.", "convention").created).toBe(false);
		expect(store.search("package-local").entries).toHaveLength(1);
		expect(store.read().entries[0]).toMatchObject({
			id: first.entry.id,
			category: "convention",
			text: "Use the package-local check command.",
		});
		expect(store.forget(first.entry.id)).toBe(true);
		expect(store.forget(first.entry.id)).toBe(false);
		expect(store.read().entries).toEqual([]);
	});

	it("supports editing an entry without changing its identity", () => {
		const store = new ProjectMemoryStore(join(root, "project"), agentDir);
		const first = store.add("Use the original validation command.", "convention");

		const edited = store.edit(first.entry.id, "Use the focused validation command.");
		expect(edited).toMatchObject({ updated: true, entry: { id: first.entry.id, category: "convention" } });
		expect(store.search("focused validation").entries).toHaveLength(1);
		expect(store.search("original validation").entries).toHaveLength(0);
		expect(store.edit("missing", "No entry")).toBeUndefined();
	});

	it("reports malformed entries without making them authoritative", () => {
		const store = new ProjectMemoryStore(join(root, "project"), agentDir);
		mkdirSync(join(store.filePath, ".."), { recursive: true });
		writeFileSync(
			store.filePath,
			[
				"not json",
				JSON.stringify({ id: "valid", createdAt: "2026-01-01T00:00:00.000Z", category: "note", text: "valid" }),
			].join("\n"),
		);

		const result = store.read();
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]?.id).toBe("valid");
		expect(result.warnings[0]).toContain("line 1");
	});

	it("rejects common secret patterns before persistence", () => {
		const store = new ProjectMemoryStore(join(root, "project"), agentDir);

		expect(scanMemoryText("API_KEY=not-a-memory-value")).toContain("credential assignment");
		expect(scanMemoryText("OPENAI_API_KEY=abcdefghijk")).toContain("credential assignment");
		expect(scanMemoryText("AWS_SECRET_ACCESS_KEY=abcdefghijk")).toContain("credential assignment");
		expect(() => store.add("Remember API_KEY=abcdefghijk", "note")).toThrow(/not saved/);
		expect(store.read().entries).toEqual([]);
	});

	it("bounds new entries and rejects an entry-count overflow", () => {
		const store = new ProjectMemoryStore(join(root, "project"), agentDir);

		expect(() => store.add("x".repeat(MAX_MEMORY_ENTRY_TEXT_CHARS + 1))).toThrow(/character limit/);
		for (let index = 0; index < MAX_MEMORY_ENTRIES; index += 1) {
			store.add(`bounded entry ${index}`);
		}
		expect(() => store.add("one entry too many")).toThrow(/maximum/);
		expect(store.read().entries).toHaveLength(MAX_MEMORY_ENTRIES);
	});

	it("omits oversized existing entries and files without echoing their content", () => {
		const store = new ProjectMemoryStore(join(root, "project"), agentDir);
		mkdirSync(dirname(store.filePath), { recursive: true });
		const oversizedText = "secret-looking-content-".repeat(500);
		writeFileSync(
			store.filePath,
			[
				JSON.stringify({
					id: "oversized",
					createdAt: "2026-01-01T00:00:00.000Z",
					category: "note",
					text: oversizedText,
				}),
				JSON.stringify({ id: "valid", createdAt: "2026-01-01T00:00:00.000Z", category: "note", text: "valid" }),
			].join("\n"),
		);

		const result = store.read();
		expect(result.entries.map((entry) => entry.id)).toEqual(["valid"]);
		expect(result.warnings.join(" ")).not.toContain(oversizedText);

		writeFileSync(store.filePath, "x".repeat(MAX_MEMORY_FILE_BYTES + 1));
		const oversizedFile = store.read();
		expect(oversizedFile.entries).toEqual([]);
		expect(oversizedFile.warnings.join(" ")).not.toContain("x".repeat(100));
	});

	it("supports a missing project root without writing repository files", () => {
		const store = new ProjectMemoryStore(join(root, "missing-project"), agentDir);
		const result = store.add("A local note.");

		expect(result.created).toBe(true);
		expect(store.filePath.startsWith(agentDir)).toBe(true);
	});

	it("serializes mutations across store instances and uses restrictive storage permissions", () => {
		const project = join(root, "project");
		const firstStore = new ProjectMemoryStore(project, agentDir);
		const secondStore = new ProjectMemoryStore(project, agentDir);

		const first = firstStore.add("First process note.");
		const second = secondStore.add("Second process note.");

		expect(secondStore.read().entries.map((entry) => entry.id)).toEqual([first.entry.id, second.entry.id]);
		expect(readdirSync(dirname(firstStore.filePath)).filter((name) => name.endsWith(".tmp"))).toEqual([]);

		if (process.platform !== "win32") {
			expect(statSync(dirname(firstStore.filePath)).mode & 0o777).toBe(0o700);
			expect(statSync(firstStore.filePath).mode & 0o777).toBe(0o600);
		}
	});
});
