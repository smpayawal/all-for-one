import { describe, expect, it } from "vitest";
import {
	DEFAULT_CODING_MODEL_PROFILE,
	resolveActiveToolProfile,
	resolveCodingModelProfile,
	resolveToolProfile,
	toolProfileForMutationStrategy,
} from "../src/core/coding-model-profile.ts";

describe("coding model profiles", () => {
	it("uses the conservative native profile by default", () => {
		expect(DEFAULT_CODING_MODEL_PROFILE).toEqual({ mutationStrategy: "edit", toolExecution: "parallel" });
		expect(resolveCodingModelProfile({})).toEqual(DEFAULT_CODING_MODEL_PROFILE);
		expect(resolveToolProfile({ modelProfile: DEFAULT_CODING_MODEL_PROFILE })).toBe("auto");
		expect(resolveActiveToolProfile({ requested: "auto", modelProfile: DEFAULT_CODING_MODEL_PROFILE })).toBe(
			"native",
		);
		expect(toolProfileForMutationStrategy("edit")).toBe("native");
		expect(toolProfileForMutationStrategy("apply_patch")).toBe("patch");
	});

	it("resolves wildcard, provider, model, and explicit overrides in order", () => {
		const model = { provider: "test-provider", id: "test-model" };
		expect(
			resolveCodingModelProfile({
				model,
				settings: {
					"*": { mutationStrategy: "apply_patch", toolExecution: "sequential" },
					"test-provider": { toolExecution: "parallel" },
					"test-model": { mutationStrategy: "edit" },
					"test-provider/test-model": { mutationStrategy: "apply_patch" },
				},
				explicit: { toolExecution: "sequential" },
			}),
		).toEqual({ mutationStrategy: "apply_patch", toolExecution: "sequential" });
	});
});
