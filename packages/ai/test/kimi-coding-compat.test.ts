import { describe, expect, it } from "vitest";
import {
	ensureKimiCodingCompatibilityModels,
	KIMI_CODING_COMPATIBILITY_MODELS,
} from "../scripts/ensure-kimi-coding-compat.ts";
import type { Model } from "../src/types.ts";

describe("Kimi Coding catalog compatibility", () => {
	it("adds stable compatibility IDs when the live catalog omits them", () => {
		const current: Record<string, Model<any>> = {
			k3: {
				id: "k3",
				name: "Kimi K3",
				api: "anthropic-messages",
				provider: "kimi-coding",
				baseUrl: "https://api.kimi.com/coding",
				reasoning: true,
				input: ["text", "image"],
				cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 },
				contextWindow: 1048576,
				maxTokens: 131072,
			},
		};

		const result = ensureKimiCodingCompatibilityModels(current);

		expect(result.k3).toBe(current.k3);
		expect(result.k2p7).toEqual(KIMI_CODING_COMPATIBILITY_MODELS.k2p7);
		expect(result["kimi-for-coding"]).toEqual(KIMI_CODING_COMPATIBILITY_MODELS["kimi-for-coding"]);
		expect(result["kimi-k2-thinking"]).toEqual(KIMI_CODING_COMPATIBILITY_MODELS["kimi-k2-thinking"]);
	});

	it("keeps live metadata authoritative for existing IDs", () => {
		const liveCanonical = {
			...KIMI_CODING_COMPATIBILITY_MODELS["kimi-for-coding"],
			name: "Live Kimi Coding",
			contextWindow: 524288,
		};

		const result = ensureKimiCodingCompatibilityModels({ "kimi-for-coding": liveCanonical });

		expect(result["kimi-for-coding"]).toBe(liveCanonical);
	});
});
