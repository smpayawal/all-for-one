import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "../src/core/extensions/types.ts";
import validationExtension, {
	formatValidationCommandList,
	formatValidationRun,
	type ValidationRunRecord,
} from "../src/extensions/validate/index.ts";
import { discoverValidationCommands } from "../src/core/validation-commands.ts";

type CommandHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;

interface Harness {
	api: ExtensionAPI;
	commands: Map<string, CommandHandler>;
	registeredTools: string[];
	exec: ReturnType<typeof vi.fn>;
}

function createHarness(result?: Partial<Awaited<ReturnType<ExtensionAPI["exec"]>>>): Harness {
	const commands = new Map<string, CommandHandler>();
	const registeredTools: string[] = [];
	const exec = vi.fn(async () => ({
		stdout: "tests passed\n",
		stderr: "",
		code: 0,
		killed: false,
		termination: "completed" as const,
		...result,
	}));
	const api = {
		registerCommand: (name: string, options: { handler: CommandHandler }) => commands.set(name, options.handler),
		registerTool: (tool: { name: string }) => registeredTools.push(tool.name),
		exec,
	} as unknown as ExtensionAPI;
	return { api, commands, registeredTools, exec };
}

function createContext(
	cwd: string,
	options: {
		trusted?: boolean;
		hasUI?: boolean;
		confirmed?: boolean;
		notifications?: Array<{ message: string; type?: string }>;
	} = {},
): ExtensionCommandContext {
	const notifications = options.notifications ?? [];
	return {
		cwd,
		mode: options.hasUI === false ? "print" : "tui",
		hasUI: options.hasUI ?? true,
		isProjectTrusted: () => options.trusted ?? true,
		isIdle: () => true,
		waitForIdle: vi.fn(async () => undefined),
		signal: undefined,
		ui: {
			confirm: vi.fn(async () => options.confirmed ?? true),
			notify: (message: string, type?: string) => notifications.push({ message, type }),
		},
	} as unknown as ExtensionCommandContext;
}

function commandHandler(harness: Harness): CommandHandler {
	const command = harness.commands.get("validate");
	if (!command) throw new Error("validate command was not registered");
	return command;
}

