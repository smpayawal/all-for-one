/**
 * Shared command execution utilities for extensions and custom tools.
 */

import { spawn } from "node:child_process";
import { waitForChildProcess } from "../utils/child-process.ts";
import { type ProcessTreeCleanupResult, terminateProcessTreeAndWait } from "../utils/shell.ts";

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
	processTreeCleanup?: ProcessTreeCleanupResult;
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
		const isolated = process.platform !== "win32";
		const proc = spawn(command, args, {
			cwd,
			// Isolate POSIX descendants so group termination cannot reach the agent process.
			detached: isolated,
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
		let terminationPromise: Promise<ProcessTreeCleanupResult> | undefined;

		const waitForProcessTreeCleanup = (): Promise<ProcessTreeCleanupResult> => {
			if (proc.pid !== undefined) {
				return terminateProcessTreeAndWait(proc.pid, { isolated });
			}

			return new Promise((cleanupResolve) => {
				let settled = false;
				const cleanupListeners = () => {
					proc.removeListener("spawn", onSpawn);
					proc.removeListener("error", onError);
				};
				const settleCleanup = (result: ProcessTreeCleanupResult) => {
					if (settled) return;
					settled = true;
					cleanupListeners();
					cleanupResolve(result);
				};
				const onSpawn = () => {
					if (proc.pid === undefined) {
						settleCleanup({
							gracefulAttempted: false,
							forceAttempted: false,
							completed: false,
							verified: false,
							error: "Child spawned without a process id.",
						});
						return;
					}
					void terminateProcessTreeAndWait(proc.pid, { isolated }).then(settleCleanup, (error) => {
						settleCleanup({
							gracefulAttempted: true,
							forceAttempted: true,
							completed: false,
							verified: false,
							error: error instanceof Error ? error.message : String(error),
						});
					});
				};
				const onError = (error: Error) => {
					settleCleanup({
						gracefulAttempted: false,
						forceAttempted: false,
						completed: false,
						verified: false,
						error: `Child could not be spawned: ${error.message}`,
					});
				};
				if (proc.pid !== undefined) {
					onSpawn();
				} else {
					proc.once("spawn", onSpawn);
					proc.once("error", onError);
				}
			});
		};

		const killProcess = (reason: Exclude<ExecTermination, "completed" | "signal" | "error">) => {
			if (!killed) {
				killed = true;
				killReason = reason;
				terminationPromise = waitForProcessTreeCleanup();
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

		const settle = async (code: number, termination: ExecTermination) => {
			if (timeoutId) clearTimeout(timeoutId);
			if (options?.signal) options.signal.removeEventListener("abort", onAbort);
			let processTreeCleanup: ProcessTreeCleanupResult | undefined;
			if (terminationPromise) {
				try {
					processTreeCleanup = await terminationPromise;
				} catch (error) {
					processTreeCleanup = {
						gracefulAttempted: true,
						forceAttempted: true,
						completed: false,
						verified: false,
						error: error instanceof Error ? error.message : String(error),
					};
				}
			}
			resolve({
				stdout: outputText(stdout),
				stderr: outputText(stderr),
				code,
				killed,
				stdoutTruncated: stdout.truncated,
				stderrTruncated: stderr.truncated,
				termination,
				processTreeCleanup,
			});
		};

		// Wait for process termination without hanging on inherited stdio handles
		// held open by detached descendants. A requested tree cleanup is awaited
		// separately so the result cannot race its force phase.
		waitForChildProcess(proc)
			.then((code) => settle(code ?? 1, killReason ?? (proc.signalCode ? "signal" : "completed")))
			.catch(() => settle(1, killReason ?? "error"));
	});
}
