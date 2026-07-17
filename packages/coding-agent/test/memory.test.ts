import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import lockfile from "proper-lockfile";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemoryEntry } from "../src/core/memory.ts";
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

	it("rejects add on an oversized memory file without changing its bytes", () => {
		const store = new ProjectMemoryStore(join(root, "project"), agentDir);
		mkdirSync(dirname(store.filePath), { recursive: true });
		const original = "x".repeat(MAX_MEMORY_FILE_BYTES + 1);
		writeFileSync(store.filePath, original);

		expect(() => store.add("must not replace the oversized file")).toThrow(/cannot mutate|exceeds/i);
		expect(readFileSync(store.filePath, "utf8")).toBe(original);
	});

	it("rejects an uninspectable memory path without changing the memory file", () => {
		const store = new ProjectMemoryStore(join(root, "project"), agentDir);
		mkdirSync(dirname(store.filePath), { recursive: true });
		writeFileSync(store.filePath, "existing memory bytes");
		const original = readFileSync(store.filePath, "utf8");
		rmSync(store.filePath);
		mkdirSync(store.filePath);

		expect(() => store.add("must not replace an uninspectable path")).toThrow();
		expect(statSync(store.filePath).isDirectory()).toBe(true);
		expect(original).toBe("existing memory bytes");
	});

	it("rejects a read failure without changing the memory path", () => {
		const store = new ProjectMemoryStore(join(root, "project"), agentDir);
		mkdirSync(dirname(store.filePath), { recursive: true });
		mkdirSync(store.filePath);

		expect(() => store.add("must not replace after read failure")).toThrow();
		expect(statSync(store.filePath).isDirectory()).toBe(true);
	});

	it("reports a stat failure and refuses mutation when a parent path is not a directory", () => {
		const store = new ProjectMemoryStore(join(root, "project"), agentDir);
		const projectsPath = join(agentDir, "projects");
		writeFileSync(projectsPath, "parent path bytes");

		expect(store.read()).toMatchObject({
			entries: [],
			warnings: [expect.stringContaining("Could not inspect local memory")],
		});
		expect(() => store.add("must not write through a stat failure")).toThrow();
		expect(readFileSync(projectsPath, "utf8")).toBe("parent path bytes");
	});

	it("cleans temporary files after an atomic rename failure", () => {
		const store = new ProjectMemoryStore(join(root, "project"), agentDir);
		mkdirSync(dirname(store.filePath), { recursive: true });
		mkdirSync(store.filePath);
		const write = (store as unknown as { write(entries: MemoryEntry[]): void }).write.bind(store);

		expect(() => write([])).toThrow();
		expect(readdirSync(dirname(store.filePath)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
		expect(statSync(store.filePath).isDirectory()).toBe(true);
	});

	it("rejects mutation of an unreadable existing file without changing its bytes", () => {
		if (process.platform === "win32") return;

		const store = new ProjectMemoryStore(join(root, "project"), agentDir);
		mkdirSync(dirname(store.filePath), { recursive: true });
		const original = "unreadable memory bytes";
		writeFileSync(store.filePath, original, { mode: 0o600 });
		chmodSync(store.filePath, 0o000);
		expect(statSync(store.filePath).mode & 0o777).toBe(0);

		try {
			let mutationError: unknown;
			try {
				store.add("must not rewrite an unreadable file");
			} catch (error) {
				mutationError = error;
			}
			expect(mutationError).toBeInstanceOf(Error);
			expect(mutationError).toMatchObject({ message: expect.stringContaining("Cannot mutate local memory safely") });
			expect(statSync(store.filePath).mode & 0o777).toBe(0);
		} finally {
			chmodSync(store.filePath, 0o600);
		}

		expect(readFileSync(store.filePath, "utf8")).toBe(original);
	});

	it("rejects a symlinked storage parent without writing outside the agent directory", () => {
		if (process.platform === "win32") return;

		const store = new ProjectMemoryStore(join(root, "project"), agentDir);
		const outside = join(root, "outside-memory");
		mkdirSync(outside);
		symlinkSync(outside, join(agentDir, "projects"), "dir");

		expect(() => store.add("must not follow a storage symlink")).toThrow(/memory|symbolic|directory/i);
		expect(readdirSync(outside)).toEqual([]);
	});

	it("rejects a symlinked memory file without changing its target", () => {
		if (process.platform === "win32") return;

		const store = new ProjectMemoryStore(join(root, "project"), agentDir);
		mkdirSync(dirname(store.filePath), { recursive: true });
		const outside = join(root, "outside-memory.jsonl");
		const original = "outside memory bytes";
		writeFileSync(outside, original);
		symlinkSync(outside, store.filePath);

		expect(store.read()).toMatchObject({
			entries: [],
			warnings: [expect.stringContaining("regular file")],
		});
		expect(() => store.add("must not follow a memory-file symlink")).toThrow(/safely|regular file|symbolic/i);
		expect(readFileSync(outside, "utf8")).toBe(original);
	});

	it("rejects mutation when malformed existing lines would otherwise be discarded", () => {
		const store = new ProjectMemoryStore(join(root, "project"), agentDir);
		mkdirSync(dirname(store.filePath), { recursive: true });
		const original = [
			"not json",
			JSON.stringify({ id: "valid", createdAt: "2026-01-01T00:00:00.000Z", category: "note", text: "keep" }),
		].join("\n");
		writeFileSync(store.filePath, original);

		expect(() => store.add("must preserve malformed bytes")).toThrow(/malformed|safely/i);
		expect(readFileSync(store.filePath, "utf8")).toBe(original);
	});

	it("supports a missing project root without writing repository files", () => {
		const store = new ProjectMemoryStore(join(root, "missing-project"), agentDir);
		const result = store.add("A local note.");

		expect(result.created).toBe(true);
		expect(store.filePath.startsWith(agentDir)).toBe(true);
	});

	it("supports mutation of an existing empty memory file", () => {
		const store = new ProjectMemoryStore(join(root, "empty-project"), agentDir);
		mkdirSync(dirname(store.filePath), { recursive: true });
		writeFileSync(store.filePath, "");

		const result = store.add("A note in an explicitly empty file.");

		expect(result.created).toBe(true);
		expect(store.read().entries).toHaveLength(1);
	});

	it("rejects mutation while another writer holds the memory lock", () => {
		const store = new ProjectMemoryStore(join(root, "locked-project"), agentDir);
		const first = store.add("The existing entry must survive lock contention.");
		const release = lockfile.lockSync(store.filePath, { realpath: false });

		try {
			expect(() => store.add("This entry must not be written while locked.")).toThrow(/lock/i);
			expect(store.read().entries.map((entry) => entry.id)).toEqual([first.entry.id]);
		} finally {
			release();
		}

		expect(store.add("The writer can continue after the lock is released.").created).toBe(true);
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
