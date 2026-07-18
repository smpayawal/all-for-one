import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { basename, extname, relative, resolve, sep } from "node:path";
import type {
	ContextEvent,
	ContextEventResult,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ToolCallEvent,
} from "../../core/extensions/types.ts";

export type RepoMapMode = "auto" | "off";
export type RepoMapState = "idle" | "pending" | "active" | "skipped" | "error" | "off";

export interface RepoMapActivationDecision {
	activate: boolean;
	score: number;
	reason: string;
	signals: string[];
}

export interface RepoMapFileCandidate {
	path: string;
	score: number;
	reasons: string[];
	symbols?: string[];
}

export interface RepoMapSnapshot {
	cacheKey: string;
	head: string;
	workingTree: "clean" | "modified";
	reason: string;
	trackedFileCount: number;
	consideredFileCount: number;
	representedFileCount: number;
	changedFiles: string[];
	files: RepoMapFileCandidate[];
	rendered: string;
	truncated: boolean;
}

export interface RepoMapStatus {
	mode: RepoMapMode;
	state: RepoMapState;
	reason: string;
	cacheKey?: string;
	head?: string;
	trackedFileCount?: number;
	representedFileCount?: number;
	renderedChars?: number;
}

interface RepoMapGenerationInput {
	cwd: string;
	prompt: string;
	reason: string;
	readPaths: ReadonlySet<string>;
	exec: ExtensionAPI["exec"];
}

interface RepoMapGitState {
	head: string;
	status: string;
	trackedFiles: string[];
	changedFiles: string[];
	cacheKey: string;
}

interface RepoMapActivity {
	discoveryCalls: number;
	readPaths: Set<string>;
	areas: Set<string>;
	mutationSeen: boolean;
}

export const REPO_MAP_MAX_TRACKED_FILES = 2_000;
export const REPO_MAP_MAX_RANKED_FILES = 200;
export const REPO_MAP_MAX_REPRESENTED_FILES = 30;
export const REPO_MAP_MAX_SYMBOLS_PER_FILE = 8;
export const REPO_MAP_MAX_RENDERED_CHARS = 6_000;
export const REPO_MAP_GIT_TIMEOUT_MS = 5_000;
const REPO_MAP_MAX_GIT_OUTPUT_BYTES = 512 * 1_024;
const REPO_MAP_MAX_SOURCE_BYTES = 256 * 1_024;
const REPO_MAP_CUSTOM_TYPE = "allforone.repo-map";

const BROAD_SIGNALS: Array<{ pattern: RegExp; label: string; weight: number }> = [
	{ pattern: /\b(?:repository|project)\s+(?:as a whole|wide|architecture|structure)\b/iu, label: "whole-repository request", weight: 4 },
	{ pattern: /\b(?:architecture|data flow|execution path|control flow|dependency graph)\b/iu, label: "architecture or flow analysis", weight: 3 },
	{ pattern: /\b(?:across|between)\s+(?:multiple\s+)?(?:packages|modules|components|layers)\b/iu, label: "cross-package scope", weight: 3 },
	{ pattern: /\b(?:find|locate|identify|trace)\s+(?:where|how|all|the implementation)\b/iu, label: "implementation discovery", weight: 2 },
	{ pattern: /\b(?:root cause|unfamiliar bug|broad refactor|repository-wide|project-wide)\b/iu, label: "broad investigation", weight: 3 },
	{ pattern: /\b(?:review|audit|analy[sz]e)\s+(?:this\s+)?(?:branch|pull request|repository|project|codebase)\b/iu, label: "broad review", weight: 3 },
];

const STOP_WORDS = new Set([
	"about",
	"after",
	"again",
	"also",
	"and",
	"before",
	"change",
	"code",
	"could",
	"from",
	"have",
	"into",
	"make",
	"please",
	"project",
	"repository",
	"should",
	"that",
	"the",
	"this",
	"with",
]);

function normalizeRepoPath(path: string): string {
	return path.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
}

function extractExplicitPaths(prompt: string): string[] {
	const matches = prompt.match(/[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+(?:\.[A-Za-z0-9_-]+)?/gu) ?? [];
	return [...new Set(matches.map(normalizeRepoPath))];
}

function taskTerms(prompt: string): string[] {
	return [
		...new Set(
			prompt
				.toLowerCase()
				.match(/[a-z][a-z0-9_-]{2,}/gu)
				?.filter((term) => !STOP_WORDS.has(term)) ?? [],
		),
	].slice(0, 24);
}

export function evaluateRepoMapActivation(prompt: string): RepoMapActivationDecision {
	const normalized = prompt.trim();
	if (!normalized) return { activate: false, score: 0, reason: "empty prompt", signals: [] };

	const signals: string[] = [];
	let score = 0;
	for (const signal of BROAD_SIGNALS) {
		if (!signal.pattern.test(normalized)) continue;
		score += signal.weight;
		signals.push(signal.label);
	}

	const explicitPaths = extractExplicitPaths(normalized);
	const narrowAction = /\b(?:fix|rename|replace|update|change|remove|add|correct)\b/iu.test(normalized);
	const broadQualifier = /\b(?:all|across|architecture|whole|repository-wide|project-wide|root cause|trace)\b/iu.test(normalized);
	if (explicitPaths.length === 1 && narrowAction && !broadQualifier && normalized.length < 600) {
		return {
			activate: false,
			score: Math.max(0, score - 4),
			reason: "narrow request with one explicit target path",
			signals,
		};
	}
	if (explicitPaths.length === 0 && /\b(?:investigate|diagnose|understand|refactor|review|audit|analy[sz]e)\b/iu.test(normalized)) {
		score += 1;
		signals.push("broad action without a target path");
	}
	if (/\b(?:packages|modules|components|layers)\b/iu.test(normalized) && explicitPaths.length !== 1) {
		score += 1;
		signals.push("multi-area terminology");
	}

	const activate = score >= 3;
	return {
		activate,
		score,
		reason: activate ? signals.join("; ") : "no strong deterministic repository-orientation signal",
		signals,
	};
}

function pathArea(path: string): string {
	const segments = normalizeRepoPath(path).split("/").filter(Boolean);
	if (segments[0] === "packages" && segments.length > 1) return `packages/${segments[1]}`;
	return segments[0] ?? ".";
}

function classifyPath(path: string): string {
	const normalized = normalizeRepoPath(path);
	const name = basename(normalized).toLowerCase();
	if (/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/u.test(normalized)) return "test";
	if (name === "package.json" || name === "pyproject.toml" || name === "cargo.toml" || name === "go.mod") return "package manifest";
	if (/^(?:index|main|mod|lib)\.[^.]+$/u.test(name)) return "entry point";
	if (/\.(?:md|mdx|rst)$/u.test(name)) return "documentation";
	if (/\.(?:json|ya?ml|toml|ini)$/u.test(name)) return "configuration";
	return "source module";
}

export function rankRepoMapFiles(input: {
	files: readonly string[];
	prompt: string;
	changedFiles?: ReadonlySet<string>;
	readPaths?: ReadonlySet<string>;
}): RepoMapFileCandidate[] {
	const terms = taskTerms(input.prompt);
	const explicitPaths = extractExplicitPaths(input.prompt);
	const changed = new Set([...(input.changedFiles ?? [])].map(normalizeRepoPath));
	const read = new Set([...(input.readPaths ?? [])].map(normalizeRepoPath));
	const candidates: RepoMapFileCandidate[] = [];

	for (const rawPath of input.files.slice(0, REPO_MAP_MAX_TRACKED_FILES)) {
		const path = normalizeRepoPath(rawPath);
		if (!path) continue;
		const lower = path.toLowerCase();
		const reasons: string[] = [];
		let score = 0;

		if (explicitPaths.some((target) => path === target || path.endsWith(`/${target}`))) {
			score += 100;
			reasons.push("explicit target");
		}
		if (changed.has(path)) {
			score += 50;
			reasons.push("working-tree change");
		}
		if (read.has(path)) {
			score += 35;
			reasons.push("already inspected");
		}
		let termMatches = 0;
		for (const term of terms) {
			if (!lower.includes(term)) continue;
			termMatches += 1;
		}
		if (termMatches > 0) {
			score += Math.min(termMatches * 5, 25);
			reasons.push("task-term match");
		}
		const name = basename(lower);
		if (/^(?:index|main|mod|lib)\.[^.]+$/u.test(name)) {
			score += 6;
			reasons.push("entry point");
		}
		if (["package.json", "pyproject.toml", "cargo.toml", "go.mod", "makefile"].includes(name)) {
			score += 5;
			reasons.push("project manifest");
		}
		if (/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/u.test(lower)) {
			score += /\b(?:test|validation|regression|review|audit)\b/iu.test(input.prompt) ? 8 : 2;
			reasons.push("related test");
		}
		if (/^(?:readme|agents|contributing)\.md$/u.test(name)) {
			score += 3;
			reasons.push("repository guidance");
		}
		if (score === 0 && path.split("/").length <= 3 && /\.(?:ts|tsx|js|mjs|py|rs|go)$/u.test(path)) score = 1;
		candidates.push({ path, score, reasons });
	}

	return candidates
		.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
		.slice(0, REPO_MAP_MAX_RANKED_FILES);
}

function extractSymbolsFromText(path: string, content: string): string[] {
	const extension = extname(path).toLowerCase();
	const patterns: RegExp[] = [];
	if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
		patterns.push(
			/^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/gmu,
			/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gmu,
			/\.registerCommand\(\s*["']([^"']+)["']/gu,
		);
	} else if (extension === ".py") {
		patterns.push(/^\s*(?:async\s+def|def|class)\s+([A-Za-z_][\w]*)/gmu);
	} else if (extension === ".rs") {
		patterns.push(/^\s*pub(?:\([^)]*\))?\s+(?:async\s+)?(?:fn|struct|enum|trait|type)\s+([A-Za-z_][\w]*)/gmu);
	} else if (extension === ".go") {
		patterns.push(/^\s*(?:func|type)\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/gmu);
	}
	const symbols: string[] = [];
	for (const pattern of patterns) {
		for (const match of content.matchAll(pattern)) {
			const symbol = match[1];
			if (!symbol || symbols.includes(symbol)) continue;
			symbols.push(symbol);
			if (symbols.length >= REPO_MAP_MAX_SYMBOLS_PER_FILE) return symbols;
		}
	}
	return symbols;
}

