#!/usr/bin/env node
/**
 * CLI entry point for the refactored coding agent.
 * Uses main.ts with AgentSession and new mode modules.
 *
 * Test with: npx tsx src/cli-new.ts [args...]
 */
import { applyProductEnvAliases } from "./allforone/index.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";

process.title = "pi";
process.env.PI_CODING_AGENT = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;

for (const diagnostic of applyProductEnvAliases()) {
	console.error(`Warning: ${diagnostic.message}`);
}

// Configure undici's global dispatcher before provider SDKs issue requests.
// Runtime settings are applied once SettingsManager has loaded global/project settings.
configureHttpDispatcher();

const { main } = await import("./main.ts");
void main(process.argv.slice(2));
