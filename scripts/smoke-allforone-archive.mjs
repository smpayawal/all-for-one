#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function launcherNames(platform = process.platform) {
	return platform === "win32" ? ["allforone.exe", "afo.cmd", "pi.cmd"] : ["allforone", "afo", "pi"];
}

export function expectedVersionFromMetadata(repoRoot = defaultRepoRoot) {
	const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
	const codingAgentPackage = JSON.parse(readFileSync(join(repoRoot, "packages/coding-agent/package.json"), "utf8"));
	return `All-For-One ${rootPackage.version} (Pi base ${codingAgentPackage.version})`;
}

function runLauncher(launcher, args, directory) {
	const result = spawnSync(launcher, args, {
		cwd: directory,
		encoding: "utf8",
		env: {
			...process.env,
			AFO_OFFLINE: "1",
			PI_OFFLINE: "1",
		},
		shell: process.platform === "win32" && launcher.endsWith(".cmd"),
	});

	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(
			`${basename(launcher)} ${args.join(" ")} failed with status ${result.status}.\n${result.stdout}${result.stderr}`,
		);
	}
	return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

export function smokeAllForOneDirectory(directory, repoRoot = defaultRepoRoot) {
	const resolvedDirectory = resolve(directory);
	const expectedVersion = expectedVersionFromMetadata(repoRoot);
	const results = [];

	for (const name of launcherNames()) {
		const launcher = join(resolvedDirectory, name);
		if (!existsSync(launcher)) {
			throw new Error(`Missing release launcher: ${launcher}`);
		}

		const version = runLauncher(launcher, ["--version"], resolvedDirectory);
		if (version.stdout !== expectedVersion) {
			throw new Error(`${name} reported unexpected version: ${version.stdout}`);
		}

		const help = runLauncher(launcher, ["--help"], resolvedDirectory);
		if (!help.stdout.includes("All-For-One") || !help.stdout.includes("Usage:") || !help.stdout.includes("allforone")) {
			throw new Error(`${name} returned unexpected help output.`);
		}

		results.push({ name, version: version.stdout });
	}

	return results;
}

function parseArgs(argv) {
	const options = {};
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--dir") {
			const value = argv[++index];
			if (!value) throw new Error("--dir requires a value.");
			options.directory = value;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			options.help = true;
			continue;
		}
		throw new Error(`Unknown option: ${arg}`);
	}
	return options;
}

function runCli(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	if (options.help) {
		console.log("Usage: node scripts/smoke-allforone-archive.mjs --dir <extracted-directory>");
		return;
	}
	if (!options.directory) throw new Error("--dir is required.");

	const results = smokeAllForOneDirectory(options.directory);
	for (const result of results) {
		console.log(`${result.name}: ${result.version}`);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		runCli();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
