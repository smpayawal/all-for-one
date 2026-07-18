/**
 * Shared command execution utilities for extensions and custom tools.
 */

import { spawn } from "node:child_process";
import { waitForChildProcess } from "../utils/child-process.ts";
import { isProcessTreeAlive, killProcessTree } from "../utils/shell.ts";

/**
 * Options for executing shell commands.
 */
export interface ExecOptions {
	/** AbortSignal to cancel the command */
	signal?: AbortSignal;
	/** Timeout in milliseconds */
	timeout?: number;
	/** Working directory */
	cwd?: string;
	/** Maximum bytes retained from each output stream. The streams continue draining after the limit. */
	maxOutputBytes?: number;
}

export type ExecTermination = "completed" | "aborted" | "timeout" | "signal" | "error";

/**
 * Result of executing a shell command.
 */
export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
	stdoutTruncated?: boolean;
	stderrTruncated?: boolean;
	termination?: ExecTermination;
}

interface CapturedOutput {
	chunks: Buffer[];
	bytes: number;
	truncated: boolean;
}

function appendOutput(output: CapturedOutput, data: Buffer, maxBytes: number | undefined): void {
	if (maxBytes === undefined) {
		output.chunks.push(data);
		return;
	}

	const remaining = maxBytes - output.bytes;
	if (remaining > 0) {
		const retained = data.subarray(0, remaining);
		output.chunks.push(retained);
		output.bytes += retained.byteLength;
	}
	if (data.byteLength > Math.max(remaining, 0)) {
		output.truncated = true;
	}
}

function outputText(output: CapturedOutput): string {
	return Buffer.concat(output.chunks).toString("utf8");
}

/**
 * Execute a shell command and return stdout/stderr/code.
 * Supports timeout and abort signal.
 */
export async function execCommand(
	command: string,
	args: string[],
	cwd: string,
	options?: ExecOptions,
): Promise<ExecResult> {
	return new Promise((resolve) => {
		const proc = spawn(command, args, {
			cwd,
			// Isolate POSIX descendants so group termination cannot reach the
			// agent process. Windows uses taskkill /T in killProcessTree().
			detached: process.platform !== "win32",
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});

		const maxOutputBytes =
			options?.maxOutputBytes === undefined || !Number.isFinite(options.maxOutputBytes)
				? undefined
				: Math.max(0, Math.floor(options.maxOutputBytes));
		const stdout: CapturedOutput = { chunks: [], bytes: 0, truncated: false };
		const stderr: CapturedOutput = { chunks: [], bytes: 0, truncated: false };
		let killed = false;
		let killReason: Exclude<ExecTermination, "completed" | "signal" | "error"> | undefined;
		let timeoutId: NodeJS.Timeout | undefined;
		let forceKillId: NodeJS.Timeout | undefined;
		let processExited = false;
		proc.once("exit", () => {
			processExited = true;
		});
		const terminateProcessTree = (signal: "SIGTERM" | "SIGKILL") => {
			if (proc.pid !== undefined) {
				killProcessTree(proc.pid, signal);
				return;
			}
			try {
				proc.kill(signal);
			} catch {
				// The child failed before a PID was assigned.
			}
		};

		const killProcess = (reason: Exclude<ExecTermination, "completed" | "signal" | "error">) => {
			if (!killed) {
				killed = true;
				killReason = reason;
				terminateProcessTree("SIGTERM");
				// Force kill after 5 seconds if SIGTERM doesn't work
				forceKillId = setTimeout(() => {
					forceKillId = undefined;
					if (
						proc.pid !== undefined &&
						(isProcessTreeAlive(proc.pid) ||
							(!processExited && proc.exitCode === null && proc.signalCode === null))
					) {
						terminateProcessTree("SIGKILL");
					}
				}, 5000);
			}
		};
		const onAbort = () => killProcess("aborted");

		// Handle abort signal
		if (options?.signal) {
			if (options.signal.aborted) {
				killProcess("aborted");
			} else {
				options.signal.addEventListener("abort", onAbort, { once: true });
			}
		}

		// Handle timeout
		if (options?.timeout && options.timeout > 0) {
			timeoutId = setTimeout(() => {
				killProcess("timeout");
			}, options.timeout);
		}

		proc.stdout?.on("data", (data) => {
			appendOutput(stdout, Buffer.isBuffer(data) ? data : Buffer.from(String(data)), maxOutputBytes);
		});

		proc.stderr?.on("data", (data) => {
			appendOutput(stderr, Buffer.isBuffer(data) ? data : Buffer.from(String(data)), maxOutputBytes);
		});

		// Wait for process termination without hanging on inherited stdio handles
		// held open by detached descendants.
		waitForChildProcess(proc)
			.then((code) => {
				if (timeoutId) clearTimeout(timeoutId);
				const treeStillAlive = killed && proc.pid !== undefined && isProcessTreeAlive(proc.pid);
				if (forceKillId && !treeStillAlive) clearTimeout(forceKillId);
				if (options?.signal) {
					options.signal.removeEventListener("abort", onAbort);
				}
				resolve({
					stdout: outputText(stdout),
					stderr: outputText(stderr),
					code: code ?? 1,
					killed,
					stdoutTruncated: stdout.truncated,
					stderrTruncated: stderr.truncated,
					termination: killReason ?? (proc.signalCode ? "signal" : "completed"),
				});
			})
			.catch((_err) => {
				if (timeoutId) clearTimeout(timeoutId);
				const treeStillAlive = killed && proc.pid !== undefined && isProcessTreeAlive(proc.pid);
				if (forceKillId && !treeStillAlive) clearTimeout(forceKillId);
				if (options?.signal) {
					options.signal.removeEventListener("abort", onAbort);
				}
				resolve({
					stdout: outputText(stdout),
					stderr: outputText(stderr),
					code: 1,
					killed,
					stdoutTruncated: stdout.truncated,
					stderrTruncated: stderr.truncated,
					termination: killReason ?? "error",
				});
			});
	});
}
