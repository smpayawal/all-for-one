#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ALL_FOR_ONE_WORKSPACE } from "./publication-policy.mjs";

const root = resolve(process.cwd());
const read = (path) => readFileSync(join(root, path), "utf8");

function requireText(name, source, requiredValues) {
	for (const required of requiredValues) {
		if (!source.includes(required)) {
			throw new Error(`${name} is missing required policy: ${required}`);
		}
	}
}

function forbidText(name, source, forbiddenValues) {
	for (const forbidden of forbiddenValues) {
		if (source.includes(forbidden)) {
			throw new Error(`${name} contains prohibited policy or behavior: ${forbidden}`);
		}
	}
}

const rootPackage = JSON.parse(read("package.json"));
const expectedPackages = new Map([
	["packages/ai", "@earendil-works/pi-ai"],
	["packages/agent", "@earendil-works/pi-agent-core"],
	["packages/tui", "@earendil-works/pi-tui"],
	["packages/coding-agent", "@earendil-works/pi-coding-agent"],
]);

if (rootPackage.name !== ALL_FOR_ONE_WORKSPACE) {
	throw new Error(`Publication policy check expected ${ALL_FOR_ONE_WORKSPACE}, found ${rootPackage.name ?? "<missing>"}.`);
}

for (const [directory, expectedName] of expectedPackages) {
	const packageJson = JSON.parse(read(`${directory}/package.json`));
	if (packageJson.name !== expectedName) {
		throw new Error(`${directory} changed its Pi-compatible package name to ${packageJson.name ?? "<missing>"}.`);
	}
	if (packageJson.private !== true) {
		throw new Error(`${directory} must remain private in All-For-One to prevent npm publication.`);
	}
}

for (const scriptName of ["publish", "release:patch", "release:minor", "release:major", "release:fix-links"]) {
	const command = rootPackage.scripts?.[scriptName];
	if (typeof command !== "string" || !command.startsWith("node scripts/publication-policy.mjs assert-pi-publish &&")) {
		throw new Error(`Root script ${scriptName} is missing the fail-closed Pi publication guard.`);
	}
}

if (rootPackage.scripts?.["release:afo:prepare"] !== "node scripts/prepare-allforone-release.mjs") {
	throw new Error("All-For-One release preparation must use scripts/prepare-allforone-release.mjs.");
}

for (const [name, path] of [
	["release preparation", "scripts/prepare-allforone-release.mjs"],
	["release metadata", "scripts/allforone-release.mjs"],
]) {
	if (!read(path).includes('from "./allforone-version.mjs"')) {
		throw new Error(`All-For-One ${name} must use the shared strict version parser.`);
	}
}

const releaseWorkflow = read(".github/workflows/allforone-release.yml");
requireText("All-For-One release workflow", releaseWorkflow, [
	"branches: [main]",
	"afo-v*",
	"scripts/prepare-allforone-release.mjs",
	"origin/main",
	"verify-published-release:",
	"uses: ./.github/workflows/allforone-verify-release.yml",
]);
forbidText("All-For-One release workflow", releaseWorkflow, [
	"npm publish",
	"NPM_TOKEN",
	"scripts/publish.mjs",
	"scripts/release.mjs",
	"origin/allforone",
]);

const verifyWorkflow = read(".github/workflows/allforone-verify-release.yml");
requireText("Published release verification workflow", verifyWorkflow, [
	"branches: [main]",
	"workflow_call:",
	"workflow_dispatch:",
	"ref: main",
	"gh release download",
	"scripts/verify-allforone-release-assets.mjs",
	"scripts/smoke-allforone-archive.mjs",
]);
forbidText("Published release verification workflow", verifyWorkflow, ["ref: allforone"]);

const agents = read("AGENTS.md");
requireText("AGENTS.md", agents, [
	"## All-For-One release and upstream reference",
	"`main` is the official All-For-One product branch.",
	"`pi` is the native Pi reference branch.",
	"adopt/pi-<short-sha>-<topic>",
]);

const contributing = read("CONTRIBUTING.md");
requireText("CONTRIBUTING.md", contributing, [
	"`main` is the official All-For-One product branch.",
	"`pi` is the read-only native Pi reference branch.",
	"adopt/pi-<short-sha>-<topic>",
	"## Downstream ownership",
]);

const releasing = read("RELEASING.md");
requireText("RELEASING.md", releasing, [
	"GitHub Releases from the `main` branch",
	"Confirm the prepared release commit is on `main`.",
	"## Native Pi review before a release",
	"adopt/pi-<short-sha>-<topic>",
]);
forbidText("RELEASING.md", releasing, [
	"npm publish",
	"npm run publish",
	"npm run release:patch",
	"npm run release:minor",
	"npm run release:major",
]);

const upstreamReferenceWorkflow = read(".github/workflows/upstream-pi-sync.yml");
requireText("Upstream Pi reference workflow", upstreamReferenceWorkflow, [
	"name: Upstream Pi Reference",
	"branches: [main]",
	"- update-pi",
	"--main origin/pi",
	"--product origin/main",
	"refs/heads/pi",
	"adopt/pi-<short-sha>-<topic>",
]);
forbidText("Upstream Pi reference workflow", upstreamReferenceWorkflow, [
	"prepare-sync",
	"merge-sync",
	"gh pr create",
	"gh pr merge",
	"refs/heads/main",
]);

const referenceStatusWorkflow = read(".github/workflows/allforone-upstream-drift.yml");
requireText("Pi reference status workflow", referenceStatusWorkflow, [
	"name: All-For-One Pi reference status",
	"branches: [pi]",
	"ref: main",
	"origin/pi",
	"origin/main",
	"this is not a failure",
]);

console.log(
	"All-For-One publication policy is valid: main owns the product and releases, pi is a reference-only branch, upstream adoption is selective, npm publication stays blocked, and Pi-compatible package identities remain private.",
);
