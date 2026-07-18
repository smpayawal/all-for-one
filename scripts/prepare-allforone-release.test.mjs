import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	archiveUnreleasedChanges,
	inspectPreparedRelease,
	isPrereleaseVersion,
	prepareAllForOneRelease,
	validateAllForOneVersion,
} from "./prepare-allforone-release.mjs";

function createFixture(t) {
	const root = mkdtempSync(join(tmpdir(), "allforone-release-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, "packages/coding-agent/src/allforone"), { recursive: true });
	writeFileSync(join(root, "package.json"), '{\n\t"name": "all-for-one-monorepo",\n\t"version": "0.1.0"\n}\n');
	writeFileSync(
		join(root, "package-lock.json"),
		'{\n\t"name": "all-for-one-monorepo",\n\t"version": "0.1.0",\n\t"lockfileVersion": 3,\n\t"packages": {\n\t\t"": {\n\t\t\t"name": "all-for-one-monorepo",\n\t\t\t"version": "0.1.0"\n\t\t}\n\t}\n}\n',
	);
	writeFileSync(
		join(root, "packages/coding-agent/src/allforone/product.ts"),
		'export const PRODUCT = {\n\tname: "All-For-One",\n\tversion: "0.1.0",\n} as const;\n',
	);
	writeFileSync(
		join(root, "CHANGELOG-AFO.md"),
		"# All-For-One changelog\n\n## Unreleased\n\n### Added\n\n- Added release preparation.\n",
	);
	return root;
}

test("validates stable and prerelease versions", () => {
	assert.equal(validateAllForOneVersion("0.1.0"), "0.1.0");
	assert.equal(validateAllForOneVersion("0.1.0-rc.1"), "0.1.0-rc.1");
	assert.equal(isPrereleaseVersion("0.1.0"), false);
	assert.equal(isPrereleaseVersion("0.1.0-rc.1"), true);
	assert.throws(() => validateAllForOneVersion("release-1"), /Expected semantic versioning/);
});

test("archives unreleased changes into a dated version section", () => {
	const changelog = "# Changelog\n\n## Unreleased\n\n### Added\n\n- New.\n\n## [0.0.1] - 2026-01-01\n\n- Old.\n";
	const result = archiveUnreleasedChanges(changelog, "0.1.0-rc.1", "2026-07-19");
	assert.match(result, /## Unreleased\n\n## \[0\.1\.0-rc\.1\] - 2026-07-19/);
	assert.match(result, /### Added\n\n- New\./);
	assert.match(result, /## \[0\.0\.1\] - 2026-01-01/);
});

test("prepares and verifies a prerelease without changing Pi package versions", (t) => {
	const root = createFixture(t);
	const result = prepareAllForOneRelease({ repoRoot: root, version: "0.1.0-rc.1", date: "2026-07-19" });
	assert.equal(result.prerelease, true);

	const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	const lockfile = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
	const product = readFileSync(join(root, "packages/coding-agent/src/allforone/product.ts"), "utf8");
	assert.equal(packageJson.version, "0.1.0-rc.1");
	assert.equal(lockfile.version, "0.1.0-rc.1");
	assert.equal(lockfile.packages[""].version, "0.1.0-rc.1");
	assert.match(product, /version: "0\.1\.0-rc\.1"/);

	const inspected = inspectPreparedRelease(root, "0.1.0-rc.1");
	assert.equal(inspected.prerelease, true);
	assert.match(inspected.changes, /Added release preparation/);
});

test("dry-run validation does not modify release files", (t) => {
	const root = createFixture(t);
	const before = readFileSync(join(root, "package.json"), "utf8");
	const result = prepareAllForOneRelease({
		repoRoot: root,
		version: "0.1.0-rc.1",
		date: "2026-07-19",
		dryRun: true,
	});
	assert.equal(result.dryRun, true);
	assert.equal(readFileSync(join(root, "package.json"), "utf8"), before);
});
