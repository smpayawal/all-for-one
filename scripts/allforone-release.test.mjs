import assert from "node:assert/strict";
import test from "node:test";
import {
	createAllForOneReleaseFiles,
	extractReleaseChanges,
	extractUnreleasedChanges,
	parseAllForOneReleaseTag,
	RELEASE_ASSETS,
	validateAllForOneRelease,
} from "./allforone-release.mjs";

const commit = "a".repeat(40);

test("parses the dedicated All-For-One tag namespace", () => {
	assert.equal(parseAllForOneReleaseTag("afo-v0.1.0"), "0.1.0");
	assert.equal(parseAllForOneReleaseTag("afo-v0.1.0-rc.1"), "0.1.0-rc.1");
	assert.throws(() => parseAllForOneReleaseTag("v0.1.0"), /Expected afo-v<semver>/);
	assert.throws(() => parseAllForOneReleaseTag("afo-0.1.0"), /Expected afo-v<semver>/);
});

test("requires the tag version to match the standalone product version", () => {
	const metadata = validateAllForOneRelease("afo-v0.1.0");
	assert.equal(metadata.product, "All-For-One");
	assert.equal(metadata.version, "0.1.0");
	assert.equal(metadata.prerelease, false);
	assert.equal(metadata.piBaseline, "0.80.10");
	assert.deepEqual(metadata.commands, ["allforone", "afo", "pi"]);
	assert.throws(() => validateAllForOneRelease("afo-v0.2.0"), /does not match All-For-One version/);
});

test("extracts only the unreleased All-For-One changes", () => {
	const changes = extractUnreleasedChanges("# Changelog\n\n## Unreleased\n\n- New release path.\n\n## 0.0.1\n\n- Old.\n");
	assert.equal(changes, "- New release path.");
	assert.throws(() => extractUnreleasedChanges("# Changelog\n"), /does not contain an Unreleased section/);
});

test("prefers the matching versioned changelog section", () => {
	const changelog =
		"# Changelog\n\n## Unreleased\n\n- Next.\n\n## [0.1.0-rc.1] - 2026-07-19\n\n- Candidate.\n\n## [0.0.1] - 2026-01-01\n\n- Old.\n";
	assert.equal(extractReleaseChanges(changelog, "0.1.0-rc.1"), "- Candidate.");
	assert.equal(extractReleaseChanges(changelog, "0.2.0"), "- Next.");
});

test("creates source-backed release notes and a complete manifest", () => {
	const { manifest, notes } = createAllForOneReleaseFiles({ tag: "afo-v0.1.0", commit });
	assert.equal(manifest.schemaVersion, 2);
	assert.equal(manifest.product, "All-For-One");
	assert.equal(manifest.version, "0.1.0");
	assert.equal(manifest.prerelease, false);
	assert.equal(manifest.piBaseline, "0.80.10");
	assert.equal(manifest.commit, commit);
	assert.deepEqual(manifest.assets.slice(0, RELEASE_ASSETS.length), RELEASE_ASSETS);
	assert.match(notes, /All-For-One 0\.1\.0/);
	assert.match(notes, /Pi compatibility baseline: 0\.80\.10/);
	assert.match(notes, new RegExp(`Source commit: ${commit}`));
});

test("rejects non-SHA release commits", () => {
	assert.throws(
		() => createAllForOneReleaseFiles({ tag: "afo-v0.1.0", commit: "main" }),
		/Invalid release commit/,
	);
});
