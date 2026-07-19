/** All-For-One-owned product identity, presentation, and compatibility helpers. */
export {
	applyProductEnvAliases,
	PRODUCT_ENV_ALIASES,
	type ProductEnvAliasDiagnostic,
} from "./env.ts";
export { formatProductVersion, PRODUCT, rewriteProductCommandInHelp } from "./product.ts";
export { getProductUpdateInterception, type ProductUpdateInterception } from "./update-policy.ts";
