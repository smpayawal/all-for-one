import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeBashWithOperations } from "../src/core/bash-executor.ts";
import { createLocalBashOperations } from "../src/core/tools/bash.ts";

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

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
	throw new Error("Timed out waiting for local bash descendant PID");
}

async function waitForProcessExit(pid: number, timeoutMs = 1_000): Promise<boolean> {
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

function createParentCommand(pidPath: string): string {
	const descendantScript = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);";
	const parentScript = [
		"const { spawn } = require('node:child_process');",
		"const { writeFileSync } = require('node:fs');",
		`const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: 'ignore' });`,
		`writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));`,
		"process.on('SIGTERM', () => process.exit(0));",
		"setInterval(() => {}, 1000);",
	].join(" ");
	return `${shellQuote(process.execPath)} -e ${shellQuote(parentScript)}`;
}

describe("local bash process-tree lifecycle", () => {
	it("preserves combined output and nonzero exit codes", async () => {
		const result = await executeBashWithOperations(
			"printf 'stdout'; printf 'stderr' >&2; exit 3",
			process.cwd(),
			createLocalBashOperations(),
		);

		expect(result.output).toContain("stdout");
		expect(result.output).toContain("stderr");
		expect(result.exitCode).toBe(3);
		expect(result.cancelled).toBe(false);
	});

	it("reports local cancellation separately from completion", async () => {
		const controller = new AbortController();
		const resultPromise = executeBashWithOperations(
			`${shellQuote(process.execPath)} -e ${shellQuote("setTimeout(() => {}, 1000);")}`,
			process.cwd(),
			createLocalBashOperations(),
			{ signal: controller.signal },
		);
		setTimeout(() => controller.abort(), 20);

		const result = await resultPromise;

		expect(result.cancelled).toBe(true);
		expect(result.exitCode).toBeUndefined();
	});

	it.skipIf(process.platform === "win32")(
		"waits for a surviving descendant before reporting a local timeout",
		async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "pi-local-bash-tree-"));
			const pidPath = join(tempDir, "descendant.pid");
			let descendantPid: number | undefined;
			try {
				const operations = createLocalBashOperations();
				const executionPromise = operations.exec(createParentCommand(pidPath), process.cwd(), {
					onData: () => {},
					timeout: 0.1,
				});
				descendantPid = await waitForProcessId(pidPath).catch(() => undefined);
				if (descendantPid === undefined) {
					throw new Error("The local bash process did not start its descendant");
				}
				await expect(executionPromise).rejects.toThrow("timeout:0.1");
				expect(await waitForProcessExit(descendantPid)).toBe(true);
			} finally {
				if (descendantPid !== undefined) {
					try {
						process.kill(descendantPid, "SIGKILL");
					} catch {
						// The process tree already terminated.
					}
				}
				await rm(tempDir, { recursive: true, force: true });
			}
		},
		9000,
	);
});