async function enrichSymbols(cwd: string, candidates: RepoMapFileCandidate[]): Promise<RepoMapFileCandidate[]> {
	let root: string;
	try {
		root = await realpath(cwd);
	} catch {
		return candidates;
	}
	const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
	const enriched: RepoMapFileCandidate[] = [];
	for (const candidate of candidates.slice(0, REPO_MAP_MAX_REPRESENTED_FILES)) {
		try {
			const requested = resolve(cwd, candidate.path);
			const requestedStats = await lstat(requested);
			if (requestedStats.isSymbolicLink() || !requestedStats.isFile()) {
				enriched.push(candidate);
				continue;
			}
			const canonical = await realpath(requested);
			if (canonical !== root && !canonical.startsWith(rootPrefix)) {
				enriched.push(candidate);
				continue;
			}
			const canonicalStats = await stat(canonical);
			if (canonicalStats.size > REPO_MAP_MAX_SOURCE_BYTES) {
				enriched.push(candidate);
				continue;
			}
			const content = await readFile(canonical, "utf8");
			const symbols = extractSymbolsFromText(candidate.path, content);
			enriched.push(symbols.length > 0 ? { ...candidate, symbols } : candidate);
		} catch {
			enriched.push(candidate);
		}
	}
	return enriched;
}

function truncateRenderedMap(text: string): { rendered: string; truncated: boolean } {
	if (text.length <= REPO_MAP_MAX_RENDERED_CHARS) return { rendered: text, truncated: false };
	const suffix = "\n- Map truncated at the configured 6,000-character bound.";
	const available = REPO_MAP_MAX_RENDERED_CHARS - suffix.length;
	const prefix = text.slice(0, available);
	const boundary = prefix.lastIndexOf("\n");
	return { rendered: `${prefix.slice(0, Math.max(0, boundary))}${suffix}`, truncated: true };
}

