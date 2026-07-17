import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getAgentDir } from "../packages/coding-agent/src/config.ts";
import { deduplicateContextFiles, DefaultResourceLoader } from "../packages/coding-agent/src/core/resource-loader.ts";
import { createStructuredHandoff, validateStructuredHandoff } from "../packages/coding-agent/src/core/handoff.ts";
import { getProjectMemoryPath, scanMemoryText } from "../packages/coding-agent/src/core/memory.ts";
import { SettingsManager } from "../packages/coding-agent/src/core/settings-manager.ts";
import {
	DEFAULT_SKILL_METADATA_MAX_CHARS,
	formatSkillsForPromptWithDiagnostics,
	loadSkills,
} from "../packages/coding-agent/src/core/skills.ts";
import { buildSystemPrompt } from "../packages/coding-agent/src/core/system-prompt.ts";
import {
	createAllToolDefinitions,
	createCodingToolDefinitions,
	DEFAULT_ACTIVE_TOOL_NAMES,
} from "../packages/coding-agent/src/core/tools/index.ts";
import {
	getProjectValidationPromptGuideline,
	MAX_VALIDATION_PROMPT_CHARS,
	MAX_VALIDATION_PROMPT_COMMANDS,
	type ValidationCommandDiscovery,
} from "../packages/coding-agent/src/core/validation-commands.ts";
import { createSyntheticSkillCollection, measureSkillCollection } from "./allforone-baseline.ts";

export interface AllForOneDoctorCheck {
	name: string;
	status: "pass" | "warn" | "fail";
	message: string;
}

export interface AllForOneDoctorReport {
	schemaVersion: 1;
	environment: { cwd: string; agentDir: string; mode: "offline-read-only" };
	checks: AllForOneDoctorCheck[];
	passed: boolean;
}

export interface AllForOneDoctorOptions {
	cwd: string;
	agentDir: string;
}

