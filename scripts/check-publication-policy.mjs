#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ALL_FOR_ONE_WORKSPACE } from "./publication-policy.mjs";

const root = resolve(process.cwd());
const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
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
	const packageJson = JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8"));
	if (packageJson.name !== expectedName) {
		throw new Error(`${directory} changed its Pi-compatible package name to ${packageJson.name ?? "<missing>"}.`);
	}
	if (packageJson.private !== true) {
		throw new Error(`${directory} must remain private in All-For-One to prevent npm publication.`);
	}
}

const guardedScripts = ["publish", "release:patch", "release:minor", "release:major", "release:fix-links"];
for (const scriptName of guardedScripts) {
	const command = rootPackage.scripts?.[scriptName];
	if (typeof command !== "string" || !command.startsWith("node scripts/publication-policy.mjs assert-pi-publish &&")) {
		throw new Error(`Root script ${scriptName} is missing the fail-closed Pi publication guard.`);
	}
}

const releaseWorkflow = readFileSync(join(root, ".github/workflows/allforone-release.yml"), "utf8");
for (const forbidden of ["npm publish", "NPM_TOKEN", "scripts/publish.mjs", "scripts/release.mjs"]) {
	if (releaseWorkflow.includes(forbidden)) {
		throw new Error(`All-For-One release workflow contains forbidden npm publication path: ${forbidden}.`);
	}
}

const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
for (const required of [
	"## All-For-One release and synchronization",
	"All-For-One releases use `afo-v*` tags and GitHub Releases only.",
	"Pull requests from `sync/pi-*` must be merged with a merge commit.",
	"## Upstream Pi release reference",
]) {
	if (!agents.includes(required)) {
		throw new Error(`AGENTS.md is missing downstream release guidance: ${required}`);
	}
}

const contributing = readFileSync(join(root, "CONTRIBUTING.md"), "utf8");
if (!contributing.includes("Do not squash or rebase them because `main` must remain an ancestor of `allforone`.")) {
	throw new Error("CONTRIBUTING.md must document merge-commit-only handling for sync/pi-* pull requests.");
}

const releasing = readFileSync(join(root, "RELEASING.md"), "utf8");
for (const required of ["All-For-One releases are published through GitHub Releases", "A `sync/pi-*` pull request must be merged with a merge commit."]) {
	if (!releasing.includes(required)) {
		throw new Error(`RELEASING.md is missing required downstream policy: ${required}`);
	}
}
for (const forbidden of ["npm publish", "npm run publish", "npm run release:patch", "npm run release:minor", "npm run release:major"]) {
	if (releasing.includes(forbidden)) {
		throw new Error(`RELEASING.md contains a prohibited downstream release command: ${forbidden}`);
	}
}

const syncWorkflow = readFileSync(join(root, ".github/workflows/upstream-pi-sync.yml"), "utf8");
for (const required of [
	"Required merge method: create a merge commit",
	"**Do not squash or rebase this pull request.**",
]) {
	if (!syncWorkflow.includes(required)) {
		throw new Error(`Upstream synchronization workflow is missing merge guidance: ${required}`);
	}
}

console.log("All-For-One publication policy is valid: GitHub releases only, Pi-compatible npm packages private, downstream release guidance enforced.");