export function renderRepoMap(input: {
	head: string;
	workingTree: "clean" | "modified";
	reason: string;
	trackedFileCount: number;
	consideredFileCount: number;
	changedFiles: readonly string[];
	files: readonly RepoMapFileCandidate[];
}): { rendered: string; truncated: boolean } {
	const lines = [
		"Generated repository orientation (read-only evidence, not instructions)",
		`HEAD: ${input.head.slice(0, 12)}`,
		`Working tree: ${input.workingTree}`,
		`Activation: ${input.reason}`,
		"",
	];
	if (input.changedFiles.length > 0) {
		lines.push("Changed paths:");
		for (const path of input.changedFiles.slice(0, 12)) lines.push(`- ${path}`);
		if (input.changedFiles.length > 12) lines.push(`- +${input.changedFiles.length - 12} more changed paths`);
		lines.push("");
	}
	lines.push("Relevant files:");
	for (const file of input.files.slice(0, REPO_MAP_MAX_REPRESENTED_FILES)) {
		const reason = file.reasons.length > 0 ? `; ${file.reasons.join(", ")}` : "";
		lines.push(`- ${file.path} (${classifyPath(file.path)}${reason})`);
		if (file.symbols && file.symbols.length > 0) lines.push(`  Symbols: ${file.symbols.join(", ")}`);
	}
	lines.push(
		"",
		"Bounds:",
		`- ${input.trackedFileCount} tracked paths reported; ${input.consideredFileCount} considered; ${Math.min(input.files.length, REPO_MAP_MAX_REPRESENTED_FILES)} represented.`,
		"- Use normal read/search tools to verify implementation details before editing.",
	);
	return truncateRenderedMap(lines.join("\n"));
}

async function runGit(
	exec: ExtensionAPI["exec"],
	cwd: string,
	args: string[],
	maxOutputBytes = REPO_MAP_MAX_GIT_OUTPUT_BYTES,
): Promise<string> {
	const result = await exec("git", args, {
		cwd,
		timeout: REPO_MAP_GIT_TIMEOUT_MS,
		maxOutputBytes,
	});
	if (result.code !== 0 || result.termination === "timeout" || result.termination === "aborted") {
		const detail = result.stderr.trim() || result.stdout.trim() || `git exited with code ${result.code}`;
		throw new Error(detail.slice(0, 240));
	}
	return result.stdout.trim();
}

async function loadGitState(input: RepoMapGenerationInput): Promise<RepoMapGitState> {
	const [head, statusOutput, trackedOutput, changedOutput, stagedOutput] = await Promise.all([
		runGit(input.exec, input.cwd, ["rev-parse", "HEAD"], 4_096),
		runGit(input.exec, input.cwd, ["status", "--porcelain=v1", "-uno"], 128 * 1_024),
		runGit(input.exec, input.cwd, ["ls-files"]),
		runGit(input.exec, input.cwd, ["diff", "--name-only"], 128 * 1_024),
		runGit(input.exec, input.cwd, ["diff", "--cached", "--name-only"], 128 * 1_024),
	]);
	const trackedFiles = trackedOutput
		.split(/\r?\n/u)
		.map(normalizeRepoPath)
		.filter(Boolean);
	const changedFiles = [...new Set([...changedOutput.split(/\r?\n/u), ...stagedOutput.split(/\r?\n/u)])]
		.map(normalizeRepoPath)
		.filter(Boolean)
		.sort();
	const focus = taskTerms(input.prompt).sort().join(",");
	const cacheKey = createHash("sha256")
		.update(head)
		.update("\0")
		.update(statusOutput)
		.update("\0")
		.update(changedFiles.join("\n"))
		.update("\0")
		.update(focus)
		.digest("hex");
	return { head, status: statusOutput, trackedFiles, changedFiles, cacheKey };
}

