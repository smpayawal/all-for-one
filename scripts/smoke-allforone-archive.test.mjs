import assert from "node:assert/strict";
import test from "node:test";
import { readAllForOneReleaseMetadata } from "./allforone-release.mjs";
import { expectedVersionFromMetadata, launcherNames } from "./smoke-allforone-archive.mjs";

test("selects platform-native release launchers", () => {
	assert.deepEqual(launcherNames("linux"), ["allforone", "afo", "pi"]);
	assert.deepEqual(launcherNames("darwin"), ["allforone", "afo", "pi"]);
	assert.deepEqual(launcherNames("win32"), ["allforone.exe", "afo.cmd", "pi.cmd"]);
});

test("derives the expected product version from current release metadata", () => {
	const metadata = readAllForOneReleaseMetadata();
	assert.equal(
		expectedVersionFromMetadata(),
		`${metadata.product} ${metadata.version} (Pi base ${metadata.piBaseline})`,
	);
});