function check(name: string, fn: () => string | undefined): AllForOneDoctorCheck {
	try {
		const warning = fn();
		return warning ? { name, status: "warn", message: warning } : { name, status: "pass", message: "ok" };
	} catch (error) {
		return {
			name,
			status: "fail",
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

async function withOfflineResourceLoader<T>(loader: DefaultResourceLoader, fn: () => Promise<T>): Promise<T> {
	const previousOffline = process.env.PI_OFFLINE;
	process.env.PI_OFFLINE = "1";
	try {
		await loader.reload();
		return await fn();
	} finally {
		if (previousOffline === undefined) delete process.env.PI_OFFLINE;
		else process.env.PI_OFFLINE = previousOffline;
	}
}

export async function runAllForOneDoctor(options: AllForOneDoctorOptions): Promise<AllForOneDoctorReport> {
	const cwd = resolve(options.cwd);
	const agentDir = resolve(options.agentDir);
	const checks: AllForOneDoctorCheck[] = [];

	checks.push(
		check("tool registry integrity", () => {
			const allTools = createAllToolDefinitions(cwd);
			const activeTools = createCodingToolDefinitions(cwd);
			const allNames = Object.keys(allTools);
			const activeNames = activeTools.map((tool) => tool.name);
			if (new Set(allNames).size !== allNames.length) throw new Error("duplicate registered tool name");
			if (activeNames.some((name) => !allNames.includes(name))) throw new Error("active tool is not registered");
			return undefined;
		}),
	);

	checks.push(
		check("default capability exposure", () => {
			const allNames = Object.keys(createAllToolDefinitions(cwd)).sort((left, right) => left.localeCompare(right));
			const activeNames = createCodingToolDefinitions(cwd).map((tool) => tool.name);
			const expectedActiveNames = [...DEFAULT_ACTIVE_TOOL_NAMES];
			const optionalNames = ["grep", "find", "ls"];
			if (JSON.stringify(activeNames) !== JSON.stringify(expectedActiveNames)) {
				throw new Error(`default active tools changed: ${activeNames.join(", ")}`);
			}
			if (optionalNames.some((name) => !allNames.includes(name) || activeNames.includes(name))) {
				throw new Error("optional read-only tools are not represented as inactive capabilities");
			}
			return undefined;
		}),
	);

	checks.push(
		check("prompt and schema structural fixtures", () => {
			const activeTools = createCodingToolDefinitions(cwd);
			const activeNames = activeTools.map((tool) => tool.name);
			const schemaText = JSON.stringify(
				activeTools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })),
			);
			if (schemaText.length === 0 || schemaText.length > 50_000) {
				throw new Error(`active tool schema is outside the 1..50000 character fixture bound: ${schemaText.length}`);
			}
			if (activeTools.some((tool) => tool.description.trim().length === 0 || tool.parameters === undefined)) {
				throw new Error("default tool metadata or schema is incomplete");
			}
			if (formatSkillsForPromptWithDiagnostics([]).prompt !== "") {
				throw new Error("empty skill set produced model-visible metadata");
			}
			const toolSnippets = Object.fromEntries(
				activeTools
					.filter((tool) => tool.promptSnippet !== undefined)
					.map((tool) => [tool.name, tool.promptSnippet as string]),
			);
			const defaultPrompt = buildSystemPrompt({ cwd, selectedTools: activeNames, toolSnippets, skills: [] });
			if (!defaultPrompt.includes("Available tools:") || !defaultPrompt.includes("Current working directory:")) {
				throw new Error("default system prompt fixture is incomplete");
			}
			const customPrompt = buildSystemPrompt({ cwd, customPrompt: "custom fixture", selectedTools: [], skills: [] });
			if (!customPrompt.startsWith("custom fixture") || !customPrompt.includes("Current working directory:")) {
				throw new Error("custom system prompt fixture is incomplete");
			}
			const noToolsPrompt = buildSystemPrompt({ cwd, selectedTools: [], toolSnippets: {}, skills: [] });
			if (!noToolsPrompt.includes("Available tools:\n(none)")) {
				throw new Error("no-tools system prompt fixture is incomplete");
			}
			const discovery = {
				ecosystems: ["node"],
				packageManager: "npm" as const,
				commands: [
					{
						kind: "check" as const,
						command: "npm run check",
						confidence: "verified" as const,
						source: "package.json#scripts.check",
					},
				],
			} satisfies ValidationCommandDiscovery;
			if (getProjectValidationPromptGuideline(cwd, ["bash"], "off", discovery) !== undefined) {
				throw new Error("off-mode validation guidance was exposed");
			}
			const observed = getProjectValidationPromptGuideline(cwd, ["bash"], "observe", discovery);
			if (!observed || observed.length > MAX_VALIDATION_PROMPT_CHARS || !observed.includes("npm run check")) {
				throw new Error("observe-mode validation guidance is not bounded and grounded");
			}
			const enforced = getProjectValidationPromptGuideline(cwd, ["bash"], "enforce", discovery);
			if (!enforced?.includes(`up to ${MAX_VALIDATION_PROMPT_COMMANDS} grounded entries`)) {
				throw new Error("enforce-mode validation guidance is missing its bound");
			}
			return undefined;
		}),
	);

	checks.push(
		check("skill metadata budget enforcement", () => {
			const skills = createSyntheticSkillCollection(50);
			const first = formatSkillsForPromptWithDiagnostics(skills, { maxChars: 1_000 });
			const second = formatSkillsForPromptWithDiagnostics([...skills].reverse(), { maxChars: 1_000 });
			const zeroBudget = formatSkillsForPromptWithDiagnostics(skills.slice(0, 2), { maxChars: 0 });
			if (first.prompt.length > 1_000) throw new Error("skill metadata exceeds configured budget");
			if (first.prompt !== second.prompt) throw new Error("skill metadata ordering is not deterministic");
			if (first.diagnostics.omittedCount === 0) throw new Error("large collection did not report omitted skills");
			if (zeroBudget.diagnostics.omittedCount !== 2 || zeroBudget.diagnostics.omittedSkills.length !== 2) {
				throw new Error("zero skill metadata budget did not report all omitted skills");
			}
			return undefined;
		}),
	);

	checks.push(
		check("unsupported budget fallback", () => {
			const result = formatSkillsForPromptWithDiagnostics(createSyntheticSkillCollection(1), {
				maxChars: -1,
				maxContextPercent: 2,
				contextWindow: 0,
			});
			if (result.diagnostics.budgetSource !== "default") throw new Error("unsupported budget was accepted");
			if (result.diagnostics.budgetChars !== DEFAULT_SKILL_METADATA_MAX_CHARS) {
				throw new Error("unsupported budget did not use the fixed default");
			}
			return undefined;
		}),
	);

	checks.push(
		check("skill metadata diagnostics", () => {
			const checkDir = mkdtempSync(`${tmpdir()}/pi-allforone-skills-`);
			try {
				const checkAgentDir = resolve(checkDir, "agent");
				const malformedDir = resolve(checkDir, "malformed");
				const firstDir = resolve(checkDir, "first");
				const secondDir = resolve(checkDir, "second");
				for (const directory of [checkAgentDir, malformedDir, firstDir, secondDir]) {
					mkdirSync(directory, { recursive: true });
				}
				writeFileSync(resolve(malformedDir, "SKILL.md"), "---\nname: malformed-skill\n---\n");
				for (const directory of [firstDir, secondDir]) {
					writeFileSync(
						resolve(directory, "SKILL.md"),
						"---\nname: collision-skill\ndescription: Collision test skill.\n---\n",
					);
				}
				const result = loadSkills({
					cwd: checkDir,
					agentDir: checkAgentDir,
					skillPaths: [malformedDir, firstDir, secondDir],
					includeDefaults: false,
				});
				if (!result.diagnostics.some((diagnostic) => diagnostic.message.includes("description is required"))) {
					throw new Error("malformed skill metadata was not diagnosed");
				}
				if (!result.diagnostics.some((diagnostic) => diagnostic.type === "collision")) {
					throw new Error("skill name collision was not diagnosed");
				}
				return undefined;
			} finally {
				rmSync(checkDir, { recursive: true, force: true });
			}
		}),
	);

	checks.push(
		check("baseline comparison", () => {
			const baseline = measureSkillCollection(createSyntheticSkillCollection(500), [8_192]);
			const bounded = formatSkillsForPromptWithDiagnostics(createSyntheticSkillCollection(500), { maxChars: 8_000 });
			if (baseline.budgetApplied) throw new Error("All-For-One baseline baseline unexpectedly applied a budget");
			if (bounded.prompt.length >= baseline.metadataChars) {
				throw new Error("All-For-One budget did not reduce large-skill metadata relative to All-For-One baseline");
			}
			if (bounded.diagnostics.omittedCount === 0) throw new Error("comparison did not report omitted skills");
			return undefined;
		}),
	);

	checks.push(
		check("context hash deduplication", () => {
			const result = deduplicateContextFiles([
				{ path: `${cwd}/AGENTS.md`, content: "same" },
				{ path: `${cwd}/copy/AGENTS.md`, content: "same" },
			]);
			if (result.agentsFiles.length !== 1 || result.diagnostics.duplicateContentCount !== 1) {
				throw new Error("exact duplicate context content was not diagnosed");
			}
			return undefined;
		}),
	);

	checks.push(
		check("oversized context warning", () => {
			const result = deduplicateContextFiles([
				{ path: `${cwd}/large-AGENTS.md`, content: "x".repeat(20_001) },
			]);
			if (!result.diagnostics.warnings.some((warning) => warning.includes("20,001"))) {
				throw new Error("oversized context file did not produce a deterministic warning");
			}
			return undefined;
		}),
	);

	checks.push(
		check("memory location and secret scan", () => {
			if (!getProjectMemoryPath(cwd, agentDir).startsWith(agentDir)) throw new Error("memory escaped agent directory");
			if (scanMemoryText("API_KEY=abcdefghijk").length === 0) throw new Error("secret scanner missed a credential assignment");
			return undefined;
		}),
	);

	checks.push(
		check("structured handoff contract", () => {
			const handoff = createStructuredHandoff({
				status: "partial",
				goal: "doctor handoff contract",
				summary: "contract validated",
				remainingWork: ["resume the bounded continuation"],
			});
			if (validateStructuredHandoff(handoff).length > 0) throw new Error("valid handoff rejected");
			return undefined;
		}),
	);

	const scopeDir = await mkdtemp(`${tmpdir()}/pi-allforone-doctor-`);
	try {
		const projectDir = resolve(scopeDir, "project");
		const scopedAgentDir = resolve(scopeDir, "agent");
		mkdirSync(projectDir, { recursive: true });
		mkdirSync(resolve(projectDir, "frontend"), { recursive: true });
		mkdirSync(scopedAgentDir, { recursive: true });
		writeFileSync(resolve(projectDir, "AGENTS.md"), "root");
		writeFileSync(resolve(projectDir, "frontend", "AGENTS.md"), "frontend");
		const settingsManager = SettingsManager.create(projectDir, scopedAgentDir);
		const loader = new DefaultResourceLoader({
			cwd: projectDir,
			agentDir: scopedAgentDir,
			settingsManager,
			noExtensions: true,
			noPromptTemplates: true,
			noThemes: true,
		});
		await withOfflineResourceLoader(loader, async () => {
			const base = loader.getAgentsFiles().agentsFiles.map((file) => file.content);
			const frontend = loader.getAgentsFilesForPath?.(resolve(projectDir, "frontend", "src", "App.tsx"));
			if (base.includes("frontend")) throw new Error("nested context was preloaded");
			if (!frontend?.agentsFiles.some((file) => file.content === "frontend")) {
				throw new Error("frontend context was not loaded for a frontend path");
			}
			const outside = loader.getAgentsFilesForPath?.(resolve(projectDir, "..", "outside", "file.ts"));
			if (!outside?.diagnostics.warnings.some((warning) => warning.includes("outside the project root"))) {
				throw new Error("outside-project context lookup was not rejected");
			}
			return undefined;
		});
		checks.push({ name: "path-scoped context", status: "pass", message: "nested context remains path-scoped" });
	} catch (error) {
		checks.push({
			name: "path-scoped context",
			status: "fail",
			message: error instanceof Error ? error.message : String(error),
		});
	} finally {
		rmSync(scopeDir, { recursive: true, force: true });
	}

	return {
		schemaVersion: 1,
		environment: { cwd, agentDir, mode: "offline-read-only" },
		checks,
		passed: checks.every((item) => item.status !== "fail"),
	};
}

