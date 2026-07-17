import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { createAgentSession } from "../src/core/sdk.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { createHarness } from "./suite/harness.ts";

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

	it("refreshes automatic profiles when setting and cycling models", async () => {
		const harness = await createHarness({
			models: [
				{ id: "faux-1", name: "Native", reasoning: true },
				{ id: "faux-2", name: "Patch", reasoning: true },
			],
			settings: {
				codingModelProfiles: {
					"faux-2": { mutationStrategy: "apply_patch", toolExecution: "sequential" },
				},
			},
			extensionFactories: [
				(pi) => {
					pi.registerTool({
						name: "custom_probe",
						label: "Custom probe",
						description: "A custom tool used to verify profile refresh preservation.",
						parameters: Type.Object({}),
						execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
					});
				},
			],
		});
		try {
			expect(harness.session.getActiveToolNames()).toEqual(["read", "bash", "edit", "write", "custom_probe"]);
			expect(harness.session.agent.toolExecution).toBe("parallel");

			await harness.session.setModel(harness.getModel("faux-2")!);
			expect(harness.session.getActiveToolNames()).toEqual(["read", "bash", "apply_patch", "write", "custom_probe"]);
			expect(harness.session.agent.toolExecution).toBe("sequential");

			await harness.session.cycleModel();
			expect(harness.session.model?.id).toBe("faux-1");
			expect(harness.session.getActiveToolNames()).toEqual(["read", "bash", "edit", "write", "custom_probe"]);

			harness.session.setScopedModels([
				{ model: harness.getModel("faux-1")! },
				{ model: harness.getModel("faux-2")! },
			]);
			await harness.session.cycleModel();
			expect(harness.session.model?.id).toBe("faux-2");
			expect(harness.session.getActiveToolNames()).toEqual(["read", "bash", "apply_patch", "write", "custom_probe"]);
		} finally {
			harness.cleanup();
		}
	});
});