async function generateRepoMap(input: RepoMapGenerationInput, cached?: RepoMapSnapshot): Promise<RepoMapSnapshot> {
	const git = await loadGitState(input);
	if (cached?.cacheKey === git.cacheKey) return { ...cached, reason: input.reason };
	const considered = git.trackedFiles.slice(0, REPO_MAP_MAX_TRACKED_FILES);
	const ranked = rankRepoMapFiles({
		files: considered,
		prompt: input.prompt,
		changedFiles: new Set(git.changedFiles),
		readPaths: input.readPaths,
	});
	const files = await enrichSymbols(input.cwd, ranked.slice(0, REPO_MAP_MAX_REPRESENTED_FILES));
	const rendered = renderRepoMap({
		head: git.head,
		workingTree: git.status ? "modified" : "clean",
		reason: input.reason,
		trackedFileCount: git.trackedFiles.length,
		consideredFileCount: considered.length,
		changedFiles: git.changedFiles,
		files,
	});
	return {
		cacheKey: git.cacheKey,
		head: git.head,
		workingTree: git.status ? "modified" : "clean",
		reason: input.reason,
		trackedFileCount: git.trackedFiles.length,
		consideredFileCount: considered.length,
		representedFileCount: files.length,
		changedFiles: git.changedFiles,
		files,
		rendered: rendered.rendered,
		truncated: rendered.truncated,
	};
}

function createActivity(): RepoMapActivity {
	return { discoveryCalls: 0, readPaths: new Set(), areas: new Set(), mutationSeen: false };
}

function discoveryBash(command: unknown): boolean {
	return (
		typeof command === "string" &&
		/^\s*(?:rg|grep|find|fd|ls|git\s+(?:grep|ls-files|status|diff\s+--name-only))(?:\s|$)/u.test(command)
	);
}

function recordToolActivity(activity: RepoMapActivity, event: ToolCallEvent): void {
	if (["edit", "write", "apply_patch"].includes(event.toolName)) {
		activity.mutationSeen = true;
		return;
	}
	if (event.toolName === "read") {
		activity.discoveryCalls += 1;
		const path = typeof event.input.path === "string" ? normalizeRepoPath(event.input.path) : "";
		if (path) {
			activity.readPaths.add(path);
			activity.areas.add(pathArea(path));
		}
		return;
	}
	if (["grep", "find", "ls"].includes(event.toolName)) {
		activity.discoveryCalls += 1;
		return;
	}
	if (event.toolName === "bash" && discoveryBash(event.input.command)) activity.discoveryCalls += 1;
}

function shouldActivateFromActivity(activity: RepoMapActivity): boolean {
	return (
		!activity.mutationSeen &&
		activity.discoveryCalls >= 3 &&
		activity.readPaths.size >= 4 &&
		activity.areas.size >= 2
	);
}

function formatStatus(status: RepoMapStatus): string {
	const lines = [
		`Repository map mode: ${status.mode}`,
		`State: ${status.state}`,
		`Reason: ${status.reason}`,
	];
	if (status.head) lines.push(`HEAD: ${status.head.slice(0, 12)}`);
	if (status.trackedFileCount !== undefined) lines.push(`Tracked paths: ${status.trackedFileCount}`);
	if (status.representedFileCount !== undefined) lines.push(`Represented paths: ${status.representedFileCount}`);
	if (status.renderedChars !== undefined) lines.push(`Rendered characters: ${status.renderedChars}`);
	if (status.cacheKey) lines.push(`Cache key: ${status.cacheKey.slice(0, 12)}`);
	return lines.join("\n");
}

function repoMapMessage(snapshot: RepoMapSnapshot): AgentMessage {
	return {
		role: "custom",
		customType: REPO_MAP_CUSTOM_TYPE,
		content: snapshot.rendered,
		display: false,
		details: {
			cacheKey: snapshot.cacheKey,
			reason: snapshot.reason,
			representedFileCount: snapshot.representedFileCount,
			truncated: snapshot.truncated,
		},
		timestamp: Date.now(),
	};
}

