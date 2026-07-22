import assert from "node:assert/strict";
import test from "node:test";
import {
	createAllForOneReleaseFiles,
	extractReleaseChanges,
	extractUnreleasedChanges,
	parseAllForOneReleaseTag,
	readAllForOneReleaseMetadata,
	RELEASE_ASSETS,
	validateAllForOneRelease,
} from "./allforone-release.mjs";

const commit = "a".repeat(40);
const currentMetadata = readAllForOneReleaseMetadata();
const currentTag = `afo-v${currentMetadata.version}`;
const mismatchedTag = currentMetadata.version === "9.9.9" ? "afo-v9.9.8" : "afo-v9.9.9";

test("parses the dedicated All-For-One tag namespace", () => {
	assert.equal(parseAllForOneReleaseTag("afo-v0.1.0"), "0.1.0");
	assert.equal(parseAllForOneReleaseTag("afo-v0.1.0-rc.1"), "0.1.0-rc.1");
	assert.throws(() => parseAllForOneReleaseTag("v0.1.0"), /Expected afo-v<semver>/);
	assert.throws(() => parseAllForOneReleaseTag("afo-0.1.0"), /Expected afo-v<semver>/);
	assert.throws(() => parseAllForOneReleaseTag("afo-v01.0.0"), /Expected afo-v<semver>/);
	assert.throws(() => parseAllForOneReleaseTag("afo-v1.0.0-01"), /Expected afo-v<semver>/);
});

test("requires the tag version to match the current standalone product version", () => {
	const metadata = validateAllForOneRelease(currentTag);
	assert.equal(metadata.product, "All-For-One");
	assert.equal(metadata.version, currentMetadata.version);
	assert.equal(metadata.prerelease, currentMetadata.prerelease);
	assert.equal(metadata.piBaseline, "0.81.1");
	assert.deepEqual(metadata.commands, ["allforone", "afo", "pi"]);
	assert.throws(() => validateAllForOneRelease(mismatchedTag), /does not match All-For-One version/);
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

test("creates source-backed release notes and a complete manifest for the current version", () => {
	const { manifest, notes } = createAllForOneReleaseFiles({ tag: currentTag, commit });
	assert.equal(manifest.schemaVersion, 2);
	assert.equal(manifest.product, "All-For-One");
	assert.equal(manifest.version, currentMetadata.version);
	assert.equal(manifest.prerelease, currentMetadata.prerelease);
	assert.equal(manifest.piBaseline, "0.81.1");
	assert.equal(manifest.commit, commit);
	assert.deepEqual(manifest.assets.slice(0, RELEASE_ASSETS.length), RELEASE_ASSETS);
	assert.ok(notes.includes(`All-For-One ${currentMetadata.version}`));
	assert.match(notes, /Pi compatibility baseline: 0\.81\.1/);
	assert.match(notes, new RegExp(`Source commit: ${commit}`));
});

test("rejects non-SHA release commits", () => {
	assert.throws(
		() => createAllForOneReleaseFiles({ tag: currentTag, commit: "main" }),
		/Invalid release commit/,
	);
});
