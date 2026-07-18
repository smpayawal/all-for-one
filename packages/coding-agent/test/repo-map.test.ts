import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	ContextEvent,
	ContextEventResult,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ToolCallEvent,
} from "../src/core/extensions/types.ts";
import repoMapExtension, {
	evaluateRepoMapActivation,
	parseRepoMapStatusPaths,
	REPO_MAP_MAX_RANKED_FILES,
	REPO_MAP_MAX_RENDERED_CHARS,
	REPO_MAP_MAX_REPRESENTED_FILES,
	REPO_MAP_MAX_TRACKED_FILES,
	rankRepoMapFiles,
	renderRepoMap,
	selectRepoMapFiles,
} from "../src/extensions/repo-map/index.ts";

type EventHandler = (event: unknown, ctx: ExtensionContext) => unknown | Promise<unknown>;
type CommandHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;

interface ExtensionHarness {
	handlers: Map<string, EventHandler[]>;
	commands: Map<string, CommandHandler>;
	execCalls: Array<{ command: string; args: string[] }>;
	registeredTools: string[];
	api: ExtensionAPI;
}

function createHarness(outputs?: Map<string, string>, truncatedKeys = new Set<string>()): ExtensionHarness {
	const handlers = new Map<string, EventHandler[]>();
	const commands = new Map<string, CommandHandler>();
	const execCalls: Array<{ command: string; args: string[] }> = [];
	const registeredTools: string[] = [];
	const api = {
		on: (event: string, handler: EventHandler) => {
			const existing = handlers.get(event) ?? [];
			existing.push(handler);
			handlers.set(event, existing);
		},
		registerCommand: (name: string, options: { handler: CommandHandler }) => commands.set(name, options.handler),
		registerTool: (tool: { name: string }) => registeredTools.push(tool.name),
		exec: async (command: string, args: string[]) => {
			execCalls.push({ command, args });
			const key = args.join(" ");
			return {
				stdout: outputs?.get(key) ?? "",
				stderr: "",
				code: 0,
				killed: false,
				termination: "completed" as const,
				stdoutTruncated: truncatedKeys.has(key),
				stderrTruncated: false,
			};
		},
	} as unknown as ExtensionAPI;
	return { handlers, commands, execCalls, registeredTools, api };
}

function handler<TEvent, TResult>(
	harness: ExtensionHarness,
	name: string,
): (event: TEvent, ctx: ExtensionContext) => TResult {
	const value = harness.handlers.get(name)?.[0];
	if (!value) throw new Error(`Missing handler: ${name}`);
	return value as (event: TEvent, ctx: ExtensionContext) => TResult;
}

function createContext(cwd: string, trusted = true, notifications: string[] = []): ExtensionContext {
	return {
		cwd,
		isProjectTrusted: () => trusted,
		ui: {
			notify: (message: string) => notifications.push(message),
		},
	} as unknown as ExtensionContext;
}

