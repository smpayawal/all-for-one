import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkUpstreamRelationship } from "./check-upstream-relationship.mjs";

function runGit(cwd, args) {
	return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function createRepository() {
	const cwd = mkdtempSync(join(tmpdir(), "afo-upstream-check-"));
	runGit(cwd, ["init", "--initial-branch=main"]);
	runGit(cwd, ["config", "user.email", "test@example.invalid"]);
	runGit(cwd, ["config", "user.name", "All-For-One test"]);
	writeFileSync(join(cwd, "README"), "base\n");
	runGit(cwd, ["add", "README"]);
	runGit(cwd, ["commit", "-m", "base"]);
	return cwd;
}

test("reports a main ancestor relationship", () => {
	const cwd = createRepository();
	try {
		runGit(cwd, ["switch", "-c", "allforone"]);
		writeFileSync(join(cwd, "README"), "change\n");
		runGit(cwd, ["commit", "-am", "change"]);
		const report = checkUpstreamRelationship(cwd, "main", "allforone");
		assert.equal(report.mainIsAncestor, true);
		assert.equal(report.ahead, 1);
		assert.equal(report.behind, 0);
		assert.equal(report.mergeBase, report.mainCommit);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("fails for a missing main ref", () => {
	const cwd = createRepository();
	try {
		assert.throws(() => checkUpstreamRelationship(cwd, "missing-main", "HEAD"), /missing Git ref: missing-main/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("reports a divergent head as not an ancestor", () => {
	const cwd = createRepository();
	try {
		runGit(cwd, ["switch", "-c", "allforone"]);
		writeFileSync(join(cwd, "README"), "allforone\n");
		runGit(cwd, ["commit", "-am", "allforone"]);
		runGit(cwd, ["switch", "main"]);
		writeFileSync(join(cwd, "README"), "main\n");
		runGit(cwd, ["commit", "-am", "main"]);
		const report = checkUpstreamRelationship(cwd, "main", "allforone");
		assert.equal(report.mainIsAncestor, false);
		assert.equal(report.ahead, 1);
		assert.equal(report.behind, 1);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
