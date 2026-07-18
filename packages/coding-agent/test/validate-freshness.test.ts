import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "../src/core/extensions/types.ts";
import validationExtension from "../src/extensions/validate/index.ts";

type CommandHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;

function createHarness(): {
	api: ExtensionAPI;
	commands: Map<string, CommandHandler>;
	exec: ReturnType<typeof vi.fn>;
} {
	const commands = new Map<string, CommandHandler>();
	const exec = vi.fn(async () => ({
		stdout: "tests passed\n",
		stderr: "",
		code: 0,
		killed: false,
		termination: "completed" as const,
	}));
	const api = {
		registerCommand: (name: string, options: { handler: CommandHandler }) => commands.set(name, options.handler),
		registerTool: () => undefined,
		exec,
	} as unknown as ExtensionAPI;
	return { api, commands, exec };
}

function createContext(
	cwd: string,
	options: {
		notifications: Array<{ message: string; type?: string }>;
		onConfirm?: () => void | Promise<void>;
	},
): ExtensionCommandContext {
	return {
		cwd,
		mode: "tui",
		hasUI: true,
		isProjectTrusted: () => true,
		isIdle: () => true,
		waitForIdle: vi.fn(async () => undefined),
		signal: undefined,
		ui: {
			confirm: vi.fn(async () => {
				await options.onConfirm?.();
				return true;
			}),
			notify: (message: string, type?: string) => options.notifications.push({ message, type }),
		},
	} as unknown as ExtensionCommandContext;
}

function handler(commands: Map<string, CommandHandler>): CommandHandler {
	const command = commands.get("validate");
	if (!command) throw new Error("validate command was not registered");
	return command;
}

describe("explicit validation discovery freshness", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `afo-validate-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(cwd, { recursive: true });
		writeFileSync(join(cwd, "package-lock.json"), "{}");
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it("refuses a numbered command after repository validation discovery changes", async () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
		const notifications: Array<{ message: string; type?: string }> = [];
		const harness = createHarness();
		validationExtension(harness.api);
		const run = handler(harness.commands);
		const ctx = createContext(cwd, { notifications });

		await run("list", ctx);
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { build: "tsc" } }));
		await run("run 1", ctx);

		expect(harness.exec).not.toHaveBeenCalled();
		expect(notifications.at(-1)?.message).toContain("changed since it was selected");
	});

	it("refuses execution when validation discovery changes during confirmation", async () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
		const notifications: Array<{ message: string; type?: string }> = [];
		const harness = createHarness();
		validationExtension(harness.api);
		const ctx = createContext(cwd, {
			notifications,
			onConfirm: () => {
				writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node changed.js" } }));
			},
		});

		await handler(harness.commands)("test", ctx);

		expect(harness.exec).not.toHaveBeenCalled();
		expect(notifications.at(-1)?.message).toContain("changed during approval");
	});
});
