import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBashToolDefinition } from "../src/core/tools/bash.ts";
import type { ValidationCommandDiscovery } from "../src/core/validation-commands.ts";
import {
	discoverValidationCommands,
	getProjectValidationPromptGuideline,
	matchValidationCommand,
	matchValidationCommandWithScope,
} from "../src/core/validation-commands.ts";

describe("validation command discovery", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-validation-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it("discovers only existing npm validation scripts", () => {
		writeFileSync(
			join(cwd, "package.json"),
			JSON.stringify({
				scripts: {
					check: "biome check .",
					typecheck: "tsc --noEmit",
					lint: "eslint .",
					test: "vitest run",
					build: "tsc",
					deploy: "deploy",
				},
			}),
		);
		writeFileSync(join(cwd, "package-lock.json"), "{}");

		expect(discoverValidationCommands(cwd)).toEqual({
			ecosystems: ["node"],
			packageManager: "npm",
			packageManagers: ["npm"],
			commands: [
				{ kind: "check", command: "npm run check", confidence: "verified", source: "package.json#scripts.check" },
				{
					kind: "typecheck",
					command: "npm run typecheck",
					confidence: "verified",
					source: "package.json#scripts.typecheck",
				},
				{ kind: "lint", command: "npm run lint", confidence: "verified", source: "package.json#scripts.lint" },
				{ kind: "test", command: "npm test", confidence: "verified", source: "package.json#scripts.test" },
				{ kind: "build", command: "npm run build", confidence: "verified", source: "package.json#scripts.build" },
			],
		});
	});

	it.each([
		["pnpm-lock.yaml", "pnpm", "pnpm test"],
		["bun.lock", "bun", "bun run test"],
		["yarn.lock", "yarn", "yarn test"],
	] as const)("uses %s to select %s commands", (lockfile, packageManager, command) => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "run tests" } }));
		writeFileSync(join(cwd, lockfile), "");

		const result = discoverValidationCommands(cwd);
		expect(result.packageManager).toBe(packageManager);
		expect(result.commands).toEqual([
			{ kind: "test", command, confidence: "verified", source: "package.json#scripts.test" },
		]);
	});

	it("does not guess when package-manager evidence is ambiguous", () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "run tests" } }));
		writeFileSync(join(cwd, "package-lock.json"), "{}");
		writeFileSync(join(cwd, "pnpm-lock.yaml"), "");

		expect(discoverValidationCommands(cwd)).toEqual({
			ecosystems: ["node"],
			packageManagers: ["npm", "pnpm"],
			commands: [],
		});
	});

	it("discovers Python validation commands only from explicit configuration", () => {
		writeFileSync(join(cwd, "pyproject.toml"), "[tool.pytest.ini_options]\n[tool.mypy]\n[tool.ruff]\n");

		expect(discoverValidationCommands(cwd)).toEqual({
			ecosystems: ["python"],
			commands: [
				{ kind: "typecheck", command: "python -m mypy .", confidence: "inferred", source: "pyproject.toml" },
				{ kind: "lint", command: "python -m ruff check .", confidence: "inferred", source: "pyproject.toml" },
				{ kind: "test", command: "python -m pytest", confidence: "inferred", source: "pyproject.toml" },
			],
		});
	});

	it("discovers conventional Rust and Go validation commands", () => {
		writeFileSync(join(cwd, "Cargo.toml"), '[package]\nname = "fixture"\n');
		writeFileSync(join(cwd, "go.mod"), "module example.com/fixture\n");

		expect(discoverValidationCommands(cwd)).toEqual({
			ecosystems: ["rust", "go"],
			commands: [
				{ kind: "check", command: "cargo check", confidence: "inferred", source: "Cargo.toml" },
				{ kind: "test", command: "cargo test", confidence: "inferred", source: "Cargo.toml" },
				{ kind: "test", command: "go test ./...", confidence: "inferred", source: "go.mod" },
			],
		});
	});

	it("discovers explicit Makefile targets", () => {
		writeFileSync(join(cwd, "Makefile"), "check:\n\tverify\n\ntest:\n\trun-tests\n");

		expect(discoverValidationCommands(cwd)).toEqual({
			ecosystems: ["make"],
			commands: [
				{ kind: "check", command: "make check", confidence: "verified", source: "Makefile#check" },
				{ kind: "test", command: "make test", confidence: "verified", source: "Makefile#test" },
			],
		});
	});

	it("returns no commands for unknown projects", () => {
		expect(discoverValidationCommands(cwd)).toEqual({ ecosystems: [], commands: [] });
	});

	it("adds mode-aware prompt guidance only when bash is active", () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { check: "verify" } }));
		writeFileSync(join(cwd, "package-lock.json"), "{}");

		expect(getProjectValidationPromptGuideline(cwd, ["read"])).toBeUndefined();
		expect(getProjectValidationPromptGuideline(cwd, ["read", "bash"], "off")).toBeUndefined();
		expect(getProjectValidationPromptGuideline(cwd, ["read", "bash"], "observe")).toBe(
			"Validation hint: if you run one project check, prefer npm run check. Repository discovery is advisory only.",
		);
		expect(getProjectValidationPromptGuideline(cwd, ["read", "bash"])).toBe(undefined);
		expect(getProjectValidationPromptGuideline(cwd, ["read", "bash"], "enforce")).toBe(
			"Project validation commands detected from repository files (up to 4 grounded entries): npm run check. These are repository-provided suggestions, not safety-approved commands; existing command policy still applies.",
		);
		expect(createBashToolDefinition(cwd).promptGuidelines).toBeUndefined();
		expect(createBashToolDefinition(cwd, { executionIntegrityMode: "observe" }).promptGuidelines).toEqual([
			"Validation hint: if you run one project check, prefer npm run check. Repository discovery is advisory only.",
		]);
		expect(createBashToolDefinition(cwd, { executionIntegrityMode: "enforce" }).promptGuidelines).toEqual([
			"Project validation commands detected from repository files (up to 4 grounded entries): npm run check. These are repository-provided suggestions, not safety-approved commands; existing command policy still applies.",
		]);
	});

	it("bounds enforce guidance to a fixed number of grounded commands and characters", () => {
		writeFileSync(
			join(cwd, "package.json"),
			JSON.stringify({
				scripts: {
					check: "check",
					typecheck: "typecheck",
					lint: "lint",
					test: "test",
					build: "build",
				},
			}),
		);
		writeFileSync(join(cwd, "package-lock.json"), "{}");

		const guideline = getProjectValidationPromptGuideline(cwd, ["bash"], "enforce");
		expect(guideline).toContain("up to 4 grounded entries");
		expect(guideline).toContain("npm run check");
		expect(guideline).toContain("npm test");
		expect(guideline).not.toContain("npm run build");
		expect(guideline?.length).toBeLessThanOrEqual(800);
	});

	it("does not expose validation guidance when discovery finds no commands", () => {
		expect(getProjectValidationPromptGuideline(cwd, ["bash"], "observe")).toBeUndefined();
		expect(createBashToolDefinition(cwd, { executionIntegrityMode: "enforce" }).promptGuidelines).toBeUndefined();
	});

	it("keeps validation guidance bounded when command names are long", () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { check: "x".repeat(2000) } }));
		writeFileSync(join(cwd, "package-lock.json"), "{}");

		const guideline = getProjectValidationPromptGuideline(cwd, ["bash"], "enforce");
		expect(guideline?.length).toBeLessThanOrEqual(800);
		expect(guideline).toContain("Project validation commands detected");
	});

	it("keeps execution provenance guidance independent from command execution", async () => {
		const tool = createBashToolDefinition(cwd, {
			executionIntegrityMode: "off",
			operations: {
				executionKind: "custom",
				exec: async () => ({ exitCode: 0 }),
			},
		});

		const result = await tool.execute("bash-2", { command: "npm test" }, undefined, undefined, {} as never);
		expect(result.details).toMatchObject({
			executionProvenance: {
				requestedCommand: "npm test",
				executionKind: "custom",
			},
		});
	});

	it("preserves the existing concise guidance contract for explicit observe mode", () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { check: "verify" } }));
		writeFileSync(join(cwd, "package-lock.json"), "{}");
		expect(createBashToolDefinition(cwd, { executionIntegrityMode: "observe" }).promptGuidelines).toContain(
			"Validation hint: if you run one project check, prefer npm run check. Repository discovery is advisory only.",
		);
	});

	it("includes actual bash execution provenance in final result details", async () => {
		const tool = createBashToolDefinition(cwd, {
			commandPrefix: "cd /tmp",
			operations: {
				executionKind: "custom",
				exec: async () => ({ exitCode: 0 }),
			},
		});

		const result = await tool.execute("bash-1", { command: "npm test" }, undefined, undefined, {} as never);

		expect(result.details).toMatchObject({
			executionProvenance: {
				requestedCommand: "npm test",
				executedCommand: "cd /tmp\nnpm test",
				cwd,
				executionKind: "custom",
				exitCode: 0,
			},
		});
	});

	describe("validation command matching", () => {
		const discovery = {
			ecosystems: ["node", "rust", "python"],
			packageManager: "npm" as const,
			commands: [
				{
					kind: "test" as const,
					command: "npm test",
					confidence: "verified" as const,
					source: "package.json#scripts.test",
				},
				{
					kind: "test" as const,
					command: "cargo test",
					confidence: "inferred" as const,
					source: "Cargo.toml",
				},
				{
					kind: "test" as const,
					command: "python -m pytest",
					confidence: "inferred" as const,
					source: "pyproject.toml",
				},
			],
		};

		it("matches an exact discovered command", () => {
			expect(matchValidationCommand("npm test", discovery)).toEqual(discovery.commands[0]);
		});

		it.each([
			["npm test -- test/example.test.ts", "npm test"],
			["cargo test specific_test", "cargo test"],
			["python -m pytest tests/example.py", "python -m pytest"],
		] as const)("matches a targeted test suffix: %s", (command, expected) => {
			expect(matchValidationCommand(command, discovery)?.command).toBe(expected);
		});

		it("labels targeted test suffixes as diagnostic-only", () => {
			expect(matchValidationCommandWithScope("npm test -- test/example.test.ts", discovery)).toMatchObject({
				command: discovery.commands[0],
				scope: "targeted-unverified",
			});
		});

		it.each([
			"npm test -- --help",
			"cargo test -- --list",
			"python -m pytest --collect-only",
			"npm test $(printf ignored)",
			"npm test `printf ignored`",
		])("rejects no-op or shell-substitution suffixes: %s", (command) => {
			expect(matchValidationCommand(command, discovery)).toBeUndefined();
		});

		it("normalizes surrounding and repeated whitespace", () => {
			expect(matchValidationCommand("  npm\t  test  ", discovery)).toEqual(discovery.commands[0]);
		});

		it("rejects unknown commands and empty input", () => {
			expect(matchValidationCommand("pnpm test", discovery)).toBeUndefined();
			expect(matchValidationCommand("   ", discovery)).toBeUndefined();
		});

		it.each(["npm test && npm run build", "npm test || npm run build", "npm test; npm run build"])(
			"rejects compound command: %s",
			(command) => {
				expect(matchValidationCommand(command, discovery)).toBeUndefined();
			},
		);

		it("rejects pipelines and redirection", () => {
			expect(matchValidationCommand("npm test | tee result.log", discovery)).toBeUndefined();
			expect(matchValidationCommand("npm test > result.log", discovery)).toBeUndefined();
			expect(matchValidationCommand("npm test\nnpm run build", discovery)).toBeUndefined();
		});

		it("does not match an ambiguous package-manager discovery", () => {
			const ambiguous: ValidationCommandDiscovery = {
				ecosystems: ["node"],
				packageManagers: ["npm", "pnpm"],
				commands: [],
			};
			expect(matchValidationCommand("npm test", ambiguous)).toBeUndefined();
		});
	});
});
