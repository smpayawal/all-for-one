#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ALL_FOR_ONE_WORKSPACE = "all-for-one-monorepo";
export const UPSTREAM_PI_WORKSPACE = "pi-monorepo";
export const UPSTREAM_PI_REPOSITORY = "earendil-works/pi";

export function normalizeRepositoryIdentity(value) {
	if (!value) return undefined;
	const normalized = value.trim().replace(/\.git$/, "");
	const scpMatch = /^git@github\.com:([^/]+\/[^/]+)$/.exec(normalized);
	if (scpMatch) return scpMatch[1];

	try {
		const url = new URL(normalized);
		if (url.hostname !== "github.com") return undefined;
		return url.pathname.replace(/^\//, "");
	} catch {
		return /^[^/]+\/[^/]+$/.test(normalized) ? normalized : undefined;
	}
}

export function assertPiPackagePublicationAllowed({ workspaceName, repository, dryRun = false }) {
	if (dryRun) {
		return { allowed: true, mode: "dry-run" };
	}

	if (workspaceName === ALL_FOR_ONE_WORKSPACE) {
		throw new Error(
			"All-For-One does not publish the Pi-compatible workspace packages to npm. Use the afo-v* GitHub release workflow instead.",
		);
	}
	if (workspaceName !== UPSTREAM_PI_WORKSPACE) {
		throw new Error(`Unexpected workspace for Pi package publication: ${workspaceName ?? "<missing>"}.`);
	}
	if (normalizeRepositoryIdentity(repository) !== UPSTREAM_PI_REPOSITORY) {
		throw new Error(
			`Pi package publication is restricted to ${UPSTREAM_PI_REPOSITORY}; resolved repository was ${repository ?? "<unknown>"}.`,
		);
	}

	return { allowed: true, mode: "publish" };
}

export function resolveRepositoryIdentity(cwd = process.cwd(), env = process.env) {
	const fromEnvironment = normalizeRepositoryIdentity(env.GITHUB_REPOSITORY);
	if (fromEnvironment) return fromEnvironment;

	const result = spawnSync("git", ["remote", "get-url", "origin"], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	if (result.status !== 0) return undefined;
	return normalizeRepositoryIdentity(result.stdout);
}

export function assertCurrentPiPublicationContext({ cwd = process.cwd(), env = process.env, dryRun = false } = {}) {
	const rootPackage = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
	return assertPiPackagePublicationAllowed({
		workspaceName: rootPackage.name,
		repository: resolveRepositoryIdentity(cwd, env),
		dryRun,
	});
}

function printUsage() {
	console.log("Usage: node scripts/publication-policy.mjs assert-pi-publish [--dry-run]");
}

export function runCli(argv = process.argv.slice(2)) {
	const [command, ...options] = argv;
	if (command === "--help" || command === "-h" || !command) {
		printUsage();
		return;
	}
	if (command !== "assert-pi-publish") throw new Error(`Unknown command: ${command}`);
	const unknown = options.filter((option) => option !== "--dry-run");
	if (unknown.length > 0) throw new Error(`Unknown option: ${unknown[0]}`);
	assertCurrentPiPublicationContext({ dryRun: options.includes("--dry-run") });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
	try {
		runCli();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
