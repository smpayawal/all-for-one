#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPrereleaseVersion } from "./allforone-version.mjs";
import { parseAllForOneReleaseTag, RELEASE_ASSETS } from "./allforone-release.mjs";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;
const CHECKSUMMED_FILES = [...RELEASE_ASSETS, "release-manifest.json", "RELEASE_NOTES.md"];
const EXPECTED_FILES = [...CHECKSUMMED_FILES, "SHA256SUMS"];

function sorted(values) {
	return [...values].sort((left, right) => left.localeCompare(right));
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function hashFile(path) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function parseChecksumFile(content) {
	const entries = new Map();
	for (const line of content.split(/\r?\n/)) {
		if (!line) continue;
		const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line);
		if (!match) throw new Error(`Invalid SHA256SUMS line: ${line}`);
		if (entries.has(match[2])) throw new Error(`Duplicate SHA256SUMS entry: ${match[2]}`);
		entries.set(match[2], match[1].toLowerCase());
	}
	return entries;
}

export function verifyReleaseDirectory({ directory, tag, commit }) {
	const releaseDirectory = resolve(directory);
	const version = parseAllForOneReleaseTag(tag);
	if (!COMMIT_PATTERN.test(commit)) throw new Error(`Invalid release commit: ${commit}`);

	for (const name of EXPECTED_FILES) {
		if (!existsSync(join(releaseDirectory, name))) {
			throw new Error(`Published release asset is missing: ${name}`);
		}
	}

	const manifest = readJson(join(releaseDirectory, "release-manifest.json"));
	if (manifest.schemaVersion !== 2) throw new Error(`Unsupported release manifest schema: ${manifest.schemaVersion}`);
	if (manifest.product !== "All-For-One") throw new Error(`Unexpected release manifest product: ${manifest.product}`);
	if (manifest.tag !== tag) throw new Error(`Release manifest tag ${manifest.tag} does not match ${tag}.`);
	if (manifest.version !== version) {
		throw new Error(`Release manifest version ${manifest.version} does not match ${version}.`);
	}
	if (manifest.commit !== commit) {
		throw new Error(`Release manifest commit ${manifest.commit} does not match ${commit}.`);
	}
	if (manifest.prerelease !== isPrereleaseVersion(version)) {
		throw new Error(`Release manifest prerelease flag does not match ${version}.`);
	}
	if (JSON.stringify(sorted(manifest.commands ?? [])) !== JSON.stringify(sorted(["allforone", "afo", "pi"]))) {
		throw new Error("Release manifest command set is invalid.");
	}
	if (JSON.stringify(sorted(manifest.assets ?? [])) !== JSON.stringify(sorted(EXPECTED_FILES))) {
		throw new Error("Release manifest asset set is invalid.");
	}

	const checksums = parseChecksumFile(readFileSync(join(releaseDirectory, "SHA256SUMS"), "utf8"));
	if (JSON.stringify(sorted(checksums.keys())) !== JSON.stringify(sorted(CHECKSUMMED_FILES))) {
		throw new Error("SHA256SUMS does not cover the exact published payload.");
	}

	for (const [name, expectedHash] of checksums) {
		const actualHash = hashFile(join(releaseDirectory, name));
		if (actualHash !== expectedHash) {
			throw new Error(`Checksum mismatch for ${name}: expected ${expectedHash}, found ${actualHash}.`);
		}
	}

	return {
		tag,
		version,
		prerelease: manifest.prerelease,
		piBaseline: manifest.piBaseline,
		commit,
		verifiedFiles: checksums.size,
	};
}

function parseArgs(argv) {
	const options = { json: false };
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--dir" || arg === "--tag" || arg === "--commit") {
			const value = argv[++index];
			if (!value) throw new Error(`${arg} requires a value.`);
			options[arg.slice(2)] = value;
			continue;
		}
		if (arg === "--json") {
			options.json = true;
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

function printUsage() {
	console.log(
		"Usage: node scripts/verify-allforone-release-assets.mjs --dir <release-assets> --tag <afo-vX.Y.Z> --commit <sha> [--json]",
	);
}

export function runCli(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	if (options.help) {
		printUsage();
		return;
	}
	if (!options.dir) throw new Error("--dir is required.");
	if (!options.tag) throw new Error("--tag is required.");
	if (!options.commit) throw new Error("--commit is required.");
	const result = verifyReleaseDirectory({ directory: options.dir, tag: options.tag, commit: options.commit });
	console.log(options.json ? JSON.stringify(result, null, 2) : `Verified ${result.tag} published release assets.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		runCli();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
