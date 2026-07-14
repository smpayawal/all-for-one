import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBashToolDefinition } from "../src/core/tools/bash.ts";
import { discoverValidationCommands, getProjectValidationPromptGuideline } from "../src/core/validation-commands.ts";

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

	it("adds concise prompt guidance only when bash is active", () => {
		writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { check: "verify" } }));
		writeFileSync(join(cwd, "package-lock.json"), "{}");

		expect(getProjectValidationPromptGuideline(cwd, ["read"])).toBeUndefined();
		expect(getProjectValidationPromptGuideline(cwd, ["read", "bash"])).toBe(
			"Project validation commands detected from repository files: npm run check.",
		);
		expect(createBashToolDefinition(cwd).promptGuidelines).toContain(
			"Project validation commands detected from repository files: npm run check.",
		);
	});
});
