import assert from "node:assert/strict";
import test from "node:test";
import { expectedVersionFromMetadata, launcherNames } from "./smoke-allforone-archive.mjs";

test("selects platform-native release launchers", () => {
	assert.deepEqual(launcherNames("linux"), ["allforone", "afo", "pi"]);
	assert.deepEqual(launcherNames("darwin"), ["allforone", "afo", "pi"]);
	assert.deepEqual(launcherNames("win32"), ["allforone.exe", "afo.cmd", "pi.cmd"]);
});

test("derives the expected product version from release metadata", () => {
	assert.equal(expectedVersionFromMetadata(), "All-For-One 0.1.0 (Pi base 0.80.10)");
});