function parseOptions(argv: readonly string[]): { options: AllForOneDoctorOptions; json: boolean; help: boolean } {
	let cwd = process.cwd();
	let agentDir = getAgentDir();
	let json = false;
	let help = false;
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--json") json = true;
		else if (arg === "--help" || arg === "-h") help = true;
		else if (arg === "--cwd") cwd = argv[++index] ?? "";
		else if (arg === "--agent-dir") agentDir = argv[++index] ?? "";
		else throw new Error(`Unknown option: ${arg}`);
	}
	if (!cwd || !agentDir) throw new Error("--cwd and --agent-dir require paths");
	return { options: { cwd, agentDir }, json, help };
}

export async function runAllForOneDoctorCli(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
	const { options, json, help } = parseOptions(argv);
	if (help) {
		process.stdout.write("Usage: npm run doctor:allforone -- [--cwd <path>] [--agent-dir <path>] [--json]\n");
		return;
	}
	const report = await runAllForOneDoctor(options);
	if (json) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} else {
		process.stdout.write(`All-For-One doctor (${report.passed ? "passed" : "failed"})\n`);
		for (const item of report.checks) process.stdout.write(`  [${item.status}] ${item.name}: ${item.message}\n`);
	}
	if (!report.passed) process.exitCode = 1;
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
	runAllForOneDoctorCli().catch((error: unknown) => {
		console.error(`allforone-doctor: ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	});
}
