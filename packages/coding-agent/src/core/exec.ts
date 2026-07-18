/**
 * Shared command execution utilities for extensions and custom tools.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { waitForChildProcess } from "../utils/child-process.ts";
import { type ProcessTreeCleanupResult, terminateProcessTreeAndWait } from "../utils/shell.ts";

const PROCESS_TREE_CLEANUP_DEADLINE_MS = 10_000;
const PROCESS_EXIT_AFTER_CLEANUP_MS = 1_000;

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

interface ChildExitResult {
	exited: boolean;
	code: number;
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

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendCleanupError(result: ProcessTreeCleanupResult, message: string): ProcessTreeCleanupResult {
	return {
		...result,
		completed: false,
		verified: false,
		error: [result.error, message].filter(Boolean).join("; "),
	};
}

async function awaitCleanupWithDeadline(
	cleanupPromise: Promise<ProcessTreeCleanupResult>,
): Promise<ProcessTreeCleanupResult> {
	return Promise.race([
		cleanupPromise.catch((error) => ({
			gracefulAttempted: true,
			forceAttempted: true,
			completed: false,
			verified: false,
			error: error instanceof Error ? error.message : String(error),
		})),
		delay(PROCESS_TREE_CLEANUP_DEADLINE_MS).then(
			(): ProcessTreeCleanupResult => ({
				gracefulAttempted: true,
				forceAttempted: true,
				completed: false,
				verified: false,
				error: `Process-tree cleanup exceeded ${PROCESS_TREE_CLEANUP_DEADLINE_MS}ms.`,
			}),
		),
	]);
}

async function awaitChildExitWithDeadline(
	childExitPromise: Promise<number | null>,
	timeoutMs: number,
): Promise<ChildExitResult> {
	return Promise.race([
		childExitPromise
			.then((code) => ({ exited: true, code: code ?? 1 }))
			.catch(() => ({ exited: true, code: 1 })),
		delay(timeoutMs).then(() => ({ exited: false, code: 1 })),
	]);
}

function detachUnresponsiveChild(proc: ChildProcess): void {
	proc.stdout?.removeAllListeners();
	proc.stderr?.removeAllListeners();
	proc.removeAllListeners("error");
	proc.removeAllListeners("exit");
	proc.removeAllListeners("close");
	proc.stdout?.destroy();
	proc.stderr?.destroy();
	proc.unref();
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
		let settled = false;
		let killReason: Exclude<ExecTermination, "completed" | "signal" | "error"> | undefined;
		let timeoutId: NodeJS.Timeout | undefined;
		let terminationPromise: Promise<ProcessTreeCleanupResult> | undefined;

		const childExitPromise = waitForChildProcess(proc);

		const waitForProcessTreeCleanup = (): Promise<ProcessTreeCleanupResult> => {
			if (proc.pid !== undefined) {
				return terminateProcessTreeAndWait(proc.pid, { isolated });
			}

			return new Promise((cleanupResolve) => {
				let cleanupSettled = false;
				const cleanupListeners = () => {
					proc.removeListener("spawn", onSpawn);
					proc.removeListener("error", onError);
				};
				const settleCleanup = (result: ProcessTreeCleanupResult) => {
					if (cleanupSettled) return;
					cleanupSettled = true;
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

		const settle = (
			code: number,
			termination: ExecTermination,
			processTreeCleanup?: ProcessTreeCleanupResult,
		) => {
			if (settled) return;
			settled = true;
			if (timeoutId) clearTimeout(timeoutId);
			if (options?.signal) options.signal.removeEventListener("abort", onAbort);
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

		const finishTermination = async () => {
			if (!terminationPromise || !killReason) return;
			let processTreeCleanup = await awaitCleanupWithDeadline(terminationPromise);
			const childExit = await awaitChildExitWithDeadline(childExitPromise, PROCESS_EXIT_AFTER_CLEANUP_MS);
			if (!childExit.exited) {
				processTreeCleanup = appendCleanupError(
					processTreeCleanup,
					`Root process did not exit within ${PROCESS_EXIT_AFTER_CLEANUP_MS}ms after cleanup.`,
				);
				detachUnresponsiveChild(proc);
			}
			settle(childExit.code, killReason, processTreeCleanup);
		};

		const killProcess = (reason: Exclude<ExecTermination, "completed" | "signal" | "error">) => {
			if (!killed) {
				killed = true;
				killReason = reason;
				terminationPromise = waitForProcessTreeCleanup();
				void finishTermination();
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

		// Normal completion is handled independently. Once cancellation starts,
		// finishTermination owns settlement so descendant cleanup is awaited.
		childExitPromise
			.then((code) => {
				if (!killed) settle(code ?? 1, proc.signalCode ? "signal" : "completed");
			})
			.catch(() => {
				if (!killed) settle(1, "error");
			});
	});
}