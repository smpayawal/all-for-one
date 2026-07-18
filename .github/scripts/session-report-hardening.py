from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


source = Path("scripts/session-efficiency-report.ts")
text = source.read_text()
text = replace_once(
    text,
    'import { readFileSync } from "node:fs";',
    'import { closeSync, openSync, readSync } from "node:fs";',
    "streaming fs imports",
)
text = replace_once(text, "\tschemaVersion: 1;", "\tschemaVersion: 2;", "schema version type")
text = replace_once(
    text,
    '''\tquality: {\n\t\tmalformedLines: number;\n\t\tunmatchedToolResults: number;\n\t};''',
    '''\theuristics: {\n\t\tcancellationTextMentions: number;\n\t\ttimeoutTextMentions: number;\n\t};\n\tquality: {\n\t\tmalformedLines: number;\n\t\tunmatchedToolResults: number;\n\t};''',
    "heuristics report contract",
)
anchor = 'function getToolResultName(message: JsonObject, pendingCalls: Map<string, PendingToolCall>): string | null {'
helper = r'''function getStructuredTermination(
	message: JsonObject,
	details: JsonObject | null,
): "cancellation" | "timeout" | null {
	const execution = asObject(details?.execution);
	const result = asObject(details?.result);
	const candidates = [
		message.termination,
		message.terminationKind,
		details?.termination,
		details?.terminationKind,
		execution?.termination,
		execution?.terminationKind,
		result?.termination,
		result?.terminationKind,
	];
	for (const candidate of candidates) {
		const normalized = asString(candidate)?.toLowerCase();
		if (!normalized) continue;
		if (normalized === "timeout" || normalized === "timed-out" || normalized === "timed_out") return "timeout";
		if (["abort", "aborted", "cancel", "canceled", "cancelled"].includes(normalized)) return "cancellation";
	}
	return null;
}

'''
text = replace_once(text, anchor, helper + anchor, "structured termination helper")
text = replace_once(
    text,
    'export function analyzeSessionContent(content: string, options: SessionReportOptions = {}): SessionEfficiencyReport {',
    'function analyzeSessionLines(lines: Iterable<string>, options: SessionReportOptions = {}): SessionEfficiencyReport {',
    "line analyzer signature",
)
text = replace_once(
    text,
    '\tlet cancellations = 0;\n\tlet timeouts = 0;',
    '\tlet cancellations = 0;\n\tlet timeouts = 0;\n\tlet cancellationTextMentions = 0;\n\tlet timeoutTextMentions = 0;',
    "heuristic counters",
)
text = replace_once(text, 'for (const line of content.split(/\\r?\\n/u)) {', 'for (const line of lines) {', "line iterable")
text = replace_once(
    text,
    '''\t\tif (/cancel(?:led|ed)/iu.test(text)) cancellations += 1;\n\t\tif (/timed?\\s*out|timeout/iu.test(text)) timeouts += 1;''',
    '''\t\tconst termination = getStructuredTermination(message, details);\n\t\tif (termination === "cancellation") cancellations += 1;\n\t\tif (termination === "timeout") timeouts += 1;\n\t\tif (/cancel(?:led|ed)/iu.test(text)) cancellationTextMentions += 1;\n\t\tif (/timed?\\s*out|timeout/iu.test(text)) timeoutTextMentions += 1;''',
    "termination evidence split",
)
text = replace_once(text, '\t\tschemaVersion: 1,', '\t\tschemaVersion: 2,', "schema version value")
text = replace_once(
    text,
    '\t\tquality: { malformedLines, unmatchedToolResults },',
    '\t\theuristics: { cancellationTextMentions, timeoutTextMentions },\n\t\tquality: { malformedLines, unmatchedToolResults },',
    "heuristics report value",
)
wrapper_anchor = '\nexport function formatSessionEfficiencyReport(report: SessionEfficiencyReport): string {'
wrappers = r'''
function* readSessionLines(path: string): Generator<string> {
	const descriptor = openSync(path, "r");
	const buffer = Buffer.allocUnsafe(64 * 1_024);
	const decoder = new TextDecoder("utf-8");
	let carry = "";
	try {
		while (true) {
			const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
			if (bytesRead === 0) break;
			carry += decoder.decode(buffer.subarray(0, bytesRead), { stream: true });
			let newline = carry.indexOf("\n");
			while (newline >= 0) {
				const rawLine = carry.slice(0, newline);
				yield rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
				carry = carry.slice(newline + 1);
				newline = carry.indexOf("\n");
			}
		}
		carry += decoder.decode();
		if (carry) yield carry.endsWith("\r") ? carry.slice(0, -1) : carry;
	} finally {
		closeSync(descriptor);
	}
}

export function analyzeSessionContent(content: string, options: SessionReportOptions = {}): SessionEfficiencyReport {
	return analyzeSessionLines(content.split(/\r?\n/u), options);
}

export function analyzeSessionFile(path: string, options: SessionReportOptions = {}): SessionEfficiencyReport {
	return analyzeSessionLines(readSessionLines(path), options);
}
'''
text = replace_once(text, wrapper_anchor, wrappers + wrapper_anchor, "streaming file analyzer")
text = replace_once(
    text,
    '''\t\t`Compactions: ${report.activity.compactions}`,\n\t\t`Malformed lines skipped: ${report.quality.malformedLines}`,''',
    '''\t\t`Compactions: ${report.activity.compactions}`,\n\t\t`Structured termination: ${report.activity.cancellations} cancellations, ${report.activity.timeouts} timeouts`,\n\t\t`Text heuristics: ${report.heuristics.cancellationTextMentions} cancellation mentions, ${report.heuristics.timeoutTextMentions} timeout mentions`,\n\t\t`Malformed lines skipped: ${report.quality.malformedLines}`,''',
    "formatted evidence labels",
)
text = replace_once(
    text,
    'This offline report uses recorded session evidence only. It does not estimate monetary cost or include prompt, response, file, or tool-output contents.',
    'This offline report uses recorded session evidence only. Text-derived termination mentions are labeled as heuristics and are not counted as structured termination. It does not estimate monetary cost or include prompt, response, file, or tool-output contents.',
    "formatted disclaimer",
)
text = replace_once(
    text,
    'const report = analyzeSessionContent(readFileSync(path, "utf8"));',
    'const report = analyzeSessionFile(path);',
    "streaming CLI",
)
source.write_text(text)


