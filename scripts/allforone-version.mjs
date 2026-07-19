const NUMERIC_IDENTIFIER = "(?:0|[1-9]\\d*)";
const NON_NUMERIC_IDENTIFIER = "(?:\\d*[A-Za-z-][0-9A-Za-z-]*)";
const PRERELEASE_IDENTIFIER = `(?:${NUMERIC_IDENTIFIER}|${NON_NUMERIC_IDENTIFIER})`;
const BUILD_IDENTIFIER = "[0-9A-Za-z-]+";

const VERSION_PATTERN = new RegExp(
	`^${NUMERIC_IDENTIFIER}\\.${NUMERIC_IDENTIFIER}\\.${NUMERIC_IDENTIFIER}` +
		`(?:-(${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*))?` +
		`(?:\\+${BUILD_IDENTIFIER}(?:\\.${BUILD_IDENTIFIER})*)?$`,
);

export function parseAllForOneVersion(version) {
	const match = VERSION_PATTERN.exec(version);
	if (!match) {
		throw new Error(`Invalid All-For-One version: ${version}. Expected semantic versioning.`);
	}
	return {
		version,
		prerelease: match[1] !== undefined,
	};
}

export function validateAllForOneVersion(version) {
	return parseAllForOneVersion(version).version;
}

export function isPrereleaseVersion(version) {
	return parseAllForOneVersion(version).prerelease;
}
