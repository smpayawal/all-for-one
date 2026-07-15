import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalizePath, resolvePath } from "../utils/paths.ts";

export type MemoryCategory = "decision" | "correction" | "convention" | "tool-quirk" | "note";

export interface MemoryEntry {
	id: string;
	createdAt: string;
	category: MemoryCategory;
	text: string;
}

export interface MemoryReadResult {
	entries: MemoryEntry[];
	warnings: string[];
}

export interface MemoryAddResult {
	entry: MemoryEntry;
	created: boolean;
}

export interface MemoryEditResult {
	entry: MemoryEntry;
	updated: boolean;
}

const MEMORY_FILE_NAME = "memory.jsonl";

const SECRET_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
	{ label: "private key", pattern: /-----BEGIN [^-]*PRIVATE KEY-----/i },
	{
		label: "provider token",
		pattern: /\b(?:sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|github_pat_|xox[baprs]-|AIza[0-9A-Za-z_-]{16,})/,
	},
	{
		label: "credential assignment",
		pattern:
			/(?:[A-Z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret(?:[_-][A-Z0-9]+)*|private[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=:-]{8,}/i,
	},
];

export function scanMemoryText(text: string): string[] {
	return SECRET_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}

export function getProjectMemoryPath(cwd: string, agentDir: string): string {
	const projectIdentity = canonicalizePath(resolvePath(cwd));
	const projectId = createHash("sha256").update(projectIdentity, "utf8").digest("hex").slice(0, 24);
	return join(resolvePath(agentDir), "projects", projectId, MEMORY_FILE_NAME);
}

function isMemoryCategory(value: unknown): value is MemoryCategory {
	return (
		value === "decision" ||
		value === "correction" ||
		value === "convention" ||
		value === "tool-quirk" ||
		value === "note"
	);
}

function parseMemoryLine(line: string, lineNumber: number): { entry?: MemoryEntry; warning?: string } {
	try {
		const value: unknown = JSON.parse(line);
		if (!value || typeof value !== "object") throw new Error("entry is not an object");
		const candidate = value as Partial<MemoryEntry>;
		if (
			typeof candidate.id !== "string" ||
			typeof candidate.createdAt !== "string" ||
			typeof candidate.text !== "string" ||
			!isMemoryCategory(candidate.category)
		) {
			throw new Error("entry has an invalid shape");
		}
		return { entry: candidate as MemoryEntry };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { warning: `Ignored malformed memory entry on line ${lineNumber}: ${message}.` };
	}
}

export class ProjectMemoryStore {
	readonly filePath: string;

	constructor(cwd: string, agentDir: string) {
		this.filePath = getProjectMemoryPath(cwd, agentDir);
	}

	read(): MemoryReadResult {
		if (!existsSync(this.filePath)) return { entries: [], warnings: [] };

		let content: string;
		try {
			content = readFileSync(this.filePath, "utf8");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { entries: [], warnings: [`Could not read local memory: ${message}.`] };
		}

		const entries: MemoryEntry[] = [];
		const warnings: string[] = [];
		for (const [index, line] of content.split("\n").entries()) {
			if (line.trim().length === 0) continue;
			const parsed = parseMemoryLine(line, index + 1);
			if (parsed.entry) entries.push(parsed.entry);
			if (parsed.warning) warnings.push(parsed.warning);
		}
		return { entries, warnings };
	}

	add(text: string, category: MemoryCategory = "note"): MemoryAddResult {
		const normalizedText = text.trim();
		if (normalizedText.length === 0) throw new Error("Memory text cannot be empty.");
		const secrets = scanMemoryText(normalizedText);
		if (secrets.length > 0) {
			throw new Error(`Memory was not saved because it matched a possible ${secrets.join(", ")} pattern.`);
		}

		const current = this.read().entries;
		const duplicate = current.find((entry) => entry.category === category && entry.text === normalizedText);
		if (duplicate) return { entry: duplicate, created: false };

		const entry: MemoryEntry = {
			id: `mem_${randomUUID()}`,
			createdAt: new Date().toISOString(),
			category,
			text: normalizedText,
		};
		this.write([...current, entry]);
		return { entry, created: true };
	}

	edit(id: string, text: string, category?: MemoryCategory): MemoryEditResult | undefined {
		const normalizedId = id.trim();
		const normalizedText = text.trim();
		if (!normalizedId) throw new Error("A memory id is required.");
		if (!normalizedText) throw new Error("Memory text cannot be empty.");
		const secrets = scanMemoryText(normalizedText);
		if (secrets.length > 0) {
			throw new Error(`Memory was not saved because it matched a possible ${secrets.join(", ")} pattern.`);
		}

		const current = this.read().entries;
		const index = current.findIndex((entry) => entry.id === normalizedId);
		if (index === -1) return undefined;

		const existing = current[index];
		const nextCategory = category ?? existing.category;
		const duplicate = current.find(
			(entry) => entry.id !== normalizedId && entry.category === nextCategory && entry.text === normalizedText,
		);
		if (duplicate) throw new Error(`Memory already exists as ${duplicate.id}.`);

		if (existing.text === normalizedText && existing.category === nextCategory) {
			return { entry: existing, updated: false };
		}

		const entry: MemoryEntry = { ...existing, category: nextCategory, text: normalizedText };
		const updatedEntries = [...current];
		updatedEntries[index] = entry;
		this.write(updatedEntries);
		return { entry, updated: true };
	}

	search(query: string): MemoryReadResult {
		const result = this.read();
		const normalizedQuery = query.trim().toLocaleLowerCase();
		if (normalizedQuery.length === 0) return result;
		return {
			...result,
			entries: result.entries.filter(
				(entry) =>
					entry.text.toLocaleLowerCase().includes(normalizedQuery) ||
					entry.category.toLocaleLowerCase().includes(normalizedQuery) ||
					entry.id.toLocaleLowerCase().includes(normalizedQuery),
			),
		};
	}

	forget(id: string): boolean {
		const current = this.read().entries;
		const remaining = current.filter((entry) => entry.id !== id.trim());
		if (remaining.length === current.length) return false;
		this.write(remaining);
		return true;
	}

	private write(entries: MemoryEntry[]): void {
		mkdirSync(dirname(this.filePath), { recursive: true });
		const content = entries.length > 0 ? `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n` : "";
		writeFileSync(this.filePath, content, "utf8");
	}
}
