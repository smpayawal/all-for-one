import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const profilerPath = resolve(scriptDir, "profile-coding-agent-node.mjs");

export const DEFAULT_STARTUP_BASELINE_RUNS = 5;
export const DEFAULT_STARTUP_BASELINE_WARMUPS = 1;

function hasFlag(argv, flag) {
	return argv.some((argument) => argument === flag);
}

export function withStartupBaselineDefaults(argv) {
	const args = [...argv];
	if (!hasFlag(args, "--runs")) {
		args.push("--runs", String(DEFAULT_STARTUP_BASELINE_RUNS));
	}
	if (!hasFlag(args, "--warmup")) {
		args.push("--warmup", String(DEFAULT_STARTUP_BASELINE_WARMUPS));
	}
	return args;
}

export async function runStartupBaseline(argv = process.argv.slice(2)) {
	const child = spawn(process.execPath, [profilerPath, ...withStartupBaselineDefaults(argv)], {
		stdio: "inherit",
		env: process.env,
	});

	return await new Promise((resolveExitCode, reject) => {
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`Startup baseline profiler exited from signal ${signal}`));
				return;
			}
			resolveExitCode(code ?? 1);
		});
	});
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
	runStartupBaseline()
		.then((exitCode) => {
			process.exitCode = exitCode;
		})
		.catch((error) => {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = 1;
		});
}
