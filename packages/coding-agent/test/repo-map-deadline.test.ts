import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "../src/core/extensions/types.ts";
import { createBoundedRepoMapExtension } from "../src/extensions/repo-map/bounded.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown | Promise<unknown>;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("repository-map total deadline", () => {
	it("falls back without injection when complete generation exceeds the deadline", async () => {
		const handlers = new Map<string, Handler[]>();
		const notifications: string[] = [];
		const api = {
			on: (event: string, handler: Handler) => {
				const existing = handlers.get(event) ?? [];
				existing.push(handler);
				handlers.set(event, existing);
			},
			registerCommand: () => {},
			exec: async (_command: string, args: string[]) => {
				await delay(40);
				const key = args.join(" ");
				return {
					stdout:
						key === "rev-parse HEAD"
							? "0123456789abcdef0123456789abcdef01234567\n"
							: key === "ls-files -z"
								? "package.json\0"
								: "",
					stderr: "",
					code: 0,
					killed: false,
					termination: "completed" as const,
					stdoutTruncated: false,
					stderrTruncated: false,
				};
			},
		} as unknown as ExtensionAPI;
		createBoundedRepoMapExtension(5)(api);

		const context = {
			cwd: process.cwd(),
			isProjectTrusted: () => true,
			ui: {
				notify: (message: string) => notifications.push(message),
			},
		} as unknown as ExtensionContext;
		const beforeAgentStart = handlers.get("before_agent_start")?.[0];
		const onContext = handlers.get("context")?.[0];
		if (!beforeAgentStart || !onContext) throw new Error("Repository-map handlers were not registered");

		await beforeAgentStart({ prompt: "Analyze the repository architecture as a whole" }, context);
		const result = await onContext({ type: "context", messages: [] }, context);
		expect(result).toBeUndefined();
		expect(notifications.join("\n")).toContain("total deadline");

		// Let the bounded underlying operations settle so the test leaves no pending work.
		await delay(60);
	});
});
