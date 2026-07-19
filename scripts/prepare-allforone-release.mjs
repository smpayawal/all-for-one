#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPrereleaseVersion, validateAllForOneVersion } from "./allforone-version.mjs";

export { isPrereleaseVersion, validateAllForOneVersion } from "./allforone-version.mjs";

const defaultRepoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PRODUCT_VERSION_PATTERN = /^(\tversion:\s*")([^"]+)(",?)$/m;

export function extractProductVersion(source) {
	const matches = [...source.matchAll(new RegExp(PRODUCT_VERSION_PATTERN.source, "gm"))];
	if (matches.length !== 1) {
		throw new Error(`Expected one All-For-One product version, found ${matches.length}.`);
	}
	return matches[0][2];
}

export function updateProductVersion(source, version) {
	validateAllForOneVersion(version);
	extractProductVersion(source);
	return source.replace(PRODUCT_VERSION_PATTERN, `$1${version}$3`);
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractVersionChanges(changelog, version) {
	validateAllForOneVersion(version);
	const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?: - \\d{4}-\\d{2}-\\d{2})?\\s*$`, "m");
	const match = heading.exec(changelog);
	if (!match) {
		throw new Error(`CHANGELOG-AFO.md does not contain a section for ${version}.`);
	}

	const contentStart = match.index + match[0].length;
	const remaining = changelog.slice(contentStart);
	const nextHeading = /^##\s+/m.exec(remaining);
	const section = (nextHeading ? remaining.slice(0, nextHeading.index) : remaining).trim();
	if (!section) {
		throw new Error(`CHANGELOG-AFO.md section for ${version} is empty.`);
	}
	return section;
}

export function archiveUnreleasedChanges(changelog, version, date) {
	validateAllForOneVersion(version);
	if (!DATE_PATTERN.test(date)) {
		throw new Error(`Invalid release date: ${date}. Expected YYYY-MM-DD.`);
	}
	if (new RegExp(`^## \\[${escapeRegExp(version)}\\]`, "m").test(changelog)) {
		throw new Error(`CHANGELOG-AFO.md already contains a section for ${version}.`);
	}

	const heading = /^## Unreleased\s*$/m;
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

	const suffix = nextHeading ? remaining.slice(nextHeading.index).replace(/^\s+/, "") : "";
	const prefix = changelog.slice(0, contentStart).replace(/\s+$/, "");
	const versioned = `## [${version}] - ${date}\n\n${section}`;
	return `${prefix}\n\n${versioned}${suffix ? `\n\n${suffix}` : "\n"}`;
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
}

export function inspectPreparedRelease(repoRoot, version) {
	validateAllForOneVersion(version);
	const rootPackage = readJson(join(repoRoot, "package.json"));
	const lockfile = readJson(join(repoRoot, "package-lock.json"));
	const productSource = readFileSync(join(repoRoot, "packages/coding-agent/src/allforone/product.ts"), "utf8");
	const changelog = readFileSync(join(repoRoot, "CHANGELOG-AFO.md"), "utf8");
	const productVersion = extractProductVersion(productSource);

	if (rootPackage.version !== version) {
		throw new Error(`package.json version ${rootPackage.version} does not match ${version}.`);
	}
	if (lockfile.version !== version || lockfile.packages?.[""]?.version !== version) {
		throw new Error(`package-lock.json does not match All-For-One version ${version}.`);
	}
	if (productVersion !== version) {
		throw new Error(`Product version ${productVersion} does not match ${version}.`);
	}

	const changes = extractVersionChanges(changelog, version);
	return {
		version,
		prerelease: isPrereleaseVersion(version),
		changes,
	};
}

export function prepareAllForOneRelease({ repoRoot = defaultRepoRoot, version, date, dryRun = false }) {
	validateAllForOneVersion(version);
	if (!DATE_PATTERN.test(date)) {
		throw new Error(`Invalid release date: ${date}. Expected YYYY-MM-DD.`);
	}

	const packagePath = join(repoRoot, "package.json");
	const lockPath = join(repoRoot, "package-lock.json");
	const productPath = join(repoRoot, "packages/coding-agent/src/allforone/product.ts");
	const changelogPath = join(repoRoot, "CHANGELOG-AFO.md");

	const rootPackage = readJson(packagePath);
	const lockfile = readJson(lockPath);
	const productSource = readFileSync(productPath, "utf8");
	const changelog = readFileSync(changelogPath, "utf8");
	const currentProductVersion = extractProductVersion(productSource);

	if (rootPackage.version !== currentProductVersion) {
		throw new Error(
			`Current product metadata is inconsistent: package.json ${rootPackage.version}, product.ts ${currentProductVersion}.`,
		);
	}
	if (lockfile.version !== rootPackage.version || lockfile.packages?.[""]?.version !== rootPackage.version) {
		throw new Error("Current package-lock.json root version does not match package.json.");
	}

	rootPackage.version = version;
	lockfile.version = version;
	lockfile.packages[""].version = version;
	const nextProductSource = updateProductVersion(productSource, version);
	const nextChangelog = archiveUnreleasedChanges(changelog, version, date);

	if (!dryRun) {
		writeJson(packagePath, rootPackage);
		writeJson(lockPath, lockfile);
		writeFileSync(productPath, nextProductSource);
		writeFileSync(changelogPath, nextChangelog);
	}

	return {
		version,
		date,
		prerelease: isPrereleaseVersion(version),
		files: ["package.json", "package-lock.json", "packages/coding-agent/src/allforone/product.ts", "CHANGELOG-AFO.md"],
		dryRun,
	};
}

function parseArgs(argv) {
	const options = { dryRun: false, check: false, json: false };
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--date") {
			const value = argv[++index];
			if (!value) throw new Error("--date requires a value.");
			options.date = value;
			continue;
		}
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--check") {
			options.check = true;
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
		if (!arg.startsWith("-") && !options.version) {
			options.version = arg;
			continue;
		}
		throw new Error(`Unknown option: ${arg}`);
	}
	return options;
}

function printUsage() {
	console.log(`Usage:
  node scripts/prepare-allforone-release.mjs <version> [--date YYYY-MM-DD] [--dry-run] [--json]
  node scripts/prepare-allforone-release.mjs <version> --check [--json]
`);
}

function runCli(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	if (options.help || !options.version) {
		printUsage();
		return;
	}

	const result = options.check
		? inspectPreparedRelease(defaultRepoRoot, options.version)
		: prepareAllForOneRelease({
				repoRoot: defaultRepoRoot,
				version: options.version,
				date: options.date ?? new Date().toISOString().slice(0, 10),
				dryRun: options.dryRun,
			});

	console.log(options.json ? JSON.stringify(result, null, 2) : `All-For-One ${result.version} release state is valid.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		runCli();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
