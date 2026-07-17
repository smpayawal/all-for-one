import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "check-clean-worktree.mjs");

function runGit(cwd, args) {
	return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function createRepository() {
	const cwd = mkdtempSync(join(tmpdir(), "afo-clean-worktree-check-"));
	runGit(cwd, ["init", "--initial-branch=main"]);
	runGit(cwd, ["config", "user.email", "test@example.invalid"]);
	runGit(cwd, ["config", "user.name", "All-For-One test"]);
	writeFileSync(join(cwd, "README"), "base\n");
	runGit(cwd, ["add", "README"]);
	runGit(cwd, ["commit", "-m", "base"]);
	return cwd;
}

function writeChange(cwd, relativePath) {
	const path = join(cwd, relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, "generated\n");
}

function runCheck(cwd) {
	return spawnSync(process.execPath, [scriptPath, "--allow-build-generated"], {
		cwd,
		encoding: "utf8",
	});
}

function assertAllowed(relativePath) {
	const cwd = createRepository();
	try {
		writeChange(cwd, relativePath);
		const result = runCheck(cwd);
		assert.equal(result.status, 0, result.stderr);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function assertRejected(relativePath) {
	const cwd = createRepository();
	try {
		writeChange(cwd, relativePath);
		const result = runCheck(cwd);
		assert.equal(result.status, 1, result.stdout + result.stderr);
		assert.match(result.stderr, new RegExp(relativePath.replaceAll("/", "\\/")));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

test("allows only the generated catalogs and direct provider model catalogs", () => {
	for (const path of [
		"packages/ai/src/models.generated.ts",
		"packages/ai/src/image-models.generated.ts",
		"packages/ai/src/providers/openai.models.ts",
	]) {
		assertAllowed(path);
	}
});

test("rejects handwritten provider modules", () => {
	assertRejected("packages/ai/src/providers/anthropic.ts");
});

test("rejects nested provider files", () => {
	assertRejected("packages/ai/src/providers/nested/custom.models.ts");
});

test("rejects unexpected untracked files", () => {
	assertRejected("unexpected.txt");
});
