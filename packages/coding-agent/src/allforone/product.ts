export const PRODUCT = {
	name: "All-For-One",
	command: "allforone",
	aliases: ["afo", "pi"],
	version: "0.1.0-rc.2",
	repository: "https://github.com/smpayawal/all-for-one",
	upstream: {
		name: "Pi",
		version: "0.81.1",
		repository: "https://github.com/earendil-works/pi",
	},
} as const;

/** Format the standalone product version while retaining the Pi compatibility baseline. */
export function formatProductVersion(): string {
	return `${PRODUCT.name} ${PRODUCT.version} (${PRODUCT.upstream.name} base ${PRODUCT.upstream.version})`;
}

/** Rewrite only command-prefixed help lines; Pi compatibility identifiers remain unchanged. */
export function rewriteProductCommandInHelp(value: string): string {
	return value.replace(/(^|\n)(\s{2})pi(?=\s|$)/g, `$1$2${PRODUCT.command}`);
}
