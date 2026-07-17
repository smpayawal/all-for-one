import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DefaultResourceLoader } from "../src/core/resource-loader.ts";

describe("native coding skills", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const directory of tempDirs.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("loads all five bundled skills by default", async () => {
		const directory = join(tmpdir(), `pi-native-skills-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		tempDirs.push(directory);
		mkdirSync(directory, { recursive: true });

		const loader = new DefaultResourceLoader({ cwd: directory, agentDir: directory });
		await loader.reload();

		expect(
			loader
				.getSkills()
				.skills.filter((skill) => skill.filePath.includes("packages/coding-agent/skills/"))
				.map((skill) => skill.name)
				.sort(),
		).toEqual([
			"plan-complex-change",
			"repository-orientation",
			"review-diff",
			"systematic-debugging",
			"verify-before-completion",
		]);
	});

	it("keeps the bundled skills out when skills are disabled", async () => {
		const directory = join(tmpdir(), `pi-native-skills-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		tempDirs.push(directory);
		mkdirSync(directory, { recursive: true });

		const loader = new DefaultResourceLoader({ cwd: directory, agentDir: directory, noSkills: true });
		await loader.reload();

		expect(loader.getSkills().skills).toEqual([]);
	});
});
