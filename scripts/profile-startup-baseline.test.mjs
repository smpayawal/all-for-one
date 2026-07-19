import assert from "node:assert/strict";
import test from "node:test";
import {
	DEFAULT_STARTUP_BASELINE_RUNS,
	DEFAULT_STARTUP_BASELINE_WARMUPS,
	withStartupBaselineDefaults,
} from "./profile-startup-baseline.mjs";

test("adds repeatable startup baseline defaults", () => {
	assert.deepEqual(withStartupBaselineDefaults(["--mode", "tui"]), [
		"--mode",
		"tui",
		"--runs",
		String(DEFAULT_STARTUP_BASELINE_RUNS),
		"--warmup",
		String(DEFAULT_STARTUP_BASELINE_WARMUPS),
	]);
});

test("preserves explicit run and warmup counts", () => {
	assert.deepEqual(withStartupBaselineDefaults(["--mode", "rpc", "--runs", "9", "--warmup", "3"]), [
		"--mode",
		"rpc",
		"--runs",
		"9",
		"--warmup",
		"3",
	]);
});

test("does not treat unrelated values as benchmark flags", () => {
	assert.deepEqual(withStartupBaselineDefaults(["--label", "--runs-like-label"]), [
		"--label",
		"--runs-like-label",
		"--runs",
		String(DEFAULT_STARTUP_BASELINE_RUNS),
		"--warmup",
		String(DEFAULT_STARTUP_BASELINE_WARMUPS),
	]);
});
