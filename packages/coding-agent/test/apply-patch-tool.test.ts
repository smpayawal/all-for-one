import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
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

	it("rejects lexical aliases for the same target before mutation", async () => {
		writeFileSync(join(cwd, "alias.txt"), "before\n");

		await expect(
			createApplyPatchTool(cwd).execute("call-alias", {
				patch: [
					"*** Begin Patch",
					"*** Update File: alias.txt",
					"@@",
					"-before",
					"+first",
					"*** Update File: ./alias.txt",
					"@@",
					"-before",
					"+second",
					"*** End Patch",
				].join("\n"),
			}),
		).rejects.toThrow("same target");
		expect(readFileSync(join(cwd, "alias.txt"), "utf-8")).toBe("before\n");
	});

	it("rejects symlink aliases for the same in-workspace target", async () => {
		const targetDirectory = join(cwd, "target");
		mkdirSync(targetDirectory);
		writeFileSync(join(targetDirectory, "shared.txt"), "before\n");
		symlinkSync(targetDirectory, join(cwd, "alias-one"), process.platform === "win32" ? "junction" : "dir");
		symlinkSync(targetDirectory, join(cwd, "alias-two"), process.platform === "win32" ? "junction" : "dir");

		await expect(
			createApplyPatchTool(cwd).execute("call-symlink-alias", {
				patch: [
					"*** Begin Patch",
					"*** Update File: alias-one/shared.txt",
					"@@",
					"-before",
					"+first",
					"*** Update File: alias-two/shared.txt",
					"@@",
					"-before",
					"+second",
					"*** End Patch",
				].join("\n"),
			}),
		).rejects.toThrow("same target");
		expect(readFileSync(join(targetDirectory, "shared.txt"), "utf-8")).toBe("before\n");
	});

	it("handles missing case aliases according to the actual filesystem", async () => {
		const probePath = join(cwd, "CaseSensitivityProbe");
		writeFileSync(probePath, "probe\n");
		const caseInsensitive = existsSync(join(cwd, "casesensitivityprobe"));
		rmSync(probePath);

		const patch = [
			"*** Begin Patch",
			"*** Add File: Example.ts",
			"+first",
			"*** Add File: example.ts",
			"+second",
			"*** End Patch",
		].join("\n");

		if (caseInsensitive) {
			await expect(createApplyPatchTool(cwd).execute("call-case-alias", { patch })).rejects.toThrow("same target");
			expect(existsSync(join(cwd, "Example.ts"))).toBe(false);
			expect(existsSync(join(cwd, "example.ts"))).toBe(false);
		} else {
			await createApplyPatchTool(cwd).execute("call-case-distinct", { patch });
			expect(readFileSync(join(cwd, "Example.ts"), "utf-8")).toBe("first\n");
			expect(readFileSync(join(cwd, "example.ts"), "utf-8")).toBe("second\n");
		}
	});

	it("preserves a UTF-8 BOM and CRLF line endings in updated files", async () => {
		writeFileSync(join(cwd, "windows.txt"), "\uFEFFalpha\r\nbeta\r\n");
		await createApplyPatchTool(cwd).execute("call-6", {
			patch: "*** Begin Patch\n*** Update File: windows.txt\n@@\n alpha\n-beta\n+bravo\n*** End Patch",
		});

		expect(readFileSync(join(cwd, "windows.txt"), "utf-8")).toBe("\uFEFFalpha\r\nbravo\r\n");
	});

	it("preserves file mode and cleans up replacement temporaries", async () => {
		if (process.platform === "win32") return;
		const scriptPath = join(cwd, "script.sh");
		writeFileSync(scriptPath, "#!/bin/sh\necho before\n");
		chmodSync(scriptPath, 0o755);

		await createApplyPatchTool(cwd).execute("call-mode", {
			patch: "*** Begin Patch\n*** Update File: script.sh\n@@\n-#!/bin/sh\n-echo before\n+#!/bin/sh\n+echo after\n*** End Patch",
		});

		expect(statSync(scriptPath).mode & 0o777).toBe(0o755);
		expect(readdirSync(cwd).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("rejects an external modification detected after preflight", async () => {
		const targetPath = join(cwd, "concurrent.txt");
		writeFileSync(targetPath, "before\n");
		let signalReads = 0;
		const signal = {
			get aborted() {
				signalReads += 1;
				if (signalReads === 5) writeFileSync(targetPath, "external change\n");
				return false;
			},
		} as AbortSignal;

		await expect(
			createApplyPatchTool(cwd).execute(
				"call-concurrent",
				{ patch: "*** Begin Patch\n*** Update File: concurrent.txt\n@@\n-before\n+after\n*** End Patch" },
				signal,
			),
		).rejects.toThrow("changed after preflight");
		expect(readFileSync(targetPath, "utf-8")).toBe("external change\n");
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

	it("restores original bytes and mode during rollback", async () => {
		if (process.platform === "win32") return;
		const scriptPath = join(cwd, "rollback.sh");
		writeFileSync(scriptPath, "#!/bin/sh\necho original\n");
		chmodSync(scriptPath, 0o755);
		writeFileSync(join(cwd, "blocked"), "not a directory\n");

		await expect(
			createApplyPatchTool(cwd).execute("call-rollback-mode", {
				patch: [
					"*** Begin Patch",
					"*** Update File: rollback.sh",
					"@@",
					"-#!/bin/sh",
					"-echo original",
					"+#!/bin/sh",
					"+echo changed",
					"*** Add File: blocked/child.txt",
					"+cannot be written",
					"*** End Patch",
				].join("\n"),
			}),
		).rejects.toThrow("Rollback completed");
		expect(readFileSync(scriptPath, "utf-8")).toBe("#!/bin/sh\necho original\n");
		expect(statSync(scriptPath).mode & 0o777).toBe(0o755);
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

	it("does not commit when cancellation arrives after preflight", async () => {
		const targetPath = join(cwd, "cancel-after-preflight.txt");
		writeFileSync(targetPath, "before\n");
		let signalReads = 0;
		const signal = {
			get aborted() {
				signalReads += 1;
				return signalReads >= 7;
			},
		} as AbortSignal;

		await expect(
			createApplyPatchTool(cwd).execute(
				"call-cancel-after-preflight",
				{
					patch: "*** Begin Patch\n*** Update File: cancel-after-preflight.txt\n@@\n-before\n+after\n*** End Patch",
				},
				signal,
			),
		).rejects.toThrow("Operation aborted");
		expect(readFileSync(targetPath, "utf-8")).toBe("before\n");
	});

	it("bounds aggregate original-file bytes retained during preflight", async () => {
		writeFileSync(join(cwd, "large.txt"), "123456789\n");

		await expect(
			createApplyPatchTool(cwd, { maxPreflightBytes: 4 }).execute("call-preflight-limit", {
				patch: "*** Begin Patch\n*** Update File: large.txt\n@@\n-123456789\n+changed\n*** End Patch",
			}),
		).rejects.toThrow("preflight exceeds the 4 byte limit");
		expect(readFileSync(join(cwd, "large.txt"), "utf-8")).toBe("123456789\n");
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
