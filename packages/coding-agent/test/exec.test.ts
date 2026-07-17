import { describe, expect, it } from "vitest";
import { execCommand } from "../src/core/exec.ts";

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