export default function repoMapExtension(pi: ExtensionAPI): void {
	let mode: RepoMapMode = "auto";
	let forceOnce = false;
	let pendingReason: string | undefined;
	let currentPrompt = "";
	let activity = createActivity();
	let autoInjectedForTask = false;
	let cached: RepoMapSnapshot | undefined;
	let status: RepoMapStatus = { mode, state: "idle", reason: "waiting for a task" };

	const setMode = (nextMode: RepoMapMode): void => {
		mode = nextMode;
		status = {
			mode,
			state: mode === "off" ? "off" : "idle",
			reason: mode === "off" ? "disabled by user" : "adaptive activation enabled",
		};
	};

	const injectPendingMap = async (event: ContextEvent, ctx: ExtensionContext): Promise<ContextEventResult | undefined> => {
		if (!pendingReason) return undefined;
		if (mode === "off" && !forceOnce) {
			pendingReason = undefined;
			status = { mode, state: "off", reason: "disabled by user" };
			return undefined;
		}
		if (!ctx.isProjectTrusted()) {
			pendingReason = undefined;
			forceOnce = false;
			status = { mode, state: "skipped", reason: "project is not trusted" };
			return undefined;
		}

		const reason = pendingReason;
		pendingReason = undefined;
		status = { mode, state: "pending", reason };
		try {
			cached = await generateRepoMap({ cwd: ctx.cwd, prompt: currentPrompt, reason, readPaths: activity.readPaths, exec: pi.exec }, cached);
			forceOnce = false;
			autoInjectedForTask = true;
			status = {
				mode,
				state: "active",
				reason,
				cacheKey: cached.cacheKey,
				head: cached.head,
				trackedFileCount: cached.trackedFileCount,
				representedFileCount: cached.representedFileCount,
				renderedChars: cached.rendered.length,
			};
			return { messages: [...event.messages, repoMapMessage(cached)] };
		} catch (error) {
			forceOnce = false;
			status = {
				mode,
				state: "error",
				reason: `repository map unavailable: ${error instanceof Error ? error.message : String(error)}`,
			};
			return undefined;
		}
	};

	pi.on("before_agent_start", (event) => {
		currentPrompt = event.prompt;
		activity = createActivity();
		autoInjectedForTask = false;
		if (forceOnce) {
			pendingReason = "forced by /repo-map once";
			status = { mode, state: "pending", reason: pendingReason };
			return;
		}
		if (mode === "off") {
			pendingReason = undefined;
			status = { mode, state: "off", reason: "disabled by user" };
			return;
		}
		const decision = evaluateRepoMapActivation(event.prompt);
		if (decision.activate) {
			pendingReason = decision.reason;
			status = { mode, state: "pending", reason: decision.reason };
		} else {
			pendingReason = undefined;
			status = { mode, state: "skipped", reason: decision.reason };
		}
	});

	pi.on("context", injectPendingMap);

	pi.on("tool_call", (event) => {
		recordToolActivity(activity, event);
		if (mode !== "auto" || forceOnce || pendingReason || autoInjectedForTask) return;
		if (!shouldActivateFromActivity(activity)) return;
		pendingReason = "broad exploration crossed the deterministic disorientation threshold";
		status = { mode, state: "pending", reason: pendingReason };
	});

	pi.on("session_start", () => {
		pendingReason = undefined;
		forceOnce = false;
		currentPrompt = "";
		activity = createActivity();
		autoInjectedForTask = false;
		status = { mode, state: mode === "off" ? "off" : "idle", reason: "waiting for a task" };
	});

	pi.registerCommand("repo-map", {
		description: "Inspect or control the adaptive bounded repository map",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const action = args.trim().toLowerCase() || "status";
			if (action === "auto") {
				forceOnce = false;
				pendingReason = undefined;
				setMode("auto");
				ctx.ui.notify("Repository map automatic activation enabled.");
				return;
			}
			if (action === "off") {
				forceOnce = false;
				pendingReason = undefined;
				setMode("off");
				ctx.ui.notify("Repository map automatic activation disabled.");
				return;
			}
			if (action === "once") {
				forceOnce = true;
				pendingReason = "forced by /repo-map once";
				status = { mode, state: "pending", reason: pendingReason };
				ctx.ui.notify("A fresh repository map will be considered for the next model request.");
				return;
			}
			if (action === "show") {
				ctx.ui.notify(cached?.rendered ?? "No repository map is cached for this session.");
				return;
			}
			if (action === "status") {
				ctx.ui.notify(formatStatus(status));
				return;
			}
			ctx.ui.notify("Usage: /repo-map auto|once|off|status|show", "warning");
		},
	});
}
