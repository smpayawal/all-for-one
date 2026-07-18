import type { InlineExtension } from "../core/extensions/types.ts";
import llamaExtension from "./llama/index.ts";
import repoMapExtension from "./repo-map/bounded.ts";
import validationExtension from "./validate/index.ts";

export const builtInExtensions: InlineExtension[] = [
	{ name: "llama.cpp", factory: llamaExtension, hidden: true },
	{ name: "repo-map", factory: repoMapExtension, hidden: true },
	{ name: "validate", factory: validationExtension, hidden: true },
];
