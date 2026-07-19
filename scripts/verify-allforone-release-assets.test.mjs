import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RELEASE_ASSETS } from "./allforone-release.mjs";
import { verifyReleaseDirectory } from "./verify-allforone-release-assets.mjs";

const tag = "afo-v0.1.0-rc.1";
const version = "0.1.0-rc.1";

function sha256(content) {
	return createHash("sha256").update(content).digest("hex");
}

function createReleaseFixture(t) {
	const directory = mkdtempSync(join(tmpdir(), "allforone-public-release-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	mkdirSync(directory, { recursive: true });

	const files = new Map();
	for (const asset of RELEASE_ASSETS) files.set(asset, `archive:${asset}\n`);
	files.set("RELEASE_NOTES.md", `# All-For-One ${version}\n`);
	files.set(
		"release-manifest.json",
		`${JSON.stringify(
			{
				schemaVersion: 2,
				product: "All-For-One",
				version,
				prerelease: true,
				tag,
				piBaseline: "0.80.10",
				commit: "a".repeat(40),
				generatedAt: "2026-07-19T00:00:00.000Z",
				commands: ["allforone", "afo", "pi"],
				repository: "https://github.com/smpayawal/all-for-one",
				assets: [...RELEASE_ASSETS, "release-manifest.json", "SHA256SUMS", "RELEASE_NOTES.md"],
			},
			null,
			2,
		)}\n`,
	);

	for (const [name, content] of files) writeFileSync(join(directory, name), content);
	const checksums = [...files.entries()].map(([name, content]) => `${sha256(content)}  ${name}`).join("\n");
	writeFileSync(join(directory, "SHA256SUMS"), `${checksums}\n`);
	return directory;
}

test("verifies the complete published release payload", (t) => {
	const directory = createReleaseFixture(t);
	const result = verifyReleaseDirectory({ directory, tag });
	assert.equal(result.tag, tag);
	assert.equal(result.version, version);
	assert.equal(result.verifiedFiles, RELEASE_ASSETS.length + 2);
});

test("rejects a tampered published asset", (t) => {
	const directory = createReleaseFixture(t);
	writeFileSync(join(directory, RELEASE_ASSETS[0]), "tampered\n");
	assert.throws(() => verifyReleaseDirectory({ directory, tag }), /Checksum mismatch/);
});

test("rejects release metadata for a different tag", (t) => {
	const directory = createReleaseFixture(t);
	assert.throws(() => verifyReleaseDirectory({ directory, tag: "afo-v0.1.0-rc.2" }), /manifest tag/);
});
