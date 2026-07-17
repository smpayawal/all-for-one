/** Maximum length of runtime error text exposed in agent messages and diagnostics. */
export const MAX_RUNTIME_ERROR_CHARS = 4_000;

const UNKNOWN_RUNTIME_ERROR = "Unknown runtime error";

function stringifyRuntimeError(error: unknown): string {
	try {
		if (error instanceof Error) return error.message;
		return String(error);
	} catch {
		return UNKNOWN_RUNTIME_ERROR;
	}
}

/** Convert an arbitrary runtime failure into bounded, user-visible diagnostic text. */
export function normalizeRuntimeError(error: unknown): string {
	let text = stringifyRuntimeError(error);
	try {
		text = text
			.replace(/(\bcookies?\s*[:=]\s*)[^\r\n]*/gi, "$1[REDACTED]")
			.replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
			.replace(
				/(\b(?:api[_-]?key|apikey|token|access[_-]?token|refresh[_-]?token|openai[_-]?api[_-]?key)\s*[:=]\s*)[^\s,;&]+/gi,
				"$1[REDACTED]",
			)
			.replace(/\bsk-[A-Za-z0-9_-]+/gi, "[REDACTED]")
			.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	} catch {
		return UNKNOWN_RUNTIME_ERROR;
	}

	return (text || UNKNOWN_RUNTIME_ERROR).slice(0, MAX_RUNTIME_ERROR_CHARS);
}
