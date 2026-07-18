import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { getBinDir } from "../config.ts";

export interface ShellConfig {
	shell: string;
	args: string[];
	commandTransport?: "argv" | "stdin";
}

/**
 * Find bash executable on PATH (cross-platform)
 */
function isLegacyWslBashPath(path: string): boolean {
	const normalized = path.replace(/\//g, "\\").toLowerCase();
	return /^[a-z]:\\windows\\(?:system32|sysnative)\\bash\.exe$/.test(normalized);
}

function getBashShellConfig(shell: string): ShellConfig {
	return isLegacyWslBashPath(shell) ? { shell, args: ["-s"], commandTransport: "stdin" } : { shell, args: ["-c"] };
}

function findBashOnPath(): string | null {
	if (process.platform === "win32") {
		// Windows: Use 'where' and verify file exists (where can return non-existent paths)
		try {
			const result = spawnSync("where", ["bash.exe"], {
				encoding: "utf-8",
				timeout: 5000,
				windowsHide: true,
			});
			if (result.status === 0 && result.stdout) {
				const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
				if (firstMatch && existsSync(firstMatch)) {
					return firstMatch;
				}
			}
		} catch {
			// Ignore errors
		}
		return null;
	}

	// Unix: Use 'which' and trust its output (handles Termux and special filesystems)
	try {
		const result = spawnSync("which", ["bash"], { encoding: "utf-8", timeout: 5000 });
		if (result.status === 0 && result.stdout) {
			const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
			if (firstMatch) {
				return firstMatch;
			}
		}
	} catch {
		// Ignore errors
	}
	return null;
}

/**
 * Resolve shell configuration based on platform and an optional explicit shell path.
 * Resolution order:
 * 1. User-specified shellPath
 * 2. On Windows: Git Bash in known locations, then bash on PATH
 * 3. On Unix: /bin/bash, then bash on PATH, then fallback to sh
 */
export function getShellConfig(customShellPath?: string): ShellConfig {
	// 1. Check user-specified shell path
	if (customShellPath) {
		if (existsSync(customShellPath)) {
			return getBashShellConfig(customShellPath);
		}
		throw new Error(`Custom shell path not found: ${customShellPath}`);
	}

	if (process.platform === "win32") {
		// 2. Try Git Bash in known locations
		const paths: string[] = [];
		const programFiles = process.env.ProgramFiles;
		if (programFiles) {
			paths.push(`${programFiles}\\Git\\bin\\bash.exe`);
		}
		const programFilesX86 = process.env["ProgramFiles(x86)"];
		if (programFilesX86) {
			paths.push(`${programFilesX86}\\Git\\bin\\bash.exe`);
		}

		for (const path of paths) {
			if (existsSync(path)) {
				return getBashShellConfig(path);
			}
		}

		// 3. Fallback: search bash.exe on PATH (Cygwin, MSYS2, WSL, etc.)
		const bashOnPath = findBashOnPath();
		if (bashOnPath) {
			return getBashShellConfig(bashOnPath);
		}

		throw new Error(
			`No bash shell found. Options:\n` +
				`  1. Install Git for Windows: https://git-scm.com/download/win\n` +
				`  2. Add your bash to PATH (Cygwin, MSYS2, etc.)\n` +
				"  3. Set shellPath in settings.json\n\n" +
				`Searched Git Bash in:\n${paths.map((p) => `  ${p}`).join("\n")}`,
		);
	}

	// Unix: try /bin/bash, then bash on PATH, then fallback to sh
	if (existsSync("/bin/bash")) {
		return getBashShellConfig("/bin/bash");
	}

	const bashOnPath = findBashOnPath();
	if (bashOnPath) {
		return getBashShellConfig(bashOnPath);
	}

	return { shell: "sh", args: ["-c"] };
}

export function getShellEnv(): NodeJS.ProcessEnv {
	const binDir = getBinDir();
	const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
	const currentPath = process.env[pathKey] ?? "";
	const pathEntries = currentPath.split(delimiter).filter(Boolean);
	const hasBinDir = pathEntries.includes(binDir);
	const updatedPath = hasBinDir ? currentPath : [binDir, currentPath].filter(Boolean).join(delimiter);

	return {
		...process.env,
		[pathKey]: updatedPath,
	};
}

/**
 * Sanitize binary output for display/storage.
 * Removes characters that crash string-width or cause display issues:
 * - Control characters (except tab, newline, carriage return)
 * - Lone surrogates
 * - Unicode Format characters (crash string-width due to a bug)
 * - Characters with undefined code points
 */
export function sanitizeBinaryOutput(str: string): string {
	// Use Array.from to properly iterate over code points (not code units)
	// This handles surrogate pairs correctly and catches edge cases where
	// codePointAt() might return undefined
	return Array.from(str)
		.filter((char) => {
			// Filter out characters that cause string-width to crash
			// This includes:
			// - Unicode format characters
			// - Lone surrogates (already filtered by Array.from)
			// - Control chars except \t \n \r
			// - Characters with undefined code points

			const code = char.codePointAt(0);

			// Skip if code point is undefined (edge case with invalid strings)
			if (code === undefined) return false;

			// Allow tab, newline, carriage return
			if (code === 0x09 || code === 0x0a || code === 0x0d) return true;

			// Filter out control characters (0x00-0x1F, except 0x09, 0x0a, 0x0x0d)
			if (code <= 0x1f) return false;

			// Filter out Unicode format characters
			if (code >= 0xfff9 && code <= 0xfffb) return false;

			return true;
		})
		.join("");
}

export type ProcessTreeSignal = "SIGTERM" | "SIGKILL";

export interface ProcessTreeOptions {
	/** True only when pid is the leader of an intentionally isolated POSIX process group. */
	isolated?: boolean;
}

export interface ProcessTreeRequestResult {
	/** Whether the termination request completed without an unresolved helper error. */
	requestCompleted: boolean;
	/** Whether the complete tree is known to be alive after the request. */
	treeAlive: boolean | undefined;
	/** Whether tree liveness was checked rather than inferred from the root process. */
	verified: boolean;
	error?: string;
}

export interface ProcessTreeCleanupResult {
	gracefulAttempted: boolean;
	forceAttempted: boolean;
	/** True only when the tree was verified absent after the required cleanup request. */
	completed: boolean;
	verified: boolean;
	error?: string;
}

const PROCESS_TREE_GRACE_MS = 5_000;
const PROCESS_TREE_FORCE_WAIT_MS = 1_000;
const PROCESS_TREE_POLL_MS = 20;
const PROCESS_HELPER_TIMEOUT_MS = 2_000;
const PROCESS_HELPER_MAX_OUTPUT_BYTES = 64 * 1024;

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
	return typeof error === "object" && error !== null && "code" in error
		? String((error as { code?: unknown }).code)
		: undefined;
}

