import { accessSync, constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { normalizePath, resolvePath } from "../../utils/paths.ts";

const NARROW_NO_BREAK_SPACE = "\u202F";

export interface CanonicalPathInfo {
	path: string;
	caseInsensitive: boolean;
}

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error.code === "ENOENT" || error.code === "ENOTDIR")
	);
}

function toggleCase(name: string): string | undefined {
	for (let index = 0; index < name.length; index++) {
		const code = name.charCodeAt(index);
		if (code >= 65 && code <= 90) {
			return `${name.slice(0, index)}${String.fromCharCode(code + 32)}${name.slice(index + 1)}`;
		}
		if (code >= 97 && code <= 122) {
			return `${name.slice(0, index)}${String.fromCharCode(code - 32)}${name.slice(index + 1)}`;
		}
	}
	return undefined;
}

async function detectCaseInsensitiveFilesystem(existingPath: string): Promise<boolean> {
	let current = existingPath;
	while (true) {
		const variantName = toggleCase(basename(current));
		if (variantName) {
			try {
				const [canonicalCurrent, canonicalVariant] = await Promise.all([
					realpath(current),
					realpath(join(dirname(current), variantName)),
				]);
				return canonicalCurrent === canonicalVariant;
			} catch (error) {
				if (!isMissingPathError(error)) throw error;
			}
		}

		const parent = dirname(current);
		if (parent === current) return false;
		current = parent;
	}
}

/** Resolve an existing path or a missing target through its nearest real ancestor. */
export async function resolveCanonicalPath(filePath: string): Promise<CanonicalPathInfo> {
	let current = resolve(filePath);
	const missingSegments: string[] = [];

	while (true) {
		try {
			const canonicalCurrent = await realpath(current);
			if (missingSegments.length === 0) {
				return {
					path: canonicalCurrent,
					caseInsensitive: await detectCaseInsensitiveFilesystem(canonicalCurrent),
				};
			}
			return {
				path: resolve(canonicalCurrent, ...missingSegments),
				caseInsensitive: await detectCaseInsensitiveFilesystem(canonicalCurrent),
			};
		} catch (error) {
			if (!isMissingPathError(error)) throw error;
			const parent = dirname(current);
			if (parent === current) throw error;
			missingSegments.unshift(basename(current));
			current = parent;
		}
	}
}

function tryMacOSScreenshotPath(filePath: string): string {
	return filePath.replace(/ (AM|PM)\./gi, `${NARROW_NO_BREAK_SPACE}$1.`);
}

function tryNFDVariant(filePath: string): string {
	// macOS stores filenames in NFD (decomposed) form, try converting user input to NFD
	return filePath.normalize("NFD");
}

function tryCurlyQuoteVariant(filePath: string): string {
	// macOS uses U+2019 (right single quotation mark) in screenshot names like "Capture d'écran"
	// Users typically type U+0027 (straight apostrophe)
	return filePath.replace(/'/g, "\u2019");
}

function fileExists(filePath: string): boolean {
	try {
		accessSync(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export function expandPath(filePath: string): string {
	return normalizePath(filePath, { normalizeUnicodeSpaces: true, stripAtPrefix: true });
}

/**
 * Resolve a path relative to the given cwd.
 * Handles ~ expansion and absolute paths.
 */
export function resolveToCwd(filePath: string, cwd: string): string {
	return resolvePath(filePath, cwd, { normalizeUnicodeSpaces: true, stripAtPrefix: true });
}

export function resolveReadPath(filePath: string, cwd: string): string {
	const resolved = resolveToCwd(filePath, cwd);

	if (fileExists(resolved)) {
		return resolved;
	}

	// Try macOS AM/PM variant (narrow no-break space before AM/PM)
	const amPmVariant = tryMacOSScreenshotPath(resolved);
	if (amPmVariant !== resolved && fileExists(amPmVariant)) {
		return amPmVariant;
	}

	// Try NFD variant (macOS stores filenames in NFD form)
	const nfdVariant = tryNFDVariant(resolved);
	if (nfdVariant !== resolved && fileExists(nfdVariant)) {
		return nfdVariant;
	}

	// Try curly quote variant (macOS uses U+2019 in screenshot names)
	const curlyVariant = tryCurlyQuoteVariant(resolved);
	if (curlyVariant !== resolved && fileExists(curlyVariant)) {
		return curlyVariant;
	}

	// Try combined NFD + curly quote (for French macOS screenshots like "Capture d'écran")
	const nfdCurlyVariant = tryCurlyQuoteVariant(nfdVariant);
	if (nfdCurlyVariant !== resolved && fileExists(nfdCurlyVariant)) {
		return nfdCurlyVariant;
	}

	return resolved;
}

export async function resolveReadPathAsync(filePath: string, cwd: string): Promise<string> {
	const resolved = resolveToCwd(filePath, cwd);

	if (await pathExists(resolved)) {
		return resolved;
	}

	// Try macOS AM/PM variant (narrow no-break space before AM/PM)
	const amPmVariant = tryMacOSScreenshotPath(resolved);
	if (amPmVariant !== resolved && (await pathExists(amPmVariant))) {
		return amPmVariant;
	}

	// Try NFD variant (macOS stores filenames in NFD form)
	const nfdVariant = tryNFDVariant(resolved);
	if (nfdVariant !== resolved && (await pathExists(nfdVariant))) {
		return nfdVariant;
	}

	// Try curly quote variant (macOS uses U+2019 in screenshot names)
	const curlyVariant = tryCurlyQuoteVariant(resolved);
	if (curlyVariant !== resolved && (await pathExists(curlyVariant))) {
		return curlyVariant;
	}

	// Try combined NFD + curly quote (for French macOS screenshots like "Capture d'écran")
	const nfdCurlyVariant = tryCurlyQuoteVariant(nfdVariant);
	if (nfdCurlyVariant !== resolved && (await pathExists(nfdCurlyVariant))) {
		return nfdCurlyVariant;
	}

	return resolved;
}
