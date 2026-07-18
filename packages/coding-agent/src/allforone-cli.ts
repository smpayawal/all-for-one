#!/usr/bin/env node

import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";
import { formatProductVersion, PRODUCT, rewriteProductCommandInHelp } from "./product.ts";

process.title = PRODUCT.command;
process.env.PI_CODING_AGENT = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
	console.log(formatProductVersion());
	process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
	const log = console.log.bind(console);
	console.log = (...values: unknown[]) => {
		log(...values.map((value) => (typeof value === "string" ? rewriteProductCommandInHelp(value) : value)));
	};
}

// Configure undici's global dispatcher before provider SDKs issue requests.
// Runtime settings are applied once SettingsManager has loaded global/project settings.
configureHttpDispatcher();

void main(args);
