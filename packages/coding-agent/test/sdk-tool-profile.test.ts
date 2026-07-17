import { describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";

describe("createAgentSession tool profiles", () => {
	it("uses an explicit tool profile and execution override", async () => {
		const { session } = await createAgentSession({
			toolProfile: "full",
			codingModelProfile: { toolExecution: "sequential" },
			settingsManager: SettingsManager.inMemory({ toolProfile: "patch" }),
			sessionManager: SessionManager.inMemory(),
		});

		expect(session.getActiveToolNames()).toEqual(["read", "bash", "edit", "write", "apply_patch"]);
		expect(session.agent.toolExecution).toBe("sequential");
	});

	it("lets an explicit allowlist override the selected profile", async () => {
		const { session } = await createAgentSession({
			toolProfile: "full",
			tools: ["read", "bash"],
			sessionManager: SessionManager.inMemory(),
		});

		expect(session.getActiveToolNames()).toEqual(["read", "bash"]);
	});
});