describe("explicit validation extension", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `afo-validate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it("registers a slash command without adding a model tool", () => {
		const harness = createHarness();
		validationExtension(harness.api);
		expect(harness.commands.has("validate")).toBe(true);
		expect(harness.registeredTools).toEqual([]);
	});

	it("lists exact structured invocations and provenance", async () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { check: "biome check .", test: "vitest run" } }));
		writeFileSync(join(cwd, "package-lock.json"), "{}");
		const notifications: Array<{ message: string; type?: string }> = [];
		const harness = createHarness();
		validationExtension(harness.api);
		await commandHandler(harness)("list", createContext(cwd, { notifications }));

		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.message).toContain("1. [check] npm run check");
		expect(notifications[0]?.message).toContain("Program: npm");
		expect(notifications[0]?.message).toContain('Arguments: ["run","check"]');
		expect(notifications[0]?.message).toContain("Source: package.json#scripts.check");
		expect(notifications[0]?.message).toContain("Confidence: verified");
		expect(harness.exec).not.toHaveBeenCalled();
	});

	it("executes the exact structured program and args only after confirmation", async () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
		writeFileSync(join(cwd, "package-lock.json"), "{}");
		const notifications: Array<{ message: string; type?: string }> = [];
		const ctx = createContext(cwd, { notifications, confirmed: true });
		const harness = createHarness();
		validationExtension(harness.api);

		await commandHandler(harness)("test", ctx);

		expect(ctx.waitForIdle).toHaveBeenCalledOnce();
		expect(ctx.ui.confirm).toHaveBeenCalledWith(
			"Run repository validation?",
			expect.stringContaining('Arguments: ["test"]'),
		);
		expect(harness.exec).toHaveBeenCalledWith("npm", ["test"], {
			cwd,
			signal: undefined,
			timeout: 120_000,
			maxOutputBytes: 64 * 1_024,
		});
		expect(notifications.at(-1)?.message).toContain("Result: exit 0; termination completed");
	});

	it("refuses execution without project trust", async () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
		writeFileSync(join(cwd, "package-lock.json"), "{}");
		const notifications: Array<{ message: string; type?: string }> = [];
		const harness = createHarness();
		validationExtension(harness.api);

		await commandHandler(harness)("test", createContext(cwd, { trusted: false, notifications }));

		expect(harness.exec).not.toHaveBeenCalled();
		expect(notifications.at(-1)).toMatchObject({ type: "warning" });
		expect(notifications.at(-1)?.message).toContain("not trusted");
	});

	it("fails closed without an interactive approval channel", async () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
		writeFileSync(join(cwd, "package-lock.json"), "{}");
		const notifications: Array<{ message: string; type?: string }> = [];
		const harness = createHarness();
		validationExtension(harness.api);

		await commandHandler(harness)("test", createContext(cwd, { hasUI: false, notifications }));

		expect(harness.exec).not.toHaveBeenCalled();
		expect(notifications.at(-1)?.message).toContain("requires an interactive approval channel");
	});

	it("does not execute when confirmation is declined", async () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
		writeFileSync(join(cwd, "package-lock.json"), "{}");
		const notifications: Array<{ message: string; type?: string }> = [];
		const harness = createHarness();
		validationExtension(harness.api);

		await commandHandler(harness)("test", createContext(cwd, { confirmed: false, notifications }));

		expect(harness.exec).not.toHaveBeenCalled();
		expect(notifications.at(-1)?.message).toContain("cancelled");
	});

	it("warns when inferred commands need approval", async () => {
		writeFileSync(join(cwd, "pyproject.toml"), "[tool.pytest.ini_options]\n");
		const ctx = createContext(cwd);
		const harness = createHarness();
		validationExtension(harness.api);

		await commandHandler(harness)("test", ctx);

		expect(ctx.ui.confirm).toHaveBeenCalledWith(
			"Run repository validation?",
			expect.stringContaining("inferred from repository configuration"),
		);
		expect(harness.exec).toHaveBeenCalledWith("python", ["-m", "pytest"], expect.any(Object));
	});

	it("lists ambiguous category choices instead of choosing silently", async () => {
		writeFileSync(join(cwd, "pyproject.toml"), "[tool.pytest.ini_options]\n");
		writeFileSync(join(cwd, "tox.ini"), "[tox]\n");
		const notifications: Array<{ message: string; type?: string }> = [];
		const harness = createHarness();
		validationExtension(harness.api);

		await commandHandler(harness)("test", createContext(cwd, { notifications }));

		expect(harness.exec).not.toHaveBeenCalled();
		expect(notifications.at(-1)?.message).toContain("python -m pytest");
		expect(notifications.at(-1)?.message).toContain("python -m tox");
		expect(notifications.at(-1)?.type).toBe("warning");
	});

	it("runs only a numbered command from the current discovery", async () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { check: "check", test: "test" } }));
		writeFileSync(join(cwd, "package-lock.json"), "{}");
		const notifications: Array<{ message: string; type?: string }> = [];
		const harness = createHarness();
		validationExtension(harness.api);
		const handler = commandHandler(harness);
		const ctx = createContext(cwd, { notifications });

		await handler("list", ctx);
		await handler("run 2", ctx);
		await handler("run 2 && whoami", ctx);

		expect(harness.exec).toHaveBeenCalledTimes(1);
		expect(harness.exec).toHaveBeenCalledWith("npm", ["test"], expect.any(Object));
		expect(notifications.at(-1)?.message).toContain("Usage: /validate run <number>");
	});

	it("reports the last bounded result without rerunning", async () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
		writeFileSync(join(cwd, "package-lock.json"), "{}");
		const notifications: Array<{ message: string; type?: string }> = [];
		const harness = createHarness({ stdout: "x".repeat(80_000), stdoutTruncated: true });
		validationExtension(harness.api);
		const handler = commandHandler(harness);
		const ctx = createContext(cwd, { notifications });

		await handler("test", ctx);
		await handler("last", ctx);

		expect(harness.exec).toHaveBeenCalledTimes(1);
		expect(notifications.at(-1)?.message.length).toBeLessThanOrEqual(6_000);
		expect(notifications.at(-1)?.message).toContain("output display truncated");
	});

	it("formats structured discovery and execution evidence", () => {
		writeFileSync(join(cwd, "Makefile"), "check:\n\tverify\n");
		const discovery = discoverValidationCommands(cwd);
		expect(discovery.commands[0]).toEqual({
			kind: "check",
			command: "make check",
			program: "make",
			args: ["check"],
			confidence: "verified",
			source: "Makefile#check",
		});
		expect(formatValidationCommandList(discovery)).toContain('Arguments: ["check"]');

		const record: ValidationRunRecord = {
			command: discovery.commands[0],
			cwd,
			code: 1,
			termination: "timeout",
			durationMs: 120_000,
			stdout: "",
			stderr: "timed out",
			stdoutTruncated: false,
			stderrTruncated: false,
		};
		expect(formatValidationRun(record)).toContain("termination timeout");
	});
});
