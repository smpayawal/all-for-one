import { describe, expect, it } from "vitest";
import { ExecutionIntegrityTracker } from "../src/core/execution-integrity.ts";
import {
	createLazyValidationCommandDiscovery,
	type ValidationCommandDiscovery,
} from "../src/core/validation-commands.ts";

function createDiscovery(): ValidationCommandDiscovery {
	return {
		ecosystems: ["node"],
		packageManager: "npm",
		packageManagers: ["npm"],
		commands: [
			{
				kind: "check",
				command: "npm run check",
				program: "npm",
				args: ["run", "check"],
				confidence: "verified",
				source: "package.json#scripts.check",
			},
		],
	};
}

describe("lazy execution-integrity discovery", () => {
	it("memoizes validation discovery until a field is read", () => {
		let loads = 0;
		const discovery = createLazyValidationCommandDiscovery(() => {
			loads += 1;
			return createDiscovery();
		});

		expect(loads).toBe(0);
		expect(discovery.commands).toHaveLength(1);
		expect(discovery.ecosystems).toEqual(["node"]);
		expect(loads).toBe(1);
	});

	it("performs no discovery work while execution integrity is off", () => {
		let loads = 0;
		const discovery = createLazyValidationCommandDiscovery(() => {
			loads += 1;
			return createDiscovery();
		});
		const tracker = new ExecutionIntegrityTracker({
			settings: { mode: "off" },
			cwd: "/workspace",
			discovery,
		});

		expect(loads).toBe(0);
		expect(tracker.getSnapshot()).toMatchObject({ mode: "off", discoveredValidationCommands: [] });
		expect(tracker.recordTurn({ turnIndex: 1, toolObservations: [] })).toBe(false);
		expect(loads).toBe(0);

		tracker.updateSettings({ mode: "observe" });
		expect(loads).toBe(1);
		expect(tracker.getSnapshot().discoveredValidationCommands).toEqual(createDiscovery().commands);
	});
});