/**
 * Detached child processes must be tracked so they can be killed on parent
 * shutdown signals (SIGHUP/SIGTERM).
 */
const trackedDetachedChildPids = new Set<number>();

export function trackDetachedChildPid(pid: number): void {
	trackedDetachedChildPids.add(pid);
}

export function untrackDetachedChildPid(pid: number): void {
	trackedDetachedChildPids.delete(pid);
}

export function killTrackedDetachedChildren(): void {
	for (const pid of trackedDetachedChildPids) {
		void requestProcessTreeTermination(pid, "SIGKILL", { isolated: true });
	}
	trackedDetachedChildPids.clear();
}

interface ProcessHelperResult {
	exitCode: number | null;
	stdout: string;
	error?: string;
}

function runProcessHelper(
	command: string,
	args: string[],
	timeoutMs = PROCESS_HELPER_TIMEOUT_MS,
): Promise<ProcessHelperResult> {
	return new Promise((resolve) => {
		let child: ChildProcess;
		try {
			child = spawn(command, args, {
				stdio: ["ignore", "pipe", "ignore"],
				windowsHide: true,
			});
		} catch (error) {
			resolve({ exitCode: null, stdout: "", error: errorMessage(error) });
			return;
		}

		let settled = false;
		let timedOut = false;
		let timeoutId: NodeJS.Timeout | undefined;
		let hardTimeoutId: NodeJS.Timeout | undefined;
		let stdout = "";
		let stdoutBytes = 0;

		const cleanup = () => {
			if (timeoutId) clearTimeout(timeoutId);
			if (hardTimeoutId) clearTimeout(hardTimeoutId);
			child.stdout?.removeListener("data", onData);
			child.removeListener("error", onError);
			child.removeListener("close", onClose);
		};
		const settle = (result: ProcessHelperResult) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(result);
		};
		const onData = (chunk: Buffer | string) => {
			const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
			const remaining = PROCESS_HELPER_MAX_OUTPUT_BYTES - stdoutBytes;
			if (remaining > 0) {
				stdout += text.slice(0, remaining);
				stdoutBytes += Math.min(text.length, remaining);
			}
		};
		const onError = (error: Error) => {
			settle({ exitCode: null, stdout, error: errorMessage(error) });
		};
		const onClose = (code: number | null) => {
			settle({
				exitCode: code,
				stdout,
				error: timedOut ? `helper timed out after ${timeoutMs}ms` : undefined,
			});
		};

		child.stdout?.setEncoding("utf8");
		child.stdout?.on("data", onData);
		child.once("error", onError);
		child.once("close", onClose);
		timeoutId = setTimeout(() => {
			timedOut = true;
			try {
				child.kill("SIGKILL");
			} catch {
				// The helper may already have exited.
			}
			hardTimeoutId = setTimeout(() => {
				settle({ exitCode: null, stdout, error: `helper did not exit after ${timeoutMs}ms` });
			}, 500);
		}, timeoutMs);
	});
}