function createRepository(): { cwd: string; cleanup: () => void; tracked: string[] } {
	const cwd = mkdtempSync(join(tmpdir(), "afo-repo-map-"));
	const tracked = [
		"package.json",
		"packages/agent/src/index.ts",
		"packages/agent/test/index.test.ts",
		"packages/coding-agent/src/core/session.ts",
		"packages/coding-agent/src/extensions/index.ts",
	];
	for (const path of tracked) {
		const target = join(cwd, path);
		mkdirSync(join(target, ".."), { recursive: true });
		const content = path.endsWith(".ts")
			? `export function ${path.includes("session") ? "createSession" : "entryPoint"}() {}\n`
			: "{}\n";
		writeFileSync(target, content);
	}
	return { cwd, tracked, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function gitOutputs(tracked: string[]): Map<string, string> {
	return new Map([
		["rev-parse HEAD", "0123456789abcdef0123456789abcdef01234567\n"],
		["status --porcelain=v1 -z", ""],
		["ls-files -z", `${tracked.join("\0")}\0`],
	]);
}

describe("adaptive repository map", () => {
	it("activates only for strong broad signals", () => {
		expect(evaluateRepoMapActivation("Analyze the project as a whole and trace the execution path")).toMatchObject({
			activate: true,
		});
		expect(evaluateRepoMapActivation("Fix the typo in packages/coding-agent/README.md")).toMatchObject({
			activate: false,
			reason: "narrow request with one explicit target path",
		});
		expect(evaluateRepoMapActivation("Explain this error")).toMatchObject({ activate: false });
	});

	it("ranks deterministically and enforces candidate bounds", () => {
		const files = Array.from(
			{ length: REPO_MAP_MAX_TRACKED_FILES + 100 },
			(_, index) => `packages/p${index}/src/index.ts`,
		);
		const first = rankRepoMapFiles({ files, prompt: "Review packages/p17 architecture" });
		const second = rankRepoMapFiles({ files, prompt: "Review packages/p17 architecture" });
		expect(first).toEqual(second);
		expect(first).toHaveLength(REPO_MAP_MAX_RANKED_FILES);
		expect(first[0]?.path).toContain("p17");
		expect(first.every((candidate) => Number.isFinite(candidate.score))).toBe(true);
	});

	it("parses NUL-delimited status paths without corrupting whitespace or rename pairs", () => {
		const output =
			" M packages/a file.ts\0R  packages/new name.ts\0packages/old name.ts\0?? packages/untracked file.ts\0";
		expect(parseRepoMapStatusPaths(output)).toEqual([
			"packages/a file.ts",
			"packages/new name.ts",
			"packages/old name.ts",
			"packages/untracked file.ts",
		]);
	});

	it("prioritizes changed, read, and task-matched paths before the tracked-file bound", () => {
		const trackedFiles = Array.from(
			{ length: REPO_MAP_MAX_TRACKED_FILES + 200 },
			(_, index) => `packages/p${index}/src/index.ts`,
		);
		const lateTarget = trackedFiles.at(-1);
		if (!lateTarget) throw new Error("Missing late target fixture");
		const selected = selectRepoMapFiles({
			trackedFiles,
			prompt: `Review ${lateTarget} architecture`,
			changedFiles: new Set(["packages/untracked change.ts"]),
			readPaths: new Set(["packages/read-late.ts"]),
		});
		expect(selected).toHaveLength(REPO_MAP_MAX_TRACKED_FILES);
		expect(selected.slice(0, 3)).toEqual([lateTarget, "packages/untracked change.ts", "packages/read-late.ts"]);
	});

	it("renders bounded orientation instead of source contents", () => {
		const files = Array.from({ length: 100 }, (_, index) => ({
			path: `packages/example-${index}/src/a-very-long-module-name-${index}.ts`,
			score: 10,
			reasons: ["task-term match", "entry point"],
			symbols: Array.from({ length: 8 }, (__, symbolIndex) => `Symbol${index}_${symbolIndex}`),
		}));
		const result = renderRepoMap({
			head: "0123456789abcdef",
			workingTree: "modified",
			reason: "architecture analysis",
			trackedFileCount: 10_000,
			consideredFileCount: REPO_MAP_MAX_TRACKED_FILES,
			changedFiles: files.map((file) => file.path),
			files,
		});
		expect(result.rendered.length).toBeLessThanOrEqual(REPO_MAP_MAX_RENDERED_CHARS);
		expect(result.rendered).toContain("Generated repository orientation");
		expect(result.rendered).not.toContain("function body");
		expect(result.rendered.match(/^- packages\//gmu)?.length ?? 0).toBeLessThanOrEqual(
			REPO_MAP_MAX_REPRESENTED_FILES + 12,
		);
	});

	it("injects one temporary map for a broad trusted task without registering a model tool", async () => {
		const repository = createRepository();
		try {
			const harness = createHarness(gitOutputs(repository.tracked));
			repoMapExtension(harness.api);
			expect(harness.registeredTools).toEqual([]);
			expect(harness.commands.has("repo-map")).toBe(true);

			const ctx = createContext(repository.cwd);
			handler<{ prompt: string }, void>(harness, "before_agent_start")(
				{ prompt: "Analyze the repository architecture and trace the execution path" },
				ctx,
			);
			const result = await handler<ContextEvent, Promise<ContextEventResult | undefined>>(harness, "context")(
				{ type: "context", messages: [] },
				ctx,
			);
			expect(result?.messages).toHaveLength(1);
			expect(result?.messages?.[0]).toMatchObject({
				role: "custom",
				customType: "allforone.repo-map",
				display: false,
			});
			expect(harness.execCalls).toEqual([
				{ command: "git", args: ["rev-parse", "HEAD"] },
				{ command: "git", args: ["status", "--porcelain=v1", "-z"] },
				{ command: "git", args: ["ls-files", "-z"] },
			]);
			const second = await handler<ContextEvent, Promise<ContextEventResult | undefined>>(harness, "context")(
				{ type: "context", messages: [] },
				ctx,
			);
			expect(second).toBeUndefined();
		} finally {
			repository.cleanup();
		}
	});

	it("fails closed instead of injecting an incomplete map when Git output is truncated", async () => {
		const repository = createRepository();
		try {
			const notifications: string[] = [];
			const harness = createHarness(gitOutputs(repository.tracked), new Set(["ls-files -z"]));
			repoMapExtension(harness.api);
			const ctx = createContext(repository.cwd, true, notifications);
			handler<{ prompt: string }, void>(harness, "before_agent_start")(
				{ prompt: "Analyze the project architecture as a whole" },
				ctx,
			);
			expect(
				await handler<ContextEvent, Promise<ContextEventResult | undefined>>(harness, "context")(
					{ type: "context", messages: [] },
					ctx,
				),
			).toBeUndefined();
			const command = harness.commands.get("repo-map");
			if (!command) throw new Error("repo-map command was not registered");
			await command("status", ctx as ExtensionCommandContext);
			expect(notifications.join("\n")).toContain("output exceeded the configured bound");
		} finally {
			repository.cleanup();
		}
	});

	it("does no repository work for a narrow task or an untrusted project", async () => {
		const repository = createRepository();
		try {
			const narrow = createHarness(gitOutputs(repository.tracked));
			repoMapExtension(narrow.api);
			const trusted = createContext(repository.cwd);
			handler<{ prompt: string }, void>(narrow, "before_agent_start")(
				{ prompt: "Fix packages/coding-agent/src/core/session.ts" },
				trusted,
			);
			expect(
				await handler<ContextEvent, Promise<ContextEventResult | undefined>>(narrow, "context")(
					{ type: "context", messages: [] },
					trusted,
				),
			).toBeUndefined();
			expect(narrow.execCalls).toEqual([]);

			const untrusted = createHarness(gitOutputs(repository.tracked));
			repoMapExtension(untrusted.api);
			const untrustedContext = createContext(repository.cwd, false);
			handler<{ prompt: string }, void>(untrusted, "before_agent_start")(
				{ prompt: "Analyze the project architecture as a whole" },
				untrustedContext,
			);
			expect(
				await handler<ContextEvent, Promise<ContextEventResult | undefined>>(untrusted, "context")(
					{ type: "context", messages: [] },
					untrustedContext,
				),
			).toBeUndefined();
			expect(untrusted.execCalls).toEqual([]);
		} finally {
			repository.cleanup();
		}
	});

	it("activates after bounded cross-area exploration without a mutation target", async () => {
		const repository = createRepository();
		try {
			const harness = createHarness(gitOutputs(repository.tracked));
			repoMapExtension(harness.api);
			const ctx = createContext(repository.cwd);
			handler<{ prompt: string }, void>(harness, "before_agent_start")({ prompt: "Investigate the issue" }, ctx);
			const onToolCall = handler<ToolCallEvent, void>(harness, "tool_call");
			for (const path of [
				"packages/agent/src/index.ts",
				"packages/agent/test/index.test.ts",
				"packages/coding-agent/src/core/session.ts",
				"packages/coding-agent/src/extensions/index.ts",
			]) {
				onToolCall({ type: "tool_call", toolCallId: path, toolName: "read", input: { path } }, ctx);
			}
			const result = await handler<ContextEvent, Promise<ContextEventResult | undefined>>(harness, "context")(
				{ type: "context", messages: [] },
				ctx,
			);
			expect(result?.messages?.[0]).toMatchObject({ customType: "allforone.repo-map" });
		} finally {
			repository.cleanup();
		}
	});

	it("supports auto, off, once, status, and show without changing the model tool set", async () => {
		const repository = createRepository();
		try {
			const harness = createHarness(gitOutputs(repository.tracked));
			repoMapExtension(harness.api);
			const notifications: string[] = [];
			const ctx = createContext(repository.cwd, true, notifications) as ExtensionCommandContext;
			const command = harness.commands.get("repo-map");
			if (!command) throw new Error("repo-map command was not registered");
			await command("off", ctx);
			await command("status", ctx);
			await command("once", ctx);
			await command("show", ctx);
			await command("auto", ctx);
			expect(notifications.join("\n")).toContain("automatic activation disabled");
			expect(notifications.join("\n")).toContain("Repository map mode: off");
			expect(notifications.join("\n")).toContain("next model request");
			expect(notifications.join("\n")).toContain("No repository map is cached");
			expect(harness.registeredTools).toEqual([]);
		} finally {
			repository.cleanup();
		}
	});
});
