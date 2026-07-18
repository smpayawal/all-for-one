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

console.log("All-For-One publication policy is valid: GitHub releases only, Pi-compatible npm packages private.");
