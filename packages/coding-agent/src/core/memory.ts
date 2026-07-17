import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import lockfile from "proper-lockfile";
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
export const MAX_MEMORY_ENTRY_TEXT_CHARS = 8_000;
export const MAX_MEMORY_ENTRIES = 256;
export const MAX_MEMORY_FILE_BYTES = 1_048_576;
export const MEMORY_SECRET_DETECTION_WARNING =
	"Secret detection is best-effort; do not store credentials or other sensitive values in local memory.";

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
		if (candidate.text.length > MAX_MEMORY_ENTRY_TEXT_CHARS) {
			return {
				warning: `Ignored oversized memory entry on line ${lineNumber}; text exceeds ${MAX_MEMORY_ENTRY_TEXT_CHARS} characters.`,
			};
		}
		return { entry: candidate as MemoryEntry };
	} catch {
		return { warning: `Ignored malformed memory entry on line ${lineNumber}.` };
	}
}

function normalizeMemoryText(text: string): string {
	const normalizedText = text.trim();
	if (normalizedText.length === 0) throw new Error("Memory text cannot be empty.");
	if (normalizedText.length > MAX_MEMORY_ENTRY_TEXT_CHARS) {
		throw new Error(`Memory text exceeds the ${MAX_MEMORY_ENTRY_TEXT_CHARS}-character limit.`);
	}
	return normalizedText;
}

export class ProjectMemoryStore {
	readonly filePath: string;

	constructor(cwd: string, agentDir: string) {
		this.filePath = getProjectMemoryPath(cwd, agentDir);
	}

	read(): MemoryReadResult {
		if (!existsSync(this.filePath)) return { entries: [], warnings: [] };

		try {
			if (statSync(this.filePath).size > MAX_MEMORY_FILE_BYTES) {
				return {
					entries: [],
					warnings: [`Local memory file exceeds the ${MAX_MEMORY_FILE_BYTES}-byte limit; no entries were loaded.`],
				};
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { entries: [], warnings: [`Could not inspect local memory: ${message}.`] };
		}

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
			if (entries.length >= MAX_MEMORY_ENTRIES) {
				warnings.push(`Ignored memory entries after the ${MAX_MEMORY_ENTRIES}-entry limit.`);
				break;
			}
			const parsed = parseMemoryLine(line, index + 1);
			if (parsed.entry) entries.push(parsed.entry);
			if (parsed.warning) warnings.push(parsed.warning);
		}
		return { entries, warnings };
	}

	add(text: string, category: MemoryCategory = "note"): MemoryAddResult {
		const normalizedText = normalizeMemoryText(text);
		const secrets = scanMemoryText(normalizedText);
		if (secrets.length > 0) {
			throw new Error(
				`Memory was not saved because it matched a possible ${secrets.join(", ")} pattern. ${MEMORY_SECRET_DETECTION_WARNING}`,
			);
		}

		return this.withMutationLock((current) => {
			const duplicate = current.find((entry) => entry.category === category && entry.text === normalizedText);
			if (duplicate) return { entry: duplicate, created: false };
			if (current.length >= MAX_MEMORY_ENTRIES) {
				throw new Error(`Memory already contains the maximum of ${MAX_MEMORY_ENTRIES} entries.`);
			}

			const entry: MemoryEntry = {
				id: `mem_${randomUUID()}`,
				createdAt: new Date().toISOString(),
				category,
				text: normalizedText,
			};
			this.write([...current, entry]);
			return { entry, created: true };
		});
	}

	edit(id: string, text: string, category?: MemoryCategory): MemoryEditResult | undefined {
		const normalizedId = id.trim();
		if (!normalizedId) throw new Error("A memory id is required.");
		const normalizedText = normalizeMemoryText(text);
		const secrets = scanMemoryText(normalizedText);
		if (secrets.length > 0) {
			throw new Error(
				`Memory was not saved because it matched a possible ${secrets.join(", ")} pattern. ${MEMORY_SECRET_DETECTION_WARNING}`,
			);
		}

		return this.withMutationLock((current) => {
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
		});
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
		const normalizedId = id.trim();
		return this.withMutationLock((current) => {
			const remaining = current.filter((entry) => entry.id !== normalizedId);
			if (remaining.length === current.length) return false;
			this.write(remaining);
			return true;
		});
	}

	private ensureStorage(): void {
		const directory = dirname(this.filePath);
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		if (process.platform !== "win32") chmodSync(directory, 0o700);
		if (!existsSync(this.filePath)) {
			writeFileSync(this.filePath, "", { encoding: "utf8", mode: 0o600 });
		}
		if (process.platform !== "win32") chmodSync(this.filePath, 0o600);
	}

	private acquireLockSyncWithRetry(): () => void {
		const maxAttempts = 10;
		const delayMs = 20;
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return lockfile.lockSync(this.filePath, { realpath: false });
			} catch (error) {
				const code =
					typeof error === "object" && error !== null && "code" in error
						? String((error as { code?: unknown }).code)
						: undefined;
				if (code !== "ELOCKED" || attempt === maxAttempts) throw error;
				lastError = error;
				const start = Date.now();
				while (Date.now() - start < delayMs) {
					// Sleep synchronously to keep the public memory API synchronous.
				}
			}
		}

		throw (lastError as Error) ?? new Error("Failed to acquire project memory lock");
	}

	private withMutationLock<T>(mutate: (current: MemoryEntry[]) => T): T {
		this.ensureStorage();
		let release: (() => void) | undefined;
		try {
			release = this.acquireLockSyncWithRetry();
			return mutate(this.read().entries);
		} finally {
			release?.();
		}
	}

	private write(entries: MemoryEntry[]): void {
		this.ensureStorage();
		if (entries.length > MAX_MEMORY_ENTRIES) {
			throw new Error(`Memory already contains the maximum of ${MAX_MEMORY_ENTRIES} entries.`);
		}
		const content = entries.length > 0 ? `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n` : "";
		if (Buffer.byteLength(content, "utf8") > MAX_MEMORY_FILE_BYTES) {
			throw new Error(`Memory file exceeds the ${MAX_MEMORY_FILE_BYTES}-byte limit.`);
		}
		const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
		try {
			writeFileSync(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
			if (process.platform !== "win32") chmodSync(temporaryPath, 0o600);
			renameSync(temporaryPath, this.filePath);
		} catch (error) {
			if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
			throw error;
		}
		if (process.platform !== "win32") chmodSync(this.filePath, 0o600);
	}
}
