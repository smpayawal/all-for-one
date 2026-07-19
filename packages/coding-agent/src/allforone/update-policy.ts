import { PRODUCT } from "./product.ts";

export interface ProductUpdateInterception {
	exitCode: 0 | 1;
	output: string;
}

function formatProductUpdateHelp(): string {
	return `Usage:
  ${PRODUCT.command} update [source|self|pi] [--self|--extensions|--models|--all] [--extension <source>] [--approve|--no-approve] [--force]

Update All-For-One, installed packages, or model catalogs.

Options:
  --self                  Update All-For-One only
  --extensions            Update installed packages only
  --models                Refresh model catalogs only
  --all                   Update All-For-One and installed packages
  --extension <source>    Update one package only
  -a, --approve           Trust project-local files for this command
  -na, --no-approve       Ignore project-local files for this command
  --force                 Reinstall All-For-One even if the current version is latest

Short forms:
  ${PRODUCT.command} update                Update All-For-One only
  ${PRODUCT.command} update --extensions   Update all installed packages
  ${PRODUCT.command} update --models       Refresh model catalogs only
  ${PRODUCT.command} update <source>       Update one package
  ${PRODUCT.command} update self           Update All-For-One only

Automatic All-For-One self-update is not available yet.
Download the latest release from ${PRODUCT.repository}/releases/latest.
`;
}

function formatProductSelfUpdateUnavailable(): string {
	return [
		`${PRODUCT.name} cannot self-update this installation yet.`,
		`Download the latest release from: ${PRODUCT.repository}/releases/latest`,
		`Installed packages can still be updated with \`${PRODUCT.command} update --extensions\`.`,
	].join("\n");
}

function hasProductSelfUpdateTarget(args: readonly string[]): boolean {
	const updateArgs = args.slice(1);
	if (updateArgs.includes("--self") || updateArgs.includes("--all")) {
		return true;
	}

	const positionalArguments: string[] = [];
	for (let index = 0; index < updateArgs.length; index++) {
		const argument = updateArgs[index];
		if (argument === "--extension") {
			index++;
			continue;
		}
		if (!argument.startsWith("-")) {
			positionalArguments.push(argument);
		}
	}

	const positionalTarget = positionalArguments[0];
	if (positionalTarget === "self" || positionalTarget === "pi") {
		return true;
	}

	const hasExplicitNonSelfTarget =
		updateArgs.includes("--extensions") ||
		updateArgs.includes("--models") ||
		updateArgs.includes("--extension") ||
		positionalTarget !== undefined;

	return !hasExplicitNonSelfTarget;
}

/**
 * Keep product entrypoints away from Pi's package/version update channel.
 * The Pi compatibility entrypoint continues using the inherited updater.
 */
export function getProductUpdateInterception(args: readonly string[]): ProductUpdateInterception | undefined {
	if (args[0] !== "update") {
		return undefined;
	}

	const updateArgs = args.slice(1);
	if (updateArgs.includes("--help") || updateArgs.includes("-h")) {
		return { exitCode: 0, output: formatProductUpdateHelp() };
	}

	if (hasProductSelfUpdateTarget(args)) {
		return { exitCode: 1, output: formatProductSelfUpdateUnavailable() };
	}

	return undefined;
}
