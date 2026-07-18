#!/usr/bin/env node
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { PRODUCT } from "../product.ts";

process.title = PRODUCT.command;
process.emitWarning = (() => {}) as typeof process.emitWarning;

registerBunOAuthFlows();

import { restoreSandboxEnv } from "./restore-sandbox-env.ts";

restoreSandboxEnv();

await import("./register-bedrock.ts");
await import("../allforone-cli.ts");
