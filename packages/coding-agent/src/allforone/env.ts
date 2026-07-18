export const PRODUCT_ENV_ALIASES = [
	["AFO_CODING_AGENT_DIR", "PI_CODING_AGENT_DIR"],
	["AFO_CODING_AGENT_SESSION_DIR", "PI_CODING_AGENT_SESSION_DIR"],
	["AFO_PACKAGE_DIR", "PI_PACKAGE_DIR"],
	["AFO_OFFLINE", "PI_OFFLINE"],
	["AFO_TELEMETRY", "PI_TELEMETRY"],
	["AFO_SHARE_VIEWER_URL", "PI_SHARE_VIEWER_URL"],
] as const;

export interface ProductEnvAliasDiagnostic {
	type: "warning";
	message: string;
}

/**
 * Normalize All-For-One environment aliases into Pi-compatible runtime variables.
 *
 * All-For-One variables take precedence when both names are defined. The runtime
 * continues reading the existing Pi variables, keeping one compatibility path.
 */
export function applyProductEnvAliases(
	env: Record<string, string | undefined> = process.env,
): ProductEnvAliasDiagnostic[] {
	const diagnostics: ProductEnvAliasDiagnostic[] = [];

	for (const [productName, compatibilityName] of PRODUCT_ENV_ALIASES) {
		const productValue = env[productName];
		if (productValue === undefined) continue;

		const compatibilityValue = env[compatibilityName];
		if (compatibilityValue !== undefined && compatibilityValue !== productValue) {
			diagnostics.push({
				type: "warning",
				message: `Both ${productName} and ${compatibilityName} are set with different values; using ${productName}.`,
			});
		}

		env[compatibilityName] = productValue;
	}

	return diagnostics;
}
