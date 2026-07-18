import type {
	ContextEvent,
	ContextEventResult,
	ExtensionAPI,
	ExtensionContext,
	ExtensionHandler,
} from "../../core/extensions/types.ts";
import repoMapExtension from "./index.ts";

export const REPO_MAP_GENERATION_DEADLINE_MS = 7_500;

type UntypedHandler = (event: unknown, ctx: ExtensionContext) => unknown | Promise<unknown>;
type UntypedOn = (event: string, handler: UntypedHandler) => void;

export function runWithRepoMapDeadline<T>(
	operation: Promise<T>,
	deadlineMs: number,
	onTimeout: () => void,
): Promise<T | undefined> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			callback();
		};
		const timeoutId = setTimeout(() => {
			finish(() => {
				onTimeout();
				resolve(undefined);
			});
		}, deadlineMs);
		operation.then(
			(value) => finish(() => resolve(value)),
			(error) => finish(() => reject(error)),
		);
	});
}

export function createBoundedRepoMapExtension(
	deadlineMs = REPO_MAP_GENERATION_DEADLINE_MS,
): (pi: ExtensionAPI) => void {
	return (pi) => {
		const register = pi.on.bind(pi) as unknown as UntypedOn;
		const boundedApi = new Proxy(pi, {
			get(target, property) {
				if (property === "on") {
					return (event: string, handler: UntypedHandler): void => {
						if (event !== "context") {
							register(event, handler);
							return;
						}
						const contextHandler = handler as ExtensionHandler<ContextEvent, ContextEventResult>;
						register(event, async (rawEvent, ctx) => {
							const operation = Promise.resolve(contextHandler(rawEvent as ContextEvent, ctx));
							return await runWithRepoMapDeadline(operation, deadlineMs, () => {
								ctx.ui.notify(
									`Repository map skipped: generation exceeded the ${deadlineMs}ms total deadline.`,
									"warning",
								);
							});
						});
					};
				}
				const value = Reflect.get(target, property, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		}) as ExtensionAPI;

		repoMapExtension(boundedApi);
	};
}

export default createBoundedRepoMapExtension();
