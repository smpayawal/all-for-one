#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { checkUpstreamRelationship } from "./check-upstream-relationship.mjs";

function classifyMain(mainToUpstream) {
	if (mainToUpstream.ahead === 0 && mainToUpstream.behind === 0) return "current";
	if (mainToUpstream.mainIsAncestor && mainToUpstream.ahead > 0) return "fast-forward";
	if (mainToUpstream.ahead === 0 && mainToUpstream.behind > 0) return "main-ahead";
	return "diverged";
}

function classifyProduct(mainToProduct) {
	return mainToProduct.behind > 0 ? "sync-required" : "current";
}

export function getUpstreamSyncStatus(
	cwd = process.cwd(),
	{ mainRef = "origin/main", productRef = "origin/allforone", upstreamRef = "upstream/main" } = {},
) {
	const mainToUpstream = checkUpstreamRelationship(cwd, mainRef, upstreamRef);
	const mainToProduct = checkUpstreamRelationship(cwd, mainRef, productRef);
	const mainAction = classifyMain(mainToUpstream);
	const productAction = classifyProduct(mainToProduct);

	return {
		refs: { main: mainRef, product: productRef, upstream: upstreamRef },
		main: {
			commit: mainToUpstream.mainCommit,
			upstreamCommit: mainToUpstream.currentCommit,
			mergeBase: mainToUpstream.mergeBase,
			upstreamAheadBy: mainToUpstream.ahead,
			mainAheadBy: mainToUpstream.behind,
			action: mainAction,
			safeFastForward: mainAction === "fast-forward" || mainAction === "current",
		},
		product: {
			commit: mainToProduct.currentCommit,
			mergeBase: mainToProduct.mergeBase,
			productAheadBy: mainToProduct.ahead,
			mainAheadBy: mainToProduct.behind,
			containsMain: mainToProduct.mainIsAncestor,
			action: productAction,
		},
	};
}

function parseArgs(argv) {
	const options = {
		cwd: process.cwd(),
		json: false,
		mainRef: "origin/main",
		productRef: "origin/allforone",
		upstreamRef: "upstream/main",
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--json") {
			options.json = true;
			continue;
		}
		if (argument === "--cwd" || argument === "--main" || argument === "--product" || argument === "--upstream") {
			const value = argv[++index];
			if (!value) throw new Error(`${argument} requires a value`);
			if (argument === "--cwd") options.cwd = resolve(value);
			if (argument === "--main") options.mainRef = value;
			if (argument === "--product") options.productRef = value;
			if (argument === "--upstream") options.upstreamRef = value;
			continue;
		}
		if (argument === "--help" || argument === "-h") {
			options.help = true;
			continue;
		}
		throw new Error(`unknown argument: ${argument}`);
	}
	return options;
}

function printUsage() {
	console.log(
		"Usage: node scripts/upstream-sync-status.mjs [--json] [--cwd PATH] [--main REF] [--product REF] [--upstream REF]",
	);
}

export function runCli(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	if (options.help) {
		printUsage();
		return;
	}
	const status = getUpstreamSyncStatus(options.cwd, {
		mainRef: options.mainRef,
		productRef: options.productRef,
		upstreamRef: options.upstreamRef,
	});
	if (options.json) {
		console.log(JSON.stringify(status, null, 2));
		return;
	}
	console.log(`main: ${status.main.action}`);
	console.log(`upstream ahead: ${status.main.upstreamAheadBy}`);
	console.log(`main ahead: ${status.main.mainAheadBy}`);
	console.log(`product: ${status.product.action}`);
	console.log(`main commits missing from product: ${status.product.mainAheadBy}`);
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
