import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChangesTool, parseGitStatus } from "../src/core/tools/changes.ts";

type ChangesOutput = {
	repository: boolean;
	files: Array<{
		path: string;
		previousPath?: string;
		status: string;
		staged: boolean;
		unstaged: boolean;
	}>;
	diff?: string;
	truncated?: boolean;
	filesTruncated?: boolean;
};

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf-8" });
}

function outputOf(result: { content: Array<{ type: string; text?: string }> }): ChangesOutput {
	const text = result.content.find((part) => part.type === "text")?.text;
	if (!text) throw new Error("changes returned no text output");
	return JSON.parse(text) as ChangesOutput;
}

describe("changes tool", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-changes-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(cwd, { recursive: true });
		git(cwd, "init", "--quiet");
		git(cwd, "config", "user.email", "tests@example.com");
		git(cwd, "config", "user.name", "Tests");
		writeFileSync(join(cwd, "modified.txt"), "before\n");
		writeFileSync(join(cwd, "deleted.txt"), "delete me\n");
		writeFileSync(join(cwd, "renamed.txt"), "rename me\n");
		git(cwd, "add", ".");
		git(cwd, "commit", "--quiet", "-m", "fixture");
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it("reports a clean Git repository", async () => {
		const result = outputOf(await createChangesTool(cwd).execute("call-clean", { view: "summary" }));
		expect(result).toEqual({ repository: true, files: [] });
	});

	it("distinguishes modified, deleted, untracked, staged, and renamed files", async () => {
		writeFileSync(join(cwd, "modified.txt"), "after\n");
		rmSync(join(cwd, "deleted.txt"));
		writeFileSync(join(cwd, "untracked.txt"), "new\n");
		writeFileSync(join(cwd, "staged.txt"), "staged\n");
		git(cwd, "add", "staged.txt");
		renameSync(join(cwd, "renamed.txt"), join(cwd, "moved.txt"));
		git(cwd, "add", "renamed.txt", "moved.txt");

		const result = outputOf(await createChangesTool(cwd).execute("call-summary", { view: "summary" }));
		expect(result.files).toEqual([
			{ path: "deleted.txt", status: "deleted", staged: false, unstaged: true },
			{ path: "modified.txt", status: "modified", staged: false, unstaged: true },
			{ path: "moved.txt", previousPath: "renamed.txt", status: "renamed", staged: true, unstaged: false },
			{ path: "staged.txt", status: "added", staged: true, unstaged: false },
			{ path: "untracked.txt", status: "untracked", staged: false, unstaged: true },
		]);
	});

	it("preserves Unicode filenames", async () => {
		const path = "café-日本語.txt";
		writeFileSync(join(cwd, path), "unicode\n");

		const result = outputOf(await createChangesTool(cwd).execute("call-unicode", { view: "summary" }));
		expect(result.files).toContainEqual({ path, status: "untracked", staged: false, unstaged: true });
	});

	it.skipIf(process.platform === "win32")("preserves filenames containing newlines", async () => {
		const path = "line\nbreak.txt";
		writeFileSync(join(cwd, path), "newline\n");

		const result = outputOf(await createChangesTool(cwd).execute("call-newline", { view: "summary" }));
		expect(result.files).toContainEqual({ path, status: "untracked", staged: false, unstaged: true });
	});

	it("parses copied status records", () => {
		const output = `2 C. N... 100644 100644 100644 ${"0".repeat(40)} ${"1".repeat(40)} C100 copied.txt\0renamed.txt\0`;
		expect(parseGitStatus(output)).toEqual([
			{ path: "copied.txt", previousPath: "renamed.txt", status: "copied", staged: true, unstaged: false },
		]);
	});

	it("reports unmerged Git states", async () => {
		const baseBranch = git(cwd, "branch", "--show-current").trim();
		git(cwd, "checkout", "--quiet", "-b", "conflict-side");
		writeFileSync(join(cwd, "modified.txt"), "side\n");
		git(cwd, "add", "modified.txt");
		git(cwd, "commit", "--quiet", "-m", "side change");
		git(cwd, "checkout", "--quiet", baseBranch);
		writeFileSync(join(cwd, "modified.txt"), "base\n");
		git(cwd, "add", "modified.txt");
		git(cwd, "commit", "--quiet", "-m", "base change");
		let mergeFailed = false;
		try {
			git(cwd, "merge", "conflict-side");
		} catch {
			mergeFailed = true;
		}
		expect(mergeFailed).toBe(true);

		const result = outputOf(await createChangesTool(cwd).execute("call-unmerged", { view: "summary" }));
		expect(result.files).toContainEqual({
			path: "modified.txt",
			status: "unmerged",
			staged: true,
			unstaged: true,
		});
	});

	it("filters summary results by staged state", async () => {
		writeFileSync(join(cwd, "modified.txt"), "after\n");
		writeFileSync(join(cwd, "staged.txt"), "staged\n");
		git(cwd, "add", "staged.txt");

		const staged = outputOf(await createChangesTool(cwd).execute("call-staged", { view: "summary", staged: true }));
		const unstaged = outputOf(
			await createChangesTool(cwd).execute("call-unstaged", { view: "summary", staged: false }),
		);
		expect(staged.files.map((file) => file.path)).toEqual(["staged.txt"]);
		expect(unstaged.files.map((file) => file.path)).toEqual(["modified.txt"]);
	});

	it("supports repository-relative path filtering", async () => {
		mkdirSync(join(cwd, "src"));
		writeFileSync(join(cwd, "src/inside.txt"), "inside\n");
		writeFileSync(join(cwd, "outside.txt"), "outside\n");

		const result = outputOf(await createChangesTool(cwd).execute("call-path", { view: "summary", path: "src" }));
		expect(result.files.map((file) => file.path)).toEqual(["src/inside.txt"]);
	});

	it("returns staged or unstaged diffs without including untracked content", async () => {
		writeFileSync(join(cwd, "modified.txt"), "unstaged\n");
		writeFileSync(join(cwd, "staged.txt"), "staged\n");
		writeFileSync(join(cwd, "untracked.txt"), "secret untracked body\n");
		git(cwd, "add", "staged.txt");

		const unstaged = outputOf(await createChangesTool(cwd).execute("call-diff", { view: "diff" }));
		const staged = outputOf(await createChangesTool(cwd).execute("call-cached", { view: "diff", staged: true }));
		expect(unstaged.diff).toContain("+unstaged");
		expect(unstaged.diff).not.toContain("staged.txt");
		expect(unstaged.diff).not.toContain("secret untracked body");
		expect(unstaged.files.map((file) => file.path)).toEqual(["modified.txt", "untracked.txt"]);
		expect(staged.diff).toContain("staged.txt");
		expect(staged.diff).toContain("+staged");
		expect(staged.files.map((file) => file.path)).toEqual(["staged.txt"]);
	});

	it("handles non-Git directories cleanly", async () => {
		const nonGit = join(tmpdir(), `pi-changes-non-git-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(nonGit, { recursive: true });
		try {
			const result = outputOf(await createChangesTool(nonGit).execute("call-non-git", { view: "summary" }));
			expect(result).toEqual({ repository: false, files: [] });
		} finally {
			rmSync(nonGit, { recursive: true, force: true });
		}
	});

	it("reports when Git is unavailable from PATH", async () => {
		const originalPath = process.env.PATH;
		process.env.PATH = join(cwd, "missing-git-bin");
		try {
			await expect(createChangesTool(cwd).execute("call-no-git", { view: "summary" })).rejects.toThrow(
				/Failed to run git/,
			);
		} finally {
			if (originalPath === undefined) delete process.env.PATH;
			else process.env.PATH = originalPath;
		}
	});

	it("ignores an incomplete record in truncated NUL-delimited status output", () => {
		const output = "? complete.txt\0? partial";
		expect(parseGitStatus(output, true)).toEqual([
			{ path: "complete.txt", status: "untracked", staged: false, unstaged: true },
		]);
	});

	it("bounds large diff output", async () => {
		writeFileSync(join(cwd, "modified.txt"), `${"changed line\n".repeat(10000)}`);
		const result = outputOf(await createChangesTool(cwd).execute("call-large", { view: "diff" }));

		expect(result.truncated).toBe(true);
		expect(Buffer.byteLength(result.diff ?? "", "utf-8")).toBeLessThanOrEqual(50 * 1024);
	});

	it("honors cancellation", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			createChangesTool(cwd).execute("call-abort", { view: "summary" }, controller.signal),
		).rejects.toThrow("Operation aborted");
	});
});
