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

if (rootPackage.scripts?.["release:afo:prepare"] !== "node scripts/prepare-allforone-release.mjs") {
	throw new Error("All-For-One release preparation must use scripts/prepare-allforone-release.mjs.");
}

const prepareReleaseScript = readFileSync(join(root, "scripts/prepare-allforone-release.mjs"), "utf8");
const releaseScript = readFileSync(join(root, "scripts/allforone-release.mjs"), "utf8");
for (const [name, source] of [
	["release preparation", prepareReleaseScript],
	["release metadata", releaseScript],
]) {
	if (!source.includes('from "./allforone-version.mjs"')) {
		throw new Error(`All-For-One ${name} must use the shared strict version parser.`);
	}
}

const releaseWorkflow = readFileSync(join(root, ".github/workflows/allforone-release.yml"), "utf8");
for (const forbidden of ["npm publish", "NPM_TOKEN", "scripts/publish.mjs", "scripts/release.mjs"]) {
	if (releaseWorkflow.includes(forbidden)) {
		throw new Error(`All-For-One release workflow contains forbidden npm publication path: ${forbidden}.`);
	}
}
for (const required of [
	"scripts/prepare-allforone-release.mjs",
	"--prerelease --latest=false",
	"needs: [validate, build, native-release-smoke]",
	"group: allforone-release-${{ github.event_name }}-",
	"cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
]) {
	if (!releaseWorkflow.includes(required)) {
		throw new Error(`All-For-One release workflow is missing release lifecycle enforcement: ${required}`);
	}
}

const verifyWorkflow = readFileSync(join(root, ".github/workflows/allforone-verify-release.yml"), "utf8");
for (const required of [
	"workflow_call:",
	"workflow_dispatch:",
	"Public release smoke (${{ matrix.name }})",
	"gh release download",
	"scripts/verify-allforone-release-assets.mjs",
	"scripts/smoke-allforone-archive.mjs",
	"Checkout trusted verification tooling",
]) {
	if (!verifyWorkflow.includes(required)) {
		throw new Error(`Published release verification workflow is missing: ${required}`);
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
for (const required of [
	"Do not squash or rebase them because `main` must remain an ancestor of `allforone`.",
	"merge-sync",
	"## Downstream ownership",
	"The All-For-One product namespace is not a general destination for downstream code.",
	"Do not move a feature solely to make it look more All-For-One-specific.",
]) {
	if (!contributing.includes(required)) {
		throw new Error(`CONTRIBUTING.md is missing synchronization or ownership guidance: ${required}`);
	}
}

const releasing = readFileSync(join(root, "RELEASING.md"), "utf8");
for (const required of [
	"All-For-One releases are published through GitHub Releases",
	"A `sync/pi-*` pull request must be merged with a merge commit.",
	"npm run release:afo:prepare -- 0.1.0-rc.1",
	"explicitly prevents them from becoming the latest stable release",
	"Verify Published All-For-One Release",
	"Temporary pull-request workflows must not create tags or publish releases.",
	"merge-sync",
]) {
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
	"- merge-sync",
	"gh pr checks \"${PR_NUMBER}\" --watch --fail-fast",
	"gh pr merge \"${PR_NUMBER}\" --merge --match-head-commit \"${SYNC_SHA}\"",
]) {
	if (!syncWorkflow.includes(required)) {
		throw new Error(`Upstream synchronization workflow is missing controlled merge enforcement: ${required}`);
	}
}

console.log(
	"All-For-One publication policy is valid: strict release versions, public asset verification, controlled sync merges, cancellable PR validation, GitHub releases only, and Pi-compatible npm packages private.",
);
