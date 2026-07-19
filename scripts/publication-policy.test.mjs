import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
	ALL_FOR_ONE_WORKSPACE,
	assertPiPackagePublicationAllowed,
	normalizeRepositoryIdentity,
	UPSTREAM_PI_REPOSITORY,
	UPSTREAM_PI_WORKSPACE,
} from "./publication-policy.mjs";

test("normalizes supported GitHub repository identities", () => {
	assert.equal(normalizeRepositoryIdentity("earendil-works/pi"), UPSTREAM_PI_REPOSITORY);
	assert.equal(normalizeRepositoryIdentity("https://github.com/earendil-works/pi.git"), UPSTREAM_PI_REPOSITORY);
	assert.equal(normalizeRepositoryIdentity("git@github.com:earendil-works/pi.git"), UPSTREAM_PI_REPOSITORY);
	assert.equal(normalizeRepositoryIdentity("https://example.com/earendil-works/pi.git"), undefined);
});

test("blocks real Pi package publication from All-For-One", () => {
	assert.throws(
		() => assertPiPackagePublicationAllowed({ workspaceName: ALL_FOR_ONE_WORKSPACE, repository: "smpayawal/all-for-one" }),
		/does not publish the Pi-compatible workspace packages/,
	);
});

test("blocks publication from a fork even when the workspace name looks upstream", () => {
	assert.throws(
		() => assertPiPackagePublicationAllowed({ workspaceName: UPSTREAM_PI_WORKSPACE, repository: "smpayawal/all-for-one" }),
		/restricted to earendil-works\/pi/,
	);
});

test("allows real publication only in the upstream Pi workspace and repository", () => {
	assert.deepEqual(
		assertPiPackagePublicationAllowed({ workspaceName: UPSTREAM_PI_WORKSPACE, repository: UPSTREAM_PI_REPOSITORY }),
		{ allowed: true, mode: "publish" },
	);
});

test("allows packaging dry runs without enabling publication", () => {
	assert.deepEqual(
		assertPiPackagePublicationAllowed({
			workspaceName: ALL_FOR_ONE_WORKSPACE,
			repository: "smpayawal/all-for-one",
			dryRun: true,
		}),
		{ allowed: true, mode: "dry-run" },
	);
});

test("direct inherited publish and release entrypoints fail before mutation", () => {
	const packageBefore = readFileSync("package.json", "utf8");
	const versionBefore = JSON.parse(packageBefore).version;

	for (const [script, args] of [
		["scripts/publish.mjs", []],
		["scripts/release.mjs", ["patch"]],
	]) {
		const result = spawnSync(process.execPath, [script, ...args], {
			cwd: process.cwd(),
			encoding: "utf8",
		});
		assert.equal(result.status, 1, `${script} unexpectedly succeeded`);
		assert.match(result.stderr, /does not publish the Pi-compatible workspace packages/);
	}

	const packageAfter = readFileSync("package.json", "utf8");
	assert.equal(packageAfter, packageBefore);
	assert.equal(JSON.parse(packageAfter).version, versionBefore);
});
