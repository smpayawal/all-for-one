import { resolve } from "node:path";
import { resolveCanonicalPath } from "./path-utils.ts";

const fileMutationQueues = new Map<string, Promise<void>>();
let registrationQueue = Promise.resolve();

export async function getMutationQueueKey(filePath: string): Promise<string> {
	const resolvedPath = resolve(filePath);
	const canonicalPath = await resolveCanonicalPath(resolvedPath);
	return canonicalPath.caseInsensitive ? canonicalPath.path.toLowerCase() : canonicalPath.path;
}

/** Serialize one or more file mutation operations while preserving parallelism for unrelated keys. */
export async function withFileMutationQueues<T>(filePaths: string[], fn: () => Promise<T>): Promise<T> {
	if (filePaths.length === 0) return fn();

	const registration = registrationQueue.then(async () => {
		const keys = [...new Set(await Promise.all(filePaths.map((filePath) => getMutationQueueKey(filePath))))].sort();
		const currentQueues = keys.map((key) => fileMutationQueues.get(key) ?? Promise.resolve());
		let releaseNext!: () => void;
		const nextQueue = new Promise<void>((resolveQueue) => {
			releaseNext = resolveQueue;
		});
		const chainedQueue = Promise.all(currentQueues).then(() => nextQueue);
		for (const key of keys) fileMutationQueues.set(key, chainedQueue);

		return { keys, currentQueues, chainedQueue, releaseNext };
	});
	registrationQueue = registration.then(
		() => undefined,
		() => undefined,
	);

	const { keys, currentQueues, chainedQueue, releaseNext } = await registration;
	await Promise.all(currentQueues);
	try {
		return await fn();
	} finally {
		releaseNext();
		for (const key of keys) {
			if (fileMutationQueues.get(key) === chainedQueue) {
				fileMutationQueues.delete(key);
			}
		}
	}
}

/**
 * Serialize file mutation operations targeting the same file.
 * Operations for different files still run in parallel.
 */
export async function withFileMutationQueue<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
	return withFileMutationQueues([filePath], fn);
}