const WINDOWS_PROCESS_TREE_QUERY = [
	"$root = [int]$args[0];",
	"$all = @(Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId, ParentProcessId);",
	"$ids = New-Object 'System.Collections.Generic.HashSet[int]';",
	"$pending = New-Object 'System.Collections.Generic.Queue[int]';",
	"[void]$ids.Add($root);",
	"[void]$pending.Enqueue($root);",
	"while ($pending.Count -gt 0) {",
	"  $parent = $pending.Dequeue();",
	"  foreach ($item in $all) {",
	"    if ($item.ParentProcessId -eq $parent -and $ids.Add([int]$item.ProcessId)) {",
	"      [void]$pending.Enqueue([int]$item.ProcessId);",
	"    }",
	"  }",
	"}",
	"$ids | Sort-Object",
].join(" ");

interface WindowsProcessTreeQuery {
	pids: number[];
	available: boolean;
	error?: string;
}

async function queryWindowsProcessTree(rootPid: number): Promise<WindowsProcessTreeQuery> {
	const args = ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_PROCESS_TREE_QUERY, String(rootPid)];
	for (const command of ["powershell.exe", "pwsh.exe"]) {
		const result = await runProcessHelper(command, args);
		if (result.exitCode === 0) {
			const pids = result.stdout
				.split(/\r?\n/)
				.map((line) => Number.parseInt(line.trim(), 10))
				.filter((pid) => Number.isInteger(pid) && pid > 0);
			return { pids: Array.from(new Set([rootPid, ...pids])), available: true };
		}
	}
	return { pids: [rootPid], available: false, error: "PowerShell process-tree discovery is unavailable." };
}

function processIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function requestWindowsProcessTreeTermination(
	pid: number,
	signal: ProcessTreeSignal,
): Promise<ProcessTreeRequestResult> {
	const before = await queryWindowsProcessTree(pid);
	const knownPids = new Set(before.pids);
	const force = signal === "SIGKILL";
	const args = [...(force ? ["/F"] : []), "/T", "/PID", String(pid)];
	const rootResult = await runProcessHelper("taskkill", args);
	const after = await queryWindowsProcessTree(pid);
	for (const descendantPid of after.pids) knownPids.add(descendantPid);

	const descendantPids = Array.from(knownPids).filter((candidate) => candidate !== pid);
	const fallbackErrors: string[] = [];
	const rootSucceeded = rootResult.exitCode === 0;
	const treeKnownAlive = after.available
		? processIsAlive(pid) || after.pids.some((candidate) => candidate !== pid && processIsAlive(candidate))
		: undefined;

	const fallbackAttempted = !rootSucceeded || treeKnownAlive === true;
	if (fallbackAttempted) {
		for (const candidate of [pid, ...descendantPids]) {
			try {
				process.kill(candidate, signal);
			} catch (error) {
				if (errorCode(error) !== "ESRCH") fallbackErrors.push(`${candidate}: ${errorMessage(error)}`);
			}
		}
	}
	const finalQuery = fallbackAttempted ? await queryWindowsProcessTree(pid) : after;
	const finalTreeAlive = finalQuery.available
		? processIsAlive(pid) || finalQuery.pids.some((candidate) => candidate !== pid && processIsAlive(candidate))
		: undefined;

	const errors = [
		before.error,
		rootResult.error,
		!rootSucceeded ? `taskkill exited with code ${rootResult.exitCode}` : undefined,
		finalQuery.error,
		finalTreeAlive === true ? "Process tree remains alive after termination request." : undefined,
		...fallbackErrors,
	].filter((value): value is string => value !== undefined);
	const requestCompleted = (rootSucceeded || fallbackAttempted) && fallbackErrors.length === 0;
	return {
		requestCompleted,
		treeAlive: finalTreeAlive,
		verified: finalQuery.available,
		error: errors.length > 0 ? errors.join("; ") : undefined,
	};
}

