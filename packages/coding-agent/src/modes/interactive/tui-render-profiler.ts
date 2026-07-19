import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { performance } from "node:perf_hooks";

export interface TuiRenderProfileSample {
	timestamp: string;
	region: string;
	durationMs: number;
	details?: Record<string, boolean | number | string>;
	memory: {
		heapUsed: number;
		heapTotal: number;
		rss: number;
	};
}

const PROFILE_BATCH_SIZE = 100;
const samples: TuiRenderProfileSample[] = [];
let exitHookRegistered = false;

function isEnabled(): boolean {
	return process.env.PI_PROFILE_TUI === "1";
}

function getProfilePath(): string {
	return process.env.PI_TUI_PROFILE_PATH ?? path.join(os.homedir(), ".pi", "agent", "tui-profile.jsonl");
}

function flush(): void {
	if (samples.length === 0) return;
	const profilePath = getProfilePath();
	fs.mkdirSync(path.dirname(profilePath), { recursive: true });
	fs.appendFileSync(
		profilePath,
		`${samples
			.splice(0)
			.map((sample) => JSON.stringify(sample))
			.join("\n")}\n`,
	);
}

function ensureExitHook(): void {
	if (exitHookRegistered) return;
	exitHookRegistered = true;
	process.once("exit", flush);
}

export function recordTuiRenderProfile(
	region: string,
	durationMs: number,
	details?: Record<string, boolean | number | string>,
): void {
	if (!isEnabled()) return;
	ensureExitHook();
	const memory = process.memoryUsage();
	samples.push({
		timestamp: new Date().toISOString(),
		region,
		durationMs,
		...(details === undefined ? {} : { details }),
		memory: {
			heapUsed: memory.heapUsed,
			heapTotal: memory.heapTotal,
			rss: memory.rss,
		},
	});
	if (samples.length >= PROFILE_BATCH_SIZE) flush();
}

export function measureTuiRender<T>(
	region: string,
	operation: () => T,
	getDetails?: (result: T) => Record<string, boolean | number | string>,
): T {
	if (!isEnabled()) return operation();
	const startedAt = performance.now();
	const result = operation();
	recordTuiRenderProfile(region, performance.now() - startedAt, getDetails?.(result));
	return result;
}

export function flushTuiRenderProfile(): void {
	flush();
}
