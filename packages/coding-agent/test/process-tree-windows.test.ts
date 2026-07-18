import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { execCommand } from "../src/core/exec.ts";
import { requestProcessTreeTermination, terminateProcessTreeAndWait } from "../src/utils/shell.ts";

async function waitForProcessId(path: string): Promise<number> {
	const deadline = Date.now() + 2_000;
	while (Date.now() < deadline) {
		try {
			const pid = Number.parseInt(await readFile(path, "utf8"), 10);
			if (Number.isInteger(pid) && pid > 0) return pid;
		} catch {
			// The child has not written its PID yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error("Timed out waiting for Windows descendant PID");
}

async function waitForProcessExit(pid: number, timeoutMs = 2_000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			process.kill(pid, 0);
		} catch {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	try {
		process.kill(pid, 0);
		return false;
	} catch {
		return true;
	}
}

function forceKill(pid: number): void {
	try {
		execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
			stdio: "ignore",
			windowsHide: true,
		});
	} catch {
		// The tree may already have terminated.
	}
}

describe("Windows process-tree termination", () => {
	it.skipIf(process.platform !== "win32")(
		"awaits forced tree termination for timeout cancellation",
		async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "pi-windows-tree-"));
			const pidPath = join(tempDir, "descendant.pid");
			let descendantPid: number | undefined;
			const descendantScript = "setInterval(() => {}, 1000);";
			const parentScript = [
				"const { spawn } = require('node:child_process');",
				"const { writeFileSync } = require('node:fs');",
				`const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: 'ignore', windowsHide: true });`,
				`writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));`,
				"setInterval(() => {}, 1000);",
			].join(" ");

			try {
				const resultPromise = execCommand(process.execPath, ["-e", parentScript], process.cwd(), { timeout: 100 });
				descendantPid = await waitForProcessId(pidPath);
				const result = await resultPromise;

				expect(result.killed).toBe(true);
				expect(result.termination).toBe("timeout");
				expect(result.processTreeCleanup?.completed).toBe(true);
				expect(result.processTreeCleanup?.verified).toBe(true);
				expect(await waitForProcessExit(descendantPid)).toBe(true);
			} finally {
				if (descendantPid !== undefined) forceKill(descendantPid);
				await rm(tempDir, { recursive: true, force: true });
			}
		},
		15_000,
	);

	it.skipIf(process.platform !== "win32")(
		"falls back to direct descendant termination when taskkill fails after the root exits",
		async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "pi-windows-tree-fallback-"));
			const pidPath = join(tempDir, "descendant.pid");
			const helperDir = await mkdtemp(join(tmpdir(), "pi-windows-helper-"));
			const taskkillStub = join(helperDir, "taskkill.cmd");
			const originalPath = process.env.PATH;
			let rootPid: number | undefined;
			let descendantPid: number | undefined;
			const descendantScript = "setInterval(() => {}, 1000);";
			const parentScript = [
				"const { spawn } = require('node:child_process');",
				"const { writeFileSync } = require('node:fs');",
				`const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: 'ignore', windowsHide: true });`,
				`writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));`,
				"process.exit(0);",
			].join(" ");

			try {
				await writeFile(taskkillStub, "@echo off\r\nexit /b 9009\r\n", "utf8");
				process.env.PATH = [helperDir, originalPath].filter(Boolean).join(delimiter);
				const root = spawn(process.execPath, ["-e", parentScript], {
					stdio: "ignore",
					windowsHide: true,
				});
				rootPid = root.pid;
				descendantPid = await waitForProcessId(pidPath);
				if (rootPid === undefined || descendantPid === undefined) {
					throw new Error("The Windows process tree did not start correctly");
				}
				await waitForProcessExit(rootPid);

				const result = await requestProcessTreeTermination(rootPid, "SIGKILL");

				expect(result.requestCompleted).toBe(true);
				expect(result.verified).toBe(true);
				expect(result.treeAlive).toBe(false);
				expect(result.error).toContain("taskkill exited");
				expect(await waitForProcessExit(descendantPid)).toBe(true);
			} finally {
				process.env.PATH = originalPath;
				if (rootPid !== undefined) forceKill(rootPid);
				if (descendantPid !== undefined) forceKill(descendantPid);
				await rm(tempDir, { recursive: true, force: true });
				await rm(helperDir, { recursive: true, force: true });
			}
		},
		15_000,
	);

	it.skipIf(process.platform !== "win32")(
		"returns an unverified incomplete result when discovery and taskkill are unavailable",
		async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "pi-windows-tree-unavailable-"));
			const pidPath = join(tempDir, "descendant.pid");
			const helperDir = await mkdtemp(join(tmpdir(), "pi-windows-empty-path-"));
			const originalPath = process.env.PATH;
			let rootPid: number | undefined;
			let descendantPid: number | undefined;
			const descendantScript = "setInterval(() => {}, 1000);";
			const parentScript = [
				"const { spawn } = require('node:child_process');",
				"const { writeFileSync } = require('node:fs');",
				`const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: 'ignore', windowsHide: true });`,
				`writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));`,
				"setInterval(() => {}, 1000);",
			].join(" ");

			try {
				const root = spawn(process.execPath, ["-e", parentScript], {
					stdio: "ignore",
					windowsHide: true,
				});
				rootPid = root.pid;
				descendantPid = await waitForProcessId(pidPath);
				if (rootPid === undefined || descendantPid === undefined) {
					throw new Error("The Windows process tree did not start correctly");
				}

				process.env.PATH = helperDir;
				const startedAt = Date.now();
				const result = await terminateProcessTreeAndWait(rootPid);

				expect(Date.now() - startedAt).toBeLessThan(6_000);
				expect(result.completed).toBe(false);
				expect(result.verified).toBe(false);
				expect(result.error).toContain("PowerShell process-tree discovery is unavailable");
				expect(await waitForProcessExit(rootPid)).toBe(true);
				expect(await waitForProcessExit(descendantPid, 100)).toBe(false);
			} finally {
				process.env.PATH = originalPath;
				if (rootPid !== undefined) forceKill(rootPid);
				if (descendantPid !== undefined) forceKill(descendantPid);
				await rm(tempDir, { recursive: true, force: true });
				await rm(helperDir, { recursive: true, force: true });
			}
		},
		15_000,
	);
});