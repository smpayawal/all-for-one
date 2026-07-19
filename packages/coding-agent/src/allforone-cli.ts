#!/usr/bin/env node

import {
	applyProductEnvAliases,
	formatProductVersion,
	getProductUpdateInterception,
	PRODUCT,
	rewriteProductCommandInHelp,
} from "./allforone/index.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";

process.title = PRODUCT.command;
process.env.PI_CODING_AGENT = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;

for (const diagnostic of applyProductEnvAliases()) {
	console.error(`Warning: ${diagnostic.message}`);
}

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
	console.log(formatProductVersion());
	process.exit(0);
}

const productUpdateInterception = getProductUpdateInterception(args);
if (productUpdateInterception) {
	const write = productUpdateInterception.exitCode === 0 ? console.log : console.error;
	write(productUpdateInterception.output);
	process.exit(productUpdateInterception.exitCode);
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

const { main } = await import("./main.ts");
void main(args);
