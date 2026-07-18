import { chmodSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveValidationExecutable } from "../src/extensions/validate/index.ts";

function executableName(platform: NodeJS.Platform): string {
	return platform === "win32" ? "afo-validator.cmd" : "afo-validator";
}

function writeExecutable(directory: string, platform: NodeJS.Platform): string {
	mkdirSync(directory, { recursive: true });
	const path = join(directory, executableName(platform));
	writeFileSync(path, platform === "win32" ? "@echo off\r\n" : "#!/bin/sh\nexit 0\n");
	if (platform !== "win32") chmodSync(path, 0o755);
	return path;
}

describe("validation executable identity", () => {
	let workspace: string;
	let externalBin: string;

	beforeEach(() => {
		workspace = join(tmpdir(), `afo-validation-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		externalBin = join(tmpdir(), `afo-validation-bin-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(workspace, { recursive: true });
	});

	afterEach(() => {
		rmSync(workspace, { recursive: true, force: true });
		rmSync(externalBin, { recursive: true, force: true });
	});

	it.each(["linux", "win32"] as const)("resolves the first external executable on %s", (platform) => {
		const executable = writeExecutable(externalBin, platform);
		const result = resolveValidationExecutable(basename(executable, platform === "win32" ? ".cmd" : ""), workspace, {
			env: {
				PATH: externalBin,
				PATHEXT: ".COM;.EXE;.BAT;.CMD",
			},
			platform,
		});

		expect(result).toMatchObject({
			status: "resolved",
			workspaceLocal: false,
		});
		expect(result?.canonicalPath).toBe(realpathSync(executable));
	});

	it.each(["linux", "win32"] as const)("detects a workspace-local shadow executable on %s", (platform) => {
		const executable = writeExecutable(workspace, platform);
		const result = resolveValidationExecutable(basename(executable, platform === "win32" ? ".cmd" : ""), workspace, {
			env: {
				PATH: [workspace, externalBin].join(platform === "win32" ? ";" : ":"),
				PATHEXT: ".COM;.EXE;.BAT;.CMD",
			},
			platform,
		});

		expect(result).toMatchObject({
			status: "resolved",
			workspaceLocal: true,
		});
	});

	it("treats the Windows current directory as preceding PATH", () => {
		writeExecutable(workspace, "win32");
		writeExecutable(externalBin, "win32");
		const result = resolveValidationExecutable("afo-validator", workspace, {
			env: { PATH: externalBin, PATHEXT: ".COM;.EXE;.BAT;.CMD" },
			platform: "win32",
		});

		expect(result).toMatchObject({
			status: "resolved",
			workspaceLocal: true,
		});
	});

	it("returns not-found without falling back to shell resolution", () => {
		expect(
			resolveValidationExecutable("missing-validator", workspace, {
				env: { PATH: externalBin },
				platform: "linux",
			}),
		).toEqual({ status: "not-found", requestedProgram: "missing-validator" });
	});
});