test = Path("scripts/session-efficiency-report.test.ts")
text = test.read_text()
text = replace_once(
    text,
    '\tanalyzeSessionContent,\n\tformatSessionEfficiencyReport,',
    '\tanalyzeSessionContent,\n\tanalyzeSessionFile,\n\tformatSessionEfficiencyReport,',
    "file analyzer import",
)
text = replace_once(
    text,
    '''\t\t\t\tisError: true,\n\t\t\t\tcontent: [{ type: "text", text: "command timed out and was cancelled" }],''',
    '''\t\t\t\tisError: true,\n\t\t\t\tcontent: [{ type: "text", text: "command timed out and was cancelled" }],\n\t\t\t\tdetails: { termination: "timeout" },''',
    "structured timeout fixture",
)
text = replace_once(
    text,
    '\tassert.equal(report.session.version, 3);',
    '\tassert.equal(report.schemaVersion, 2);\n\tassert.equal(report.session.version, 3);',
    "schema assertion",
)
text = replace_once(
    text,
    '''\tassert.equal(report.activity.cancellations, 1);\n\tassert.equal(report.activity.timeouts, 1);''',
    '''\tassert.equal(report.activity.cancellations, 0);\n\tassert.equal(report.activity.timeouts, 1);\n\tassert.equal(report.heuristics.cancellationTextMentions, 1);\n\tassert.equal(report.heuristics.timeoutTextMentions, 1);''',
    "evidence assertions",
)
stream_anchor = '\ntest("CLI returns safe status codes for help, missing paths, and valid files", () => {'
stream_test = r'''

test("streams session files across chunk boundaries", () => {
	const directory = mkdtempSync(join(tmpdir(), "afo-session-stream-"));
	try {
		const path = join(directory, "large-session.jsonl");
		const content = [
			line({
				type: "session",
				version: 3,
				id: "session",
				timestamp: "2026-07-18T00:00:00.000Z",
				padding: "x".repeat(128 * 1_024),
			}),
			line({
				type: "model_change",
				id: "model",
				timestamp: "2026-07-18T00:00:01.000Z",
				provider: "openai",
				modelId: "gpt-stream",
			}),
		].join("\r\n");
		writeFileSync(path, content);
		assert.deepEqual(analyzeSessionFile(path), analyzeSessionContent(content));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
'''
text = replace_once(text, stream_anchor, stream_test + stream_anchor, "streaming test")
test.write_text(text)


docs = Path("docs/all-for-one/validation.md")
text = docs.read_text()
text = replace_once(
    text,
    "The report reads the file offline and does not modify the session. It reports only recorded evidence such as model and thinking configuration, token counts when present, assistant turns, tool success and failure counts, repeated reads, mutation and validation calls, truncation, compaction, cancellation, timeout, and trustworthy timestamp duration.",
    "The report streams the JSONL file line by line offline and does not modify the session. It reports only recorded evidence such as model and thinking configuration, token counts when present, assistant turns, tool success and failure counts, repeated reads, mutation and validation calls, truncation, compaction, structured cancellation or timeout fields when present, and trustworthy timestamp duration. Text that merely mentions cancellation or timeout is reported separately as heuristic evidence and is not counted as structured termination.",
    "streaming and evidence documentation",
)
docs.write_text(text)
