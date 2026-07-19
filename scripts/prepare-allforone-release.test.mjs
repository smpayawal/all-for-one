import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	archiveUnreleasedChanges,
	extractProductVersion,
	inspectPreparedRelease,
	isPrereleaseVersion,
	prepareAllForOneRelease,
	updateProductVersion,
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
		'export const PRODUCT = {\n\tname: "All-For-One",\n\tversion: "0.1.0",\n\tupstream: {\n\t\tname: "Pi",\n\t\tversion: "0.80.10",\n\t},\n} as const;\n',
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
	assert.equal(validateAllForOneVersion("0.1.0+build.7"), "0.1.0+build.7");
	assert.equal(isPrereleaseVersion("0.1.0"), false);
	assert.equal(isPrereleaseVersion("0.1.0-rc.1"), true);
	assert.equal(isPrereleaseVersion("0.1.0+build-7"), false);
	assert.throws(() => validateAllForOneVersion("release-1"), /Expected semantic versioning/);
});

test("rejects malformed semantic versions", () => {
	for (const version of ["01.0.0", "1.01.0", "1.0.01", "1.0.0-01", "1.0.0-rc..1", "1.0.0+"]) {
		assert.throws(() => validateAllForOneVersion(version), /Expected semantic versioning/, version);
	}
});

test("targets the All-For-One version without changing the nested Pi baseline", () => {
	const source = 'export const PRODUCT = {\n\tversion: "0.1.0",\n\tupstream: {\n\t\tversion: "0.80.10",\n\t},\n} as const;\n';
	assert.equal(extractProductVersion(source), "0.1.0");
	const updated = updateProductVersion(source, "0.1.0-rc.1");
	assert.match(updated, /^\tversion: "0\.1\.0-rc\.1",$/m);
	assert.match(updated, /^\t\tversion: "0\.80\.10",$/m);
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
	assert.match(product, /^\tversion: "0\.1\.0-rc\.1",$/m);
	assert.match(product, /^\t\tversion: "0\.80\.10",$/m);

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
