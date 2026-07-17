import { describe, expect, it } from "vitest";
import { isOfficialPiDistribution } from "../src/cli/startup-ui.ts";

describe("first-time setup distribution boundary", () => {
	it("recognizes the official Pi identity", () => {
		expect(
			isOfficialPiDistribution({
				packageName: "@earendil-works/pi-coding-agent",
				appName: "pi",
				appTitle: "π",
				configDirName: ".pi",
			}),
		).toBe(true);
	});

	it("does not treat All-For-One as the official Pi distribution", () => {
		expect(
			isOfficialPiDistribution({
				packageName: "@earendil-works/pi-coding-agent",
				appName: "pi",
				appTitle: "All-For-One",
				configDirName: ".pi",
			}),
		).toBe(false);
	});
});
