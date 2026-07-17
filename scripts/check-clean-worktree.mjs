import { execFileSync } from "node:child_process";

const status = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
	encoding: "utf8",
});

const changedPaths = status
	.split("\n")
	.filter((line) => line.length > 0)
	.map((line) => line.slice(3));
const allowBuildGenerated = process.argv.includes("--allow-build-generated");
const isGeneratedBuildPath = (path) =>
	path === "packages/ai/src/models.generated.ts" ||
	path === "packages/ai/src/image-models.generated.ts" ||
	path.startsWith("packages/ai/src/providers/");
const unexpectedPaths = allowBuildGenerated ? changedPaths.filter((path) => !isGeneratedBuildPath(path)) : changedPaths;

if (unexpectedPaths.length > 0) {
	process.stderr.write(
		`${allowBuildGenerated ? "Unexpected worktree changes:" : "Worktree is not clean:"}\n${unexpectedPaths.join("\n")}\n`,
	);
	process.exitCode = 1;
} else if (allowBuildGenerated && changedPaths.length > 0) {
	process.stdout.write(`Only expected generated build paths changed:\n${changedPaths.join("\n")}\n`);
}
