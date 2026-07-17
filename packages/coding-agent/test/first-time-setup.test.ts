import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isOfficialPiDistribution, shouldRunFirstTimeSetup } from "../src/cli/startup-ui.ts";
import { ENV_AGENT_DIR } from "../src/config.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import {
	ANALYTICS_DESCRIPTION,
	DEFAULT_SHARE_ANALYTICS,
} from "../src/modes/interactive/components/first-time-setup.ts";

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

describe("shouldRunFirstTimeSetup", () => {
	const originalPiExperimental = process.env.PI_EXPERIMENTAL;
	const originalAgentDir = process.env[ENV_AGENT_DIR];
	let tempDir: string;
	let settingsPath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "pi-first-time-setup-"));
		settingsPath = join(tempDir, "settings.json");
		process.env.PI_EXPERIMENTAL = "1";
		delete process.env[ENV_AGENT_DIR];
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		if (originalPiExperimental === undefined) {
			delete process.env.PI_EXPERIMENTAL;
		} else {
			process.env.PI_EXPERIMENTAL = originalPiExperimental;
		}
		if (originalAgentDir === undefined) {
			delete process.env[ENV_AGENT_DIR];
		} else {
			process.env[ENV_AGENT_DIR] = originalAgentDir;
		}
	});

	it("stays disabled for the All-For-One distribution", () => {
		expect(shouldRunFirstTimeSetup(settingsPath)).toBe(false);
	});
});

describe("first-time setup analytics consent", () => {
	it("defaults to disabled and avoids unsupported privacy guidance", () => {
		expect(DEFAULT_SHARE_ANALYTICS).toBe(false);
		expect(ANALYTICS_DESCRIPTION).not.toContain("/privacy");
	});
});

describe("analytics settings", () => {
	it("defaults to disabled with no tracking identifier", () => {
		const manager = SettingsManager.inMemory();

		expect(manager.getEnableAnalytics()).toBe(false);
		expect(manager.getTrackingId()).toBeUndefined();
	});

	it("generates a tracking identifier on opt-in", () => {
		const manager = SettingsManager.inMemory();

		manager.setEnableAnalytics(true);

		expect(manager.getEnableAnalytics()).toBe(true);
		expect(manager.getTrackingId()).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("does not generate a tracking identifier on opt-out", () => {
		const manager = SettingsManager.inMemory();

		manager.setEnableAnalytics(false);

		expect(manager.getEnableAnalytics()).toBe(false);
		expect(manager.getTrackingId()).toBeUndefined();
	});

	it("keeps the tracking identifier when toggling analytics", () => {
		const manager = SettingsManager.inMemory();

		manager.setEnableAnalytics(true);
		const trackingId = manager.getTrackingId();
		manager.setEnableAnalytics(false);
		manager.setEnableAnalytics(true);

		expect(manager.getTrackingId()).toBe(trackingId);
	});
});
