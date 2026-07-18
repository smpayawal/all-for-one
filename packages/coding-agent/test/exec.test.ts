import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { execCommand } from "../src/core/exec.ts";

async function waitForProcessId(path: string): Promise<number> {
	const deadline = Date.now() + 2000;
	while (Date.now() < deadline) {
		try {
			const value = Number.parseInt(await readFile(path, "utf8"), 10);
			if (Number.isInteger(value) && value > 0) return value;
		} catch {
			// The child has not written its PID yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error("Timed out waiting for descendant PID");
}

async function waitForProcessExit(pid: number, timeoutMs = 2000): Promise<boolean> {
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

describe("execCommand output and termination bounds", () => {
	it("retains bounded stdout and stderr while draining both streams", async () => {
		const result = await execCommand(
			process.execPath,
			["-e", "process.stdout.write('o'.repeat(100)); process.stderr.write('e'.repeat(100));"],
			process.cwd(),
			{ maxOutputBytes: 16 },
		);

		expect(result.code).toBe(0);
		expect(result.termination).toBe("completed");
		expect(result.stdout).toHaveLength(16);
		expect(result.stderr).toHaveLength(16);
		expect(result.stdoutTruncated).toBe(true);
		expect(result.stderrTruncated).toBe(true);
	});

	it("does not mark output truncated at the exact configured boundary", async () => {
		const result = await execCommand(
			process.execPath,
			["-e", "process.stdout.write('x'.repeat(16));"],
			process.cwd(),
			{ maxOutputBytes: 16 },
		);

		expect(result.stdout).toBe("x".repeat(16));
		expect(result.stdoutTruncated).toBe(false);
	});

	it("reports timeout separately from ordinary nonzero exits", async () => {
		const result = await execCommand(process.execPath, ["-e", "setTimeout(() => {}, 1000);"], process.cwd(), {
			timeout: 20,
		});

		expect(result.code).not.toBe(0);
		expect(result.killed).toBe(true);
		expect(result.termination).toBe("timeout");
	});

	it("reports cancellation separately from timeout", async () => {
		const controller = new AbortController();
		const resultPromise = execCommand(process.execPath, ["-e", "setTimeout(() => {}, 1000);"], process.cwd(), {
			signal: controller.signal,
			timeout: 1000,
		});
		setTimeout(() => controller.abort(), 20);

		const result = await resultPromise;
		expect(result.code).not.toBe(0);
		expect(result.killed).toBe(true);
		expect(result.termination).toBe("aborted");
	});

	it("terminates descendants with the timed-out command", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-exec-tree-"));
		const pidPath = join(tempDir, "descendant.pid");
		let descendantPid: number | undefined;
		const descendantScript = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);";
		const parentScript = [
			"const { spawn } = require('node:child_process');",
			"const { writeFileSync } = require('node:fs');",
			`const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: 'ignore' });`,
			`writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));`,
			"setInterval(() => {}, 1000);",
		].join(" ");

		try {
			const resultPromise = execCommand(process.execPath, ["-e", parentScript], process.cwd(), { timeout: 100 });
			descendantPid = await waitForProcessId(pidPath);
			const result = await resultPromise;

			expect(result.killed).toBe(true);
			expect(result.termination).toBe("timeout");
			expect(await waitForProcessExit(descendantPid, 6500)).toBe(true);
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
	}, 9000);

	it.skipIf(process.platform === "win32")("reports a child signal termination", async () => {
		const result = await execCommand(
			process.execPath,
			["-e", "process.kill(process.pid, 'SIGTERM');"],
			process.cwd(),
		);

		expect(result.code).not.toBe(0);
		expect(result.termination).toBe("signal");
	});

	it.skipIf(process.platform === "win32")(
		"force-kills a child that ignores SIGTERM after the termination grace period",
		async () => {
			const startedAt = Date.now();
			const result = await execCommand(
				process.execPath,
				["-e", "process.on('SIGTERM', () => {}); setTimeout(() => process.exit(0), 8000);"],
				process.cwd(),
				{ timeout: 250 },
			);

			expect(Date.now() - startedAt).toBeLessThan(7000);
			expect(result.code).not.toBe(0);
			expect(result.killed).toBe(true);
			expect(result.termination).toBe("timeout");
		},
		9000,
	);

	it("preserves stdout and stderr for a nonzero adapter result", async () => {
		const result = await execCommand(
			process.execPath,
			["-e", "process.stdout.write('stdout'); process.stderr.write('stderr'); process.exit(3);"],
			process.cwd(),
		);

		expect(result.code).toBe(3);
		expect(result.stdout).toBe("stdout");
		expect(result.stderr).toBe("stderr");
		expect(result.termination).toBe("completed");
	});
});
