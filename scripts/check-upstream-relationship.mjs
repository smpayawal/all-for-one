import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

function git(cwd, args) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function resolveCommit(cwd, ref) {
	try {
		return git(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]);
	} catch {
		throw new Error(`missing Git ref: ${ref}`);
	}
}

export function checkUpstreamRelationship(cwd = process.cwd(), mainRef = "main", currentRef = "HEAD") {
	const mainCommit = resolveCommit(cwd, mainRef);
	const currentCommit = resolveCommit(cwd, currentRef);
	const mergeBase = git(cwd, ["merge-base", mainRef, currentRef]);
	const counts = git(cwd, ["rev-list", "--left-right", "--count", `${mainRef}...${currentRef}`])
		.split(/\s+/)
		.map((value) => Number.parseInt(value, 10));
	if (counts.length !== 2 || counts.some((value) => !Number.isInteger(value) || value < 0)) {
		throw new Error("Git returned invalid ahead/behind counts");
	}

	let mainIsAncestor = true;
	try {
		git(cwd, ["merge-base", "--is-ancestor", mainRef, currentRef]);
	} catch {
		mainIsAncestor = false;
	}

	return {
		currentCommit,
		mainCommit,
		mergeBase,
		mainIsAncestor,
		ahead: counts[1],
		behind: counts[0],
	};
}

function parseArgs(argv) {
	const result = { cwd: process.cwd(), mainRef: "main", currentRef: "HEAD", json: false };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--json") {
			result.json = true;
		} else if (argument === "--cwd" || argument === "--main" || argument === "--current") {
			const value = argv[index + 1];
			if (!value) throw new Error(`${argument} requires a value`);
			index += 1;
			if (argument === "--cwd") result.cwd = resolve(value);
			if (argument === "--main") result.mainRef = value;
			if (argument === "--current") result.currentRef = value;
		} else if (argument === "--help" || argument === "-h") {
			console.log("Usage: node scripts/check-upstream-relationship.mjs [--json] [--cwd PATH] [--main REF] [--current REF]");
			process.exit(0);
		} else {
			throw new Error(`unknown argument: ${argument}`);
		}
	}
	return result;
}

export function runCli(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	const report = checkUpstreamRelationship(options.cwd, options.mainRef, options.currentRef);
	if (options.json) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		for (const [key, value] of Object.entries(report)) console.log(`${key}: ${value}`);
	}
	if (!report.mainIsAncestor) {
		throw new Error(`${options.mainRef} is not an ancestor of ${options.currentRef}`);
	}
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
	try {
		runCli();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
