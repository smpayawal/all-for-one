import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/child-process.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/utils/child-process.ts")>();
	return {
		...actual,
		waitForChildProcess: vi.fn(() => new Promise<number | null>(() => {})),
	};
});

vi.mock("../src/utils/shell.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/utils/shell.ts")>();
	return {
		...actual,
		terminateProcessTreeAndWait: vi.fn(() => new Promise(() => {})),
	};
});

describe("bounded process cleanup failure", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("returns an incomplete cleanup result instead of hanging execCommand", async () => {
		const { execCommand } = await import("../src/core/exec.ts");
		const execution = execCommand(process.execPath, ["-e", "process.exit(0)"], process.cwd(), {
			timeout: 1,
		});

		await vi.advanceTimersByTimeAsync(11_100);
		const result = await execution;

		expect(result.termination).toBe("timeout");
		expect(result.killed).toBe(true);
		expect(result.processTreeCleanup).toMatchObject({
			completed: false,
			verified: false,
		});
		expect(result.processTreeCleanup?.error).toContain("cleanup exceeded 10000ms");
		expect(result.processTreeCleanup?.error).toContain("Root process did not exit within 1000ms");
	});

	it("reports incomplete cleanup instead of hanging local bash", async () => {
		const { createLocalBashOperations } = await import("../src/core/tools/bash.ts");
		const execution = createLocalBashOperations().exec("exit 0", process.cwd(), {
			onData: () => {},
			timeout: 0.001,
		});

		await vi.advanceTimersByTimeAsync(11_100);

		await expect(execution).rejects.toThrow("timeout:0.001; process-tree cleanup incomplete");
		await expect(execution).rejects.toThrow("cleanup exceeded 10000ms");
	});
});