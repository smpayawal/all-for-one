#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDir, "..");
const TAG_PATTERN = /^afo-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;

export const RELEASE_ASSETS = [
	"all-for-one-darwin-arm64.tar.gz",
	"all-for-one-darwin-x64.tar.gz",
	"all-for-one-linux-arm64.tar.gz",
	"all-for-one-linux-x64.tar.gz",
	"all-for-one-windows-arm64.zip",
	"all-for-one-windows-x64.zip",
];

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function parseAllForOneReleaseTag(tag) {
	const match = TAG_PATTERN.exec(tag);
	if (!match) {
		throw new Error(`Invalid All-For-One release tag: ${tag}. Expected afo-v<semver>.`);
	}
	return match[1];
}

export function readAllForOneReleaseMetadata(repoRoot = defaultRepoRoot) {
	const rootPackage = readJson(join(repoRoot, "package.json"));
	const codingAgentPackage = readJson(join(repoRoot, "packages/coding-agent/package.json"));

	if (rootPackage.name !== "all-for-one-monorepo") {
		throw new Error(`Unexpected workspace name: ${rootPackage.name ?? "<missing>"}`);
	}

	return {
		product: "All-For-One",
		version: rootPackage.version,
		piBaseline: codingAgentPackage.version,
		commands: ["allforone", "afo", "pi"],
		repository: "https://github.com/smpayawal/all-for-one",
	};
}

export function validateAllForOneRelease(tag, repoRoot = defaultRepoRoot) {
	const tagVersion = parseAllForOneReleaseTag(tag);
	const metadata = readAllForOneReleaseMetadata(repoRoot);
	if (tagVersion !== metadata.version) {
		throw new Error(`Release tag version ${tagVersion} does not match All-For-One version ${metadata.version}.`);
	}
	return { ...metadata, tag };
}

export function extractUnreleasedChanges(changelog) {
	const heading = /^## (?:\[)?Unreleased(?:\])?\s*$/m;
	const match = heading.exec(changelog);
	if (!match) {
		throw new Error("CHANGELOG-AFO.md does not contain an Unreleased section.");
	}

	const contentStart = match.index + match[0].length;
	const remaining = changelog.slice(contentStart);
	const nextHeading = /^##\s+/m.exec(remaining);
	const section = (nextHeading ? remaining.slice(0, nextHeading.index) : remaining).trim();
	if (!section) {
		throw new Error("CHANGELOG-AFO.md Unreleased section is empty.");
	}
	return section;
}

export function createAllForOneReleaseFiles({ tag, commit, repoRoot = defaultRepoRoot }) {
	if (!COMMIT_PATTERN.test(commit)) {
		throw new Error(`Invalid release commit: ${commit}`);
	}

	const metadata = validateAllForOneRelease(tag, repoRoot);
	const changes = extractUnreleasedChanges(readFileSync(join(repoRoot, "CHANGELOG-AFO.md"), "utf8"));
	const generatedAt = new Date().toISOString();
	const notes = [
		`# ${metadata.product} ${metadata.version}`,
		"",
		`Pi compatibility baseline: ${metadata.piBaseline}`,
		`Source commit: ${commit}`,
		"",
		changes,
		"",
	].join("\n");
	const manifest = {
		schemaVersion: 1,
		product: metadata.product,
		version: metadata.version,
		tag,
		piBaseline: metadata.piBaseline,
		commit,
		generatedAt,
		commands: metadata.commands,
		repository: metadata.repository,
		assets: [...RELEASE_ASSETS, "release-manifest.json", "SHA256SUMS", "RELEASE_NOTES.md"],
	};
	return { manifest, notes, metadata };
}

function printUsage() {
	console.log(`Usage:
  node scripts/allforone-release.mjs validate --tag <afo-vX.Y.Z> [--json]
  node scripts/allforone-release.mjs prepare --tag <afo-vX.Y.Z> --commit <sha> --out <directory>
`);
}

function parseArgs(argv) {
	const [command, ...rest] = argv;
	const options = { command, json: false };
	for (let i = 0; i < rest.length; i++) {
		const arg = rest[i];
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "--tag" || arg === "--commit" || arg === "--out") {
			const value = rest[++i];
			if (!value) throw new Error(`${arg} requires a value.`);
			options[arg.slice(2)] = value;
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

export function runCli(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	if (options.help || !options.command) {
		printUsage();
		return;
	}
	if (!options.tag) throw new Error("--tag is required.");

	if (options.command === "validate") {
		const result = validateAllForOneRelease(options.tag);
		console.log(
			options.json
				? JSON.stringify(result, null, 2)
				: `Validated ${result.tag} for ${result.product} ${result.version} (Pi base ${result.piBaseline}).`,
		);
		return;
	}

	if (options.command === "prepare") {
		if (!options.commit) throw new Error("--commit is required.");
		if (!options.out) throw new Error("--out is required.");
		const outputDirectory = resolve(options.out);
		const { manifest, notes } = createAllForOneReleaseFiles({ tag: options.tag, commit: options.commit });
		mkdirSync(outputDirectory, { recursive: true });
		writeFileSync(join(outputDirectory, "RELEASE_NOTES.md"), notes);
		writeFileSync(join(outputDirectory, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
		console.log(`Prepared All-For-One release metadata in ${outputDirectory}.`);
		return;
	}

	throw new Error(`Unknown command: ${options.command}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
	try {
		runCli();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
