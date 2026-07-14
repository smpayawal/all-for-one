import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApplyPatchTool } from "../src/core/tools/apply-patch.ts";

describe("apply_patch tool", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-apply-patch-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it("updates one file and returns a compact operation summary", async () => {
		writeFileSync(join(cwd, "example.txt"), "alpha\nbeta\ngamma\n");
		const result = await createApplyPatchTool(cwd).execute("call-1", {
			patch: [
				"*** Begin Patch",
				"*** Update File: example.txt",
				"@@",
				" alpha",
				"-beta",
				"+bravo",
				" gamma",
				"*** End Patch",
			].join("\n"),
		});

		expect(readFileSync(join(cwd, "example.txt"), "utf-8")).toBe("alpha\nbravo\ngamma\n");
		expect(result.details).toEqual({
			changedFiles: ["example.txt"],
			addedFiles: [],
			updatedFiles: ["example.txt"],
			deletedFiles: [],
		});
		expect(result.content).toEqual([{ type: "text", text: "Applied patch: 1 file updated." }]);
	});

	it("adds, updates, and deletes multiple files in one patch", async () => {
		writeFileSync(join(cwd, "keep.txt"), "before\n");
		writeFileSync(join(cwd, "remove.txt"), "obsolete\n");

		const result = await createApplyPatchTool(cwd).execute("call-2", {
			patch: [
				"*** Begin Patch",
				"*** Add File: nested/new.txt",
				"+created",
				"*** Update File: keep.txt",
				"@@",
				"-before",
				"+after",
				"*** Delete File: remove.txt",
				"*** End Patch",
			].join("\n"),
		});

		expect(readFileSync(join(cwd, "nested/new.txt"), "utf-8")).toBe("created\n");
		expect(readFileSync(join(cwd, "keep.txt"), "utf-8")).toBe("after\n");
		expect(existsSync(join(cwd, "remove.txt"))).toBe(false);
		expect(result.details).toEqual({
			changedFiles: ["nested/new.txt", "keep.txt", "remove.txt"],
			addedFiles: ["nested/new.txt"],
			updatedFiles: ["keep.txt"],
			deletedFiles: ["remove.txt"],
		});
	});

	it("rejects malformed patches before mutation", async () => {
		writeFileSync(join(cwd, "first.txt"), "one\n");
		const tool = createApplyPatchTool(cwd);

		await expect(
			tool.execute("call-3", {
				patch: "*** Begin Patch\n*** Update File: first.txt\n-old\n+new\n*** End Patch",
			}),
		).rejects.toThrow("Update File first.txt must contain at least one @@ hunk");
		expect(readFileSync(join(cwd, "first.txt"), "utf-8")).toBe("one\n");
	});

	it("reports a failed hunk and leaves every file unchanged", async () => {
		writeFileSync(join(cwd, "first.txt"), "one\n");
		writeFileSync(join(cwd, "second.txt"), "two\n");

		await expect(
			createApplyPatchTool(cwd).execute("call-4", {
				patch: [
					"*** Begin Patch",
					"*** Update File: first.txt",
					"@@",
					"-one",
					"+changed",
					"*** Update File: second.txt",
					"@@",
					"-missing",
					"+changed",
					"*** End Patch",
				].join("\n"),
			}),
		).rejects.toThrow("Failed to apply hunk 1 to second.txt");
		expect(readFileSync(join(cwd, "first.txt"), "utf-8")).toBe("one\n");
		expect(readFileSync(join(cwd, "second.txt"), "utf-8")).toBe("two\n");
	});

	it.each(["../outside.txt", "/tmp/outside.txt", "C:\\outside.txt", "\\\\server\\share\\file.txt"])(
		"rejects unsafe path %s",
		async (path) => {
			await expect(
				createApplyPatchTool(cwd).execute("call-5", {
					patch: `*** Begin Patch\n*** Add File: ${path}\n+unsafe\n*** End Patch`,
				}),
			).rejects.toThrow("Unsafe patch path");
		},
	);

	it("allows existing in-workspace files whose names begin with two dots", async () => {
		writeFileSync(join(cwd, "..config"), "before\n");
		await createApplyPatchTool(cwd).execute("call-dotdot-name", {
			patch: "*** Begin Patch\n*** Update File: ..config\n@@\n-before\n+after\n*** End Patch",
		});

		expect(readFileSync(join(cwd, "..config"), "utf-8")).toBe("after\n");
	});

	it("preserves a UTF-8 BOM and CRLF line endings in updated files", async () => {
		writeFileSync(join(cwd, "windows.txt"), "\uFEFFalpha\r\nbeta\r\n");
		await createApplyPatchTool(cwd).execute("call-6", {
			patch: "*** Begin Patch\n*** Update File: windows.txt\n@@\n alpha\n-beta\n+bravo\n*** End Patch",
		});

		expect(readFileSync(join(cwd, "windows.txt"), "utf-8")).toBe("\uFEFFalpha\r\nbravo\r\n");
	});

	it("rejects paths that escape through a symbolic link", async () => {
		const outside = `${cwd}-outside`;
		mkdirSync(outside, { recursive: true });
		try {
			symlinkSync(outside, join(cwd, "linked"), process.platform === "win32" ? "junction" : "dir");
			await expect(
				createApplyPatchTool(cwd).execute("call-symlink", {
					patch: "*** Begin Patch\n*** Add File: linked/escape.txt\n+unsafe\n*** End Patch",
				}),
			).rejects.toThrow("escapes the workspace through a symbolic link");
			expect(existsSync(join(outside, "escape.txt"))).toBe(false);
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});

	it("rolls back earlier files when a later commit operation fails", async () => {
		writeFileSync(join(cwd, "blocked"), "not a directory\n");
		await expect(
			createApplyPatchTool(cwd).execute("call-rollback", {
				patch: [
					"*** Begin Patch",
					"*** Add File: created.txt",
					"+created",
					"*** Add File: blocked/child.txt",
					"+cannot be written",
					"*** End Patch",
				].join("\n"),
			}),
		).rejects.toThrow("Rollback completed");
		expect(existsSync(join(cwd, "created.txt"))).toBe(false);
		expect(readFileSync(join(cwd, "blocked"), "utf-8")).toBe("not a directory\n");
	});

	it("does not mutate when cancelled before execution", async () => {
		writeFileSync(join(cwd, "cancel.txt"), "before\n");
		const controller = new AbortController();
		controller.abort();

		await expect(
			createApplyPatchTool(cwd).execute(
				"call-7",
				{ patch: "*** Begin Patch\n*** Update File: cancel.txt\n@@\n-before\n+after\n*** End Patch" },
				controller.signal,
			),
		).rejects.toThrow("Operation aborted");
		expect(readFileSync(join(cwd, "cancel.txt"), "utf-8")).toBe("before\n");
	});

	it("serializes concurrent patches that target the same file", async () => {
		writeFileSync(join(cwd, "queue.txt"), "alpha\n");
		const tool = createApplyPatchTool(cwd);

		await Promise.all([
			tool.execute("call-8a", {
				patch: "*** Begin Patch\n*** Update File: queue.txt\n@@\n-alpha\n+beta\n*** End Patch",
			}),
			tool.execute("call-8b", {
				patch: "*** Begin Patch\n*** Update File: queue.txt\n@@\n-beta\n+gamma\n*** End Patch",
			}),
		]);

		expect(readFileSync(join(cwd, "queue.txt"), "utf-8")).toBe("gamma\n");
	});
});