/** Request process-tree termination and await the operating-system helper where one is used. */
export async function requestProcessTreeTermination(
	pid: number,
	signal: ProcessTreeSignal = "SIGKILL",
	options: ProcessTreeOptions = {},
): Promise<ProcessTreeRequestResult> {
	if (process.platform === "win32") return requestWindowsProcessTreeTermination(pid, signal);

	const target = options.isolated ? -pid : pid;
	try {
		process.kill(target, signal);
		return { requestCompleted: true, treeAlive: undefined, verified: false };
	} catch (error) {
		if (errorCode(error) === "ESRCH") {
			return { requestCompleted: true, treeAlive: false, verified: true };
		}
		return { requestCompleted: false, treeAlive: true, verified: false, error: errorMessage(error) };
	}
}

function waitForProcessTreeExit(pid: number, options: ProcessTreeOptions, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + Math.max(0, timeoutMs);
	return new Promise((resolve) => {
		let timer: NodeJS.Timeout | undefined;
		let settled = false;
		const finish = (exited: boolean) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			resolve(exited);
		};
		const check = () => {
			if (!isProcessTreeAlive(pid, options)) {
				finish(true);
				return;
			}
			const remaining = deadline - Date.now();
			if (remaining <= 0) {
				finish(false);
				return;
			}
			timer = setTimeout(check, Math.min(PROCESS_TREE_POLL_MS, remaining));
		};
		check();
	});
}

/**
 * Terminate an intentionally isolated local process tree. POSIX callers get a
 * bounded SIGTERM grace period followed by SIGKILL. Windows uses an awaited
 * forced taskkill request and discovers descendants independently of the root
 * process so a root that exits early does not make cleanup appear complete.
 */
export async function terminateProcessTreeAndWait(
	pid: number,
	options: ProcessTreeOptions & { graceMs?: number; forceWaitMs?: number } = {},
): Promise<ProcessTreeCleanupResult> {
	if (process.platform === "win32") {
		const forced = await requestProcessTreeTermination(pid, "SIGKILL", options);
		return {
			gracefulAttempted: false,
			forceAttempted: true,
			completed: forced.treeAlive === false,
			verified: forced.verified,
			error: forced.error,
		};
	}

	const isolatedOptions: ProcessTreeOptions = { isolated: options.isolated === true };
	const graceful = await requestProcessTreeTermination(pid, "SIGTERM", isolatedOptions);
	const graceMs = options.graceMs ?? PROCESS_TREE_GRACE_MS;
	if (await waitForProcessTreeExit(pid, isolatedOptions, graceMs)) {
		return {
			gracefulAttempted: true,
			forceAttempted: false,
			completed: true,
			verified: true,
			error: graceful.error,
		};
	}

	const forced = await requestProcessTreeTermination(pid, "SIGKILL", isolatedOptions);
	const forceWaitMs = options.forceWaitMs ?? PROCESS_TREE_FORCE_WAIT_MS;
	const completed = await waitForProcessTreeExit(pid, isolatedOptions, forceWaitMs);
	const errors = [graceful.error, forced.error].filter((value): value is string => value !== undefined);
	return {
		gracefulAttempted: true,
		forceAttempted: true,
		completed,
		verified: true,
		error: errors.length > 0 ? errors.join("; ") : undefined,
	};
}

/** Fire-and-forget compatibility wrapper for shutdown paths. */
export function killProcessTree(
	pid: number,
	signal: ProcessTreeSignal = "SIGKILL",
	options: ProcessTreeOptions = {},
): void {
	void requestProcessTreeTermination(pid, signal, options);
}

/**
 * Check whether a process group or direct child is still alive.
 * POSIX group liveness lets callers force-kill descendants even after the
 * process-group leader has exited, but only for explicitly isolated children.
 */
export function isProcessTreeAlive(pid: number, options: ProcessTreeOptions = {}): boolean {
	const target = process.platform === "win32" || !options.isolated ? pid : -pid;
	try {
		process.kill(target, 0);
		return true;
	} catch {
		return false;
	}
}
