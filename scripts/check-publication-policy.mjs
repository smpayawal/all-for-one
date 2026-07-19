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
	"branches: [main]",
	"scripts/prepare-allforone-release.mjs",
	"--prerelease --latest=false",
	"needs: [validate, build, native-release-smoke]",
	"group: allforone-release-${{ github.event_name }}-",
	"cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
	"isPrereleaseVersion } from './scripts/allforone-version.mjs'",
	"git fetch --no-tags origin main",
	"git merge-base --is-ancestor \"${source_sha}\" origin/main",
	"verify-published-release:",
	"uses: ./.github/workflows/allforone-verify-release.yml",
]) {
	if (!releaseWorkflow.includes(required)) {
		throw new Error(`All-For-One release workflow is missing release lifecycle enforcement: ${required}`);
	}
}

const verifyWorkflow = readFileSync(join(root, ".github/workflows/allforone-verify-release.yml"), "utf8");
for (const required of [
	"branches: [main]",
	"workflow_call:",
	"workflow_dispatch:",
	"Public release smoke (${{ matrix.name }})",
	"gh release download",
	"scripts/verify-allforone-release-assets.mjs",
	"scripts/smoke-allforone-archive.mjs",
	"Checkout trusted verification tooling",
	"ref: main",
	"tooling_sha:",
	"release_commit:",
	"--commit \"${{ env.RELEASE_COMMIT }}\"",
]) {
	if (!verifyWorkflow.includes(required)) {
		throw new Error(`Published release verification workflow is missing: ${required}`);
	}
}

const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
for (const required of [
	"## All-For-One release and upstream reference",
	"`main` is the official All-For-One product branch.",
	"`pi` is the native Pi reference branch.",
	"All-For-One releases use `afo-v*` tags and GitHub Releases only.",
	"Do not merge the complete `pi` branch into `main` by default.",
	"adopt/pi-<short-sha>-<topic>",
	"## Upstream Pi release reference",
]) {
	if (!agents.includes(required)) {
		throw new Error(`AGENTS.md is missing standalone product guidance: ${required}`);
	}
}

const contributing = readFileSync(join(root, "CONTRIBUTING.md"), "utf8");
for (const required of [
	"`main` is the official All-For-One product branch.",
	"`pi` is the read-only native Pi reference branch.",
	"Do not merge the complete `pi` branch into `main` by default.",
	"adopt/pi-<short-sha>-<topic>",
	"## Downstream ownership",
	"The All-For-One product namespace is not a general destination for downstream code.",
	"Do not move a feature solely to make it look more All-For-One-specific.",
	"GitHub Releases from `main`",
]) {
	if (!contributing.includes(required)) {
		throw new Error(`CONTRIBUTING.md is missing standalone branch or ownership guidance: ${required}`);
	}
}

const releasing = readFileSync(join(root, "RELEASING.md"), "utf8");
for (const required of [
	"All-For-One releases are published through GitHub Releases from the `main` branch.",
	"Confirm the prepared release commit is on `main`.",
	"npm run release:afo:prepare -- 0.1.0-rc.1",
	"explicitly prevents them from becoming the latest stable release",
	"Verify Published All-For-One Release",
	"Temporary pull-request workflows must not create tags or publish releases.",
	"--commit <tag-commit-sha>",
	"## Native Pi review before a release",
	"Do not merge the complete `pi` branch into `main` as a routine release step.",
	"adopt/pi-<short-sha>-<topic>",
]) {
	if (!releasing.includes(required)) {
		throw new Error(`RELEASING.md is missing required standalone product policy: ${required}`);
	}
}
for (const forbidden of ["npm publish", "npm run publish", "npm run release:patch", "npm run release:minor", "npm run release:major"]) {
	if (releasing.includes(forbidden)) {
		throw new Error(`RELEASING.md contains a prohibited downstream release command: ${forbidden}`);
	}
}

const upstreamReferenceWorkflow = readFileSync(join(root, ".github/workflows/upstream-pi-sync.yml"), "utf8");
for (const required of [
	"name: Upstream Pi Reference",
	"branches: [main]",
	"- update-pi",
	"--main origin/pi",
	"--product origin/main",
	"git push origin upstream/main:refs/heads/pi",
	"Updating `pi` does not merge upstream Pi into `main`.",
	"adopt/pi-<short-sha>-<topic>",
]) {
	if (!upstreamReferenceWorkflow.includes(required)) {
		throw new Error(`Upstream Pi reference workflow is missing selective-adoption enforcement: ${required}`);
	}
}
for (const forbidden of ["- prepare-sync", "- merge-sync", "gh pr create", "gh pr merge", "refs/heads/main"]) {
	if (upstreamReferenceWorkflow.includes(forbidden)) {
		throw new Error(`Upstream Pi reference workflow retains prohibited full-sync behavior: ${forbidden}`);
	}
}

const referenceStatusWorkflow = readFileSync(join(root, ".github/workflows/allforone-upstream-drift.yml"), "utf8");
for (const required of [
	"name: All-For-One Pi reference status",
	"branches: [pi]",
	"ref: main",
	"pi:refs/remotes/origin/pi main:refs/remotes/origin/main",
	"Review selectively; this is not a failure.",
]) {
	if (!referenceStatusWorkflow.includes(required)) {
		throw new Error(`Pi reference status workflow is missing informational divergence handling: ${required}`);
	}
}

console.log(
	"All-For-One publication policy is valid: main-owned product releases, a fast-forward-only Pi reference, selective upstream adoption, tag-bound public asset verification, GitHub Releases only, and Pi-compatible npm packages kept private.",
);
