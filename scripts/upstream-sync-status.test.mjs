import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getUpstreamSyncStatus } from "./upstream-sync-status.mjs";

function git(cwd, args) {
	return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commit(cwd, content, message) {
	writeFileSync(join(cwd, "state.txt"), `${content}\n`);
	git(cwd, ["add", "state.txt"]);
	git(cwd, ["commit", "-m", message]);
}

function createRepository() {
	const cwd = mkdtempSync(join(tmpdir(), "afo-upstream-sync-"));
	git(cwd, ["init", "--initial-branch=main"]);
	git(cwd, ["config", "user.email", "test@example.invalid"]);
	git(cwd, ["config", "user.name", "All-For-One test"]);
	commit(cwd, "base", "base");
	git(cwd, ["branch", "upstream-main"]);
	git(cwd, ["branch", "allforone"]);
	return cwd;
}

function status(cwd) {
	return getUpstreamSyncStatus(cwd, {
		mainRef: "main",
		productRef: "allforone",
		upstreamRef: "upstream-main",
	});
}

test("reports current refs when main, upstream, and product share the baseline", () => {
	const cwd = createRepository();
	try {
		const report = status(cwd);
		assert.equal(report.main.action, "current");
		assert.equal(report.main.safeFastForward, true);
		assert.equal(report.product.action, "current");
		assert.equal(report.product.containsMain, true);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("reports a safe main fast-forward when upstream advances", () => {
	const cwd = createRepository();
	try {
		git(cwd, ["switch", "upstream-main"]);
		commit(cwd, "upstream", "upstream change");
		const report = status(cwd);
		assert.equal(report.main.action, "fast-forward");
		assert.equal(report.main.upstreamAheadBy, 1);
		assert.equal(report.main.mainAheadBy, 0);
		assert.equal(report.main.safeFastForward, true);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("blocks a main branch that contains commits absent from upstream", () => {
	const cwd = createRepository();
	try {
		git(cwd, ["switch", "main"]);
		commit(cwd, "main-only", "main-only change");
		const report = status(cwd);
		assert.equal(report.main.action, "main-ahead");
		assert.equal(report.main.mainAheadBy, 1);
		assert.equal(report.main.safeFastForward, false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("reports when allforone needs the updated main baseline", () => {
	const cwd = createRepository();
	try {
		git(cwd, ["switch", "main"]);
		commit(cwd, "new-main", "new main baseline");
		const report = status(cwd);
		assert.equal(report.product.action, "sync-required");
		assert.equal(report.product.mainAheadBy, 1);
		assert.equal(report.product.containsMain, false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("reports divergent main and upstream histories", () => {
	const cwd = createRepository();
	try {
		git(cwd, ["switch", "main"]);
		commit(cwd, "main", "main change");
		git(cwd, ["switch", "upstream-main"]);
		commit(cwd, "upstream", "upstream change");
		const report = status(cwd);
		assert.equal(report.main.action, "diverged");
		assert.equal(report.main.upstreamAheadBy, 1);
		assert.equal(report.main.mainAheadBy, 1);
		assert.equal(report.main.safeFastForward, false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
