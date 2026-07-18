import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { estimateTextTokens } from "../packages/ai/src/utils/estimate.ts";
import { getAgentDir } from "../packages/coding-agent/src/config.ts";
import { DefaultResourceLoader } from "../packages/coding-agent/src/core/resource-loader.ts";
import { SettingsManager } from "../packages/coding-agent/src/core/settings-manager.ts";
import { createSyntheticSourceInfo } from "../packages/coding-agent/src/core/source-info.ts";
import { formatSkillsForPrompt, type Skill } from "../packages/coding-agent/src/core/skills.ts";
import { buildSystemPrompt } from "../packages/coding-agent/src/core/system-prompt.ts";
import { createAllToolDefinitions, createCodingToolDefinitions } from "../packages/coding-agent/src/core/tools/index.ts";

/**
 * External Codex reference value used for comparison only. All-For-One baseline does not
 * enforce this value or make any claim that it is optimal for All-For-One.
 */
export const CODEX_REFERENCE_METADATA_BUDGET_PERCENT = 2;

export interface AllForOneReferenceBudget {
	contextWindow: number;
	referenceBudgetPercent: number;
	referenceTokenBudget: number;
	fits: boolean;
}

export interface AllForOneSkillCollectionMeasurement {
	skillCount: number;
	metadataChars: number;
	metadataBytes: number;
	metadataTokensEstimate: number;
	referenceBudgets: AllForOneReferenceBudget[];
	omittedSkills: string[];
	budgetApplied: false;
}

export const DEFAULT_ALLFORONE_CONTEXT_WINDOWS = [8_192, 16_384, 32_768, 128_000, 1_000_000];
export const DEFAULT_ALLFORONE_SYNTHETIC_SKILL_COUNTS = [0, 2, 10, 50, 100, 500];
const UNBOUNDED_BASELINE_SKILL_METADATA_CHARS = Number.MAX_SAFE_INTEGER;

export interface AllForOneBaselineTaskCategory {
	id: string;
	description: string;
	requiredMetrics: string[];
	executionStatus: "deferred-live-evaluation";
}

export const ALLFORONE_BASELINE_TASK_CATEGORIES: ReadonlyArray<AllForOneBaselineTaskCategory> = [
	{
		id: "repository-orientation",
		description: "A bounded orientation task in an unfamiliar repository.",
		requiredMetrics: ["task completion", "relevant files", "validation result", "model turns", "tool calls"],
		executionStatus: "deferred-live-evaluation",
	},
	{
		id: "small-localized-bug-fix",
		description: "A localized defect with a focused regression test.",
		requiredMetrics: ["validation result", "incorrect edits", "model turns", "tool calls"],
		executionStatus: "deferred-live-evaluation",
	},
	{
		id: "multi-file-refactor",
		description: "A behavior-preserving refactor crossing several files.",
		requiredMetrics: ["correctness", "regressions", "validation result", "model turns", "context occupancy"],
		executionStatus: "deferred-live-evaluation",
	},
	{
		id: "failing-test-diagnosis",
		description: "A failing test investigation and repair.",
		requiredMetrics: ["root cause correctness", "validation result", "repeated reads", "model turns"],
		executionStatus: "deferred-live-evaluation",
	},
	{
		id: "tool-profile-switching",
		description: "A session that switches models and verifies tool-profile boundaries.",
		requiredMetrics: ["active tool names", "profile transitions", "prompt boundary", "validation result"],
		executionStatus: "deferred-live-evaluation",
	},
	{
		id: "large-tool-output",
		description: "A task that produces large build, test, or search output.",
		requiredMetrics: ["raw tool-output bytes", "injected tool-output bytes", "truncation count", "follow-up retrieval count"],
		executionStatus: "deferred-live-evaluation",
	},
	{
		id: "context-compaction",
		description: "A multi-turn task crossing a context-compaction boundary.",
		requiredMetrics: ["compaction count", "context occupancy", "resumed task correctness", "model turns"],
		executionStatus: "deferred-live-evaluation",
	},
	{
		id: "safe-mode-denial",
		description: "A task where safe mode must deny an unsafe command or tool call.",
		requiredMetrics: ["blocked action", "approval path", "unsafe operation count", "final result"],
		executionStatus: "deferred-live-evaluation",
	},
	{
		id: "interrupted-command",
		description: "A command timeout or cancellation with cleanup and recovery evidence.",
		requiredMetrics: ["termination classification", "descendant cleanup", "recovery result", "elapsed time"],
		executionStatus: "deferred-live-evaluation",
	},
	{
		id: "provider-tool-failure-recovery",
		description: "A task that recovers from a provider or tool failure.",
		requiredMetrics: ["failure classification", "retry or recovery outcome", "unresolved errors", "final result"],
		executionStatus: "deferred-live-evaluation",
	},
	{
		id: "resume-existing-session",
		description: "A task resumed from an existing Pi-compatible session.",
		requiredMetrics: ["session restore success", "context continuity", "tool calls", "validation result"],
		executionStatus: "deferred-live-evaluation",
	},
	{
		id: "unprofiled-model-fallback",
		description: "An unprofiled model using the conservative default tool profile.",
		requiredMetrics: ["fallback profile", "active tool names", "prompt boundary", "validation result"],
		executionStatus: "deferred-live-evaluation",
	},
];

export interface AllForOneBaselineOptions {
	cwd: string;
	agentDir: string;
	additionalSkillPaths?: string[];
	includeSkills?: boolean;
	includeContextFiles?: boolean;
	projectTrusted?: boolean;
	contextWindows?: number[];
	syntheticSkillCounts?: number[];
}

export interface AllForOneContextFileMeasurement {
	path: string;
	chars: number;
	bytes: number;
	tokensEstimate: number;
}

export interface AllForOneBaselineReport {
	schemaVersion: 1;
	evaluationPlan: AllForOneBaselineTaskCategory[];
	environment: {
		cwd: string;
		agentDir: string;
		projectTrusted: boolean;
		resourceLoading: "offline-read-only";
	};
	current: {
		skills: {
			discovered: number;
			visible: number;
			manualOnly: number;
			metadataChars: number;
			metadataBytes: number;
			metadataTokensEstimate: number;
			names: string[];
			diagnosticCounts: Record<string, number>;
		};
		contextFiles: {
			count: number;
			totalChars: number;
			totalBytes: number;
			totalTokensEstimate: number;
			files: AllForOneContextFileMeasurement[];
		};
		tools: {
			allNames: string[];
			activeNames: string[];
			activeSchemaChars: number;
			activeSchemaBytes: number;
			activeSchemaTokensEstimate: number;
			activePromptChars: number;
			activePromptBytes: number;
			activePromptTokensEstimate: number;
		};
		systemPrompt: {
			source: "built-in" | "custom";
			appendSystemPromptCount: number;
			chars: number;
			bytes: number;
			tokensEstimate: number;
		};
	};
	skillCollections: AllForOneSkillCollectionMeasurement[];
	limitations: string[];
}

function normalizeContextWindows(contextWindows: readonly number[]): number[] {
	const normalized = Array.from(new Set(contextWindows));
	for (const contextWindow of normalized) {
		if (!Number.isInteger(contextWindow) || contextWindow <= 0) {
			throw new RangeError(`context window must be a positive integer: ${contextWindow}`);
		}
	}
	return normalized.sort((a, b) => a - b);
}

function normalizeSkillCount(count: number): number {
	if (!Number.isInteger(count) || count < 0) {
		throw new RangeError(`synthetic skill count must be a non-negative integer: ${count}`);
	}
	return count;
}

function normalizeSkillCounts(skillCounts: readonly number[]): number[] {
	const normalized = Array.from(new Set(skillCounts), normalizeSkillCount);
	return normalized.sort((a, b) => a - b);
}

function safeJsonStringify(value: unknown): string {
	try {
		return JSON.stringify(value) ?? "";
	} catch {
		return "[unserializable]";
	}
}

function countDiagnostics(diagnostics: Array<{ type: string }>): Record<string, number> {
	const counts = new Map<string, number>();
	for (const diagnostic of diagnostics) {
		counts.set(diagnostic.type, (counts.get(diagnostic.type) ?? 0) + 1);
	}
	return Object.fromEntries(Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right)));
}

async function reloadOffline(loader: DefaultResourceLoader): Promise<void> {
	const previousOffline = process.env.PI_OFFLINE;
	process.env.PI_OFFLINE = "1";
	try {
		await loader.reload();
	} finally {
		if (previousOffline === undefined) {
			delete process.env.PI_OFFLINE;
		} else {
			process.env.PI_OFFLINE = previousOffline;
		}
	}
}

/** Create stable synthetic metadata for representative collection measurements. */
export function createSyntheticSkillCollection(count: number): Skill[] {
	const normalizedCount = normalizeSkillCount(count);
	return Array.from({ length: normalizedCount }, (_, index) => {
		const skillDir = `/allforone-baseline/synthetic/skill-${String(index).padStart(4, "0")}`;
		const filePath = `${skillDir}/SKILL.md`;
		return {
			name: `synthetic-skill-${String(index).padStart(4, "0")}`,
			description: "Synthetic All-For-One baseline metadata entry.",
			filePath,
			baseDir: skillDir,
			sourceInfo: createSyntheticSourceInfo(filePath, {
				source: "allforone-baseline",
				baseDir: skillDir,
			}),
			disableModelInvocation: false,
		};
	});
}

/** Measure visible metadata without filtering or applying a production budget. */
export function measureSkillCollection(
	skills: readonly Skill[],
	contextWindows: readonly number[],
): AllForOneSkillCollectionMeasurement {
	const metadata = formatSkillsForPrompt(Array.from(skills), {
		maxChars: UNBOUNDED_BASELINE_SKILL_METADATA_CHARS,
	});
	const metadataTokensEstimate = estimateTextTokens(metadata);
	const referenceBudgets = normalizeContextWindows(contextWindows).map((contextWindow) => {
		const referenceTokenBudget = Math.floor(
			(contextWindow * CODEX_REFERENCE_METADATA_BUDGET_PERCENT) / 100,
		);
		return {
			contextWindow,
			referenceBudgetPercent: CODEX_REFERENCE_METADATA_BUDGET_PERCENT,
			referenceTokenBudget,
			fits: metadataTokensEstimate <= referenceTokenBudget,
		};
	});

	return {
		skillCount: skills.length,
		metadataChars: metadata.length,
		metadataBytes: Buffer.byteLength(metadata, "utf8"),
		metadataTokensEstimate,
		referenceBudgets,
		omittedSkills: [],
		budgetApplied: false,
	};
}

/** Collect the current built-in resource and prompt composition without changing runtime behavior. */
export async function collectAllForOneBaseline(options: AllForOneBaselineOptions): Promise<AllForOneBaselineReport> {
	const cwd = resolve(options.cwd);
	const agentDir = resolve(options.agentDir);
	const projectTrusted = options.projectTrusted ?? true;
	const contextWindows = normalizeContextWindows(options.contextWindows ?? DEFAULT_ALLFORONE_CONTEXT_WINDOWS);
	const syntheticSkillCounts = normalizeSkillCounts(
		options.syntheticSkillCounts ?? DEFAULT_ALLFORONE_SYNTHETIC_SKILL_COUNTS,
	);
	const includeSkills = options.includeSkills ?? true;
	const includeContextFiles = options.includeContextFiles ?? true;
	const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted });
	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		additionalSkillPaths: options.additionalSkillPaths ?? [],
		noExtensions: true,
		noPromptTemplates: true,
		noThemes: true,
		noSkills: !includeSkills,
		noContextFiles: !includeContextFiles,
	});

	await reloadOffline(resourceLoader);

	const loadedSkills = resourceLoader.getSkills();
	const skills = includeSkills ? loadedSkills.skills : [];
	const visibleSkills = skills.filter((skill) => !skill.disableModelInvocation);
	const skillMeasurement = measureSkillCollection(visibleSkills, contextWindows);
	const contextFiles = includeContextFiles ? resourceLoader.getAgentsFiles().agentsFiles : [];
	const contextFileMeasurements = contextFiles
		.map((file) => ({
			path: file.path,
			chars: file.content.length,
			bytes: Buffer.byteLength(file.content, "utf8"),
			tokensEstimate: estimateTextTokens(file.content),
		}))
		.sort((left, right) => left.path.localeCompare(right.path));
	const allContextChars = contextFileMeasurements.reduce((total, file) => total + file.chars, 0);
	const allContextBytes = contextFileMeasurements.reduce((total, file) => total + file.bytes, 0);
	const allContextTokens = contextFileMeasurements.reduce((total, file) => total + file.tokensEstimate, 0);

	const allToolDefinitions = createAllToolDefinitions(cwd);
	const activeToolDefinitions = createCodingToolDefinitions(cwd);
	const allToolNames = Object.keys(allToolDefinitions).sort((left, right) => left.localeCompare(right));
	const activeToolNames = activeToolDefinitions.map((definition) => definition.name);
	const activeToolSchema = activeToolDefinitions.map((definition) => ({
		name: definition.name,
		description: definition.description,
		parameters: definition.parameters,
	}));
	const activeToolSchemaText = safeJsonStringify(activeToolSchema);
	const activeToolPromptText = activeToolDefinitions
		.filter((definition) => definition.promptSnippet)
		.map((definition) => `- ${definition.name}: ${definition.promptSnippet}`)
		.join("\n");
	const toolSnippets = Object.fromEntries(
		activeToolDefinitions
			.filter((definition) => definition.promptSnippet)
			.map((definition) => [definition.name, definition.promptSnippet as string]),
	);
	const promptGuidelines = activeToolDefinitions.flatMap((definition) => definition.promptGuidelines ?? []);
	const appendSystemPrompt = resourceLoader.getAppendSystemPrompt();
	const systemPrompt = buildSystemPrompt({
		cwd,
		contextFiles,
		skills,
		selectedTools: activeToolNames,
		toolSnippets,
		promptGuidelines,
		customPrompt: resourceLoader.getSystemPrompt(),
		appendSystemPrompt: appendSystemPrompt.length > 0 ? appendSystemPrompt.join("\n\n") : undefined,
		skillMetadataBudget: { maxChars: UNBOUNDED_BASELINE_SKILL_METADATA_CHARS },
	});

	return {
		schemaVersion: 1,
		evaluationPlan: ALLFORONE_BASELINE_TASK_CATEGORIES.map((task) => ({
			...task,
			requiredMetrics: [...task.requiredMetrics],
		})),
		environment: {
			cwd,
			agentDir,
			projectTrusted,
			resourceLoading: "offline-read-only",
		},
		current: {
			skills: {
				discovered: skills.length,
				visible: visibleSkills.length,
				manualOnly: skills.length - visibleSkills.length,
				metadataChars: skillMeasurement.metadataChars,
				metadataBytes: skillMeasurement.metadataBytes,
				metadataTokensEstimate: skillMeasurement.metadataTokensEstimate,
				names: skills.map((skill) => skill.name).sort((left, right) => left.localeCompare(right)),
				diagnosticCounts: countDiagnostics(loadedSkills.diagnostics),
			},
			contextFiles: {
				count: contextFileMeasurements.length,
				totalChars: allContextChars,
				totalBytes: allContextBytes,
				totalTokensEstimate: allContextTokens,
				files: contextFileMeasurements,
			},
			tools: {
				allNames: allToolNames,
				activeNames: activeToolNames,
				activeSchemaChars: activeToolSchemaText.length,
				activeSchemaBytes: Buffer.byteLength(activeToolSchemaText, "utf8"),
				activeSchemaTokensEstimate: estimateTextTokens(activeToolSchemaText),
				activePromptChars: activeToolPromptText.length,
				activePromptBytes: Buffer.byteLength(activeToolPromptText, "utf8"),
				activePromptTokensEstimate: estimateTextTokens(activeToolPromptText),
			},
			systemPrompt: {
				source: resourceLoader.getSystemPrompt() ? "custom" : "built-in",
				appendSystemPromptCount: appendSystemPrompt.length,
				chars: systemPrompt.length,
				bytes: Buffer.byteLength(systemPrompt, "utf8"),
				tokensEstimate: estimateTextTokens(systemPrompt),
			},
		},
		skillCollections: syntheticSkillCounts.map((count) =>
			measureSkillCollection(createSyntheticSkillCollection(count), contextWindows),
		),
		limitations: [
			"Token counts use the repository's four-characters-per-token estimate, not provider tokenization.",
			"This baseline does not run live model tasks or measure correctness, latency, cost, compaction, or retry outcomes.",
			"This baseline command does not execute a live session, so tool-result raw bytes, repeated reads, follow-up retrieval, and truncation telemetry are outside its scope; the runtime exposes those measurements through AgentSession and /context.",
			"Extensions are not loaded or executed; the tool surface measures built-in tools only.",
			"No skill metadata budget is applied, so omittedSkills is always empty in All-For-One baseline.",
		],
	};
}

interface AllForOneCliOptions extends AllForOneBaselineOptions {
	json: boolean;
	help: boolean;
}

const ALLFORONE_USAGE = `Usage: npm run baseline:allforone -- [options]

Options:
  --cwd <path>                 Working directory for project resources (default: current directory)
  --agent-dir <path>           Agent resource directory (default: ~/.pi/agent)
  --skill-path <path>          Additional skill path, repeatable
  --context-window <tokens>    Representative context window, repeatable
  --skill-count <count>        Synthetic skill collection size, repeatable
  --no-skills                  Exclude discovered skills from the current snapshot
  --no-context-files           Exclude project instruction files from the current snapshot
  --json                       Print machine-readable JSON
  --help                       Show this help

Default context windows: ${DEFAULT_ALLFORONE_CONTEXT_WINDOWS.join(", ")}
Default synthetic skill counts: ${DEFAULT_ALLFORONE_SYNTHETIC_SKILL_COUNTS.join(", ")}
`;

function parseIntegerOption(value: string | undefined, flag: string, allowZero: boolean): number {
	if (value === undefined || value.length === 0) {
		throw new Error(`${flag} requires a value`);
	}
	const parsed = Number(value);
	const valid = Number.isInteger(parsed) && (allowZero ? parsed >= 0 : parsed > 0);
	if (!valid) {
		throw new Error(`${flag} requires a ${allowZero ? "non-negative" : "positive"} integer`);
	}
	return parsed;
}

function parseAllForOneCliArgs(argv: readonly string[]): AllForOneCliOptions {
	let cwd = process.cwd();
	let agentDir = getAgentDir();
	let json = false;
	let help = false;
	let includeSkills = true;
	let includeContextFiles = true;
	const additionalSkillPaths: string[] = [];
	const contextWindows: number[] = [];
	const syntheticSkillCounts: number[] = [];

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		switch (arg) {
			case "--help":
			case "-h":
				help = true;
				break;
			case "--json":
				json = true;
				break;
			case "--no-skills":
				includeSkills = false;
				break;
			case "--no-context-files":
				includeContextFiles = false;
				break;
			case "--cwd":
				cwd = argv[++index] ?? "";
				if (!cwd) throw new Error("--cwd requires a path");
				break;
			case "--agent-dir":
				agentDir = argv[++index] ?? "";
				if (!agentDir) throw new Error("--agent-dir requires a path");
				break;
			case "--skill-path":
				additionalSkillPaths.push(argv[++index] ?? "");
				if (!additionalSkillPaths.at(-1)) throw new Error("--skill-path requires a path");
				break;
			case "--context-window":
				contextWindows.push(parseIntegerOption(argv[++index], "--context-window", false));
				break;
			case "--skill-count":
				syntheticSkillCounts.push(parseIntegerOption(argv[++index], "--skill-count", true));
				break;
			default:
				throw new Error(`Unknown option: ${arg}`);
		}
	}

	return {
		cwd,
		agentDir,
		additionalSkillPaths: additionalSkillPaths.length > 0 ? additionalSkillPaths : undefined,
		includeSkills,
		includeContextFiles,
		contextWindows: contextWindows.length > 0 ? contextWindows : undefined,
		syntheticSkillCounts: syntheticSkillCounts.length > 0 ? syntheticSkillCounts : undefined,
		json,
		help,
	};
}

function formatBytes(bytes: number): string {
	return `${bytes.toLocaleString("en-US")} bytes`;
}

/** Format a compact human-readable baseline without exposing resource contents. */
export function formatAllForOneBaselineText(report: AllForOneBaselineReport): string {
	const lines = [
		"All-For-One baseline (offline, read-only)",
		"",
		"Environment:",
		`  cwd: ${report.environment.cwd}`,
		`  agentDir: ${report.environment.agentDir}`,
		`  projectTrusted: ${report.environment.projectTrusted}`,
		"",
		"Current skills:",
		`  discovered: ${report.current.skills.discovered}`,
		`  visible metadata: ${report.current.skills.visible}`,
		`  manual-only: ${report.current.skills.manualOnly}`,
		`  metadata: ${report.current.skills.metadataChars.toLocaleString("en-US")} chars / ${formatBytes(report.current.skills.metadataBytes)} / ${report.current.skills.metadataTokensEstimate.toLocaleString("en-US")} estimated tokens`,
		`  names: ${report.current.skills.names.length > 0 ? report.current.skills.names.join(", ") : "(none)"}`,
		`  diagnostics: ${JSON.stringify(report.current.skills.diagnosticCounts)}`,
		"",
		"Current project context:",
		`  files: ${report.current.contextFiles.count}`,
		`  content: ${report.current.contextFiles.totalChars.toLocaleString("en-US")} chars / ${formatBytes(report.current.contextFiles.totalBytes)} / ${report.current.contextFiles.totalTokensEstimate.toLocaleString("en-US")} estimated tokens`,
		...report.current.contextFiles.files.map(
			(file) => `  - ${file.path}: ${file.chars.toLocaleString("en-US")} chars / ${formatBytes(file.bytes)}`,
		),
		"",
		"Built-in tools:",
		`  registered: ${report.current.tools.allNames.join(", ")}`,
		`  active: ${report.current.tools.activeNames.join(", ")}`,
		`  active schema: ${report.current.tools.activeSchemaChars.toLocaleString("en-US")} chars / ${report.current.tools.activeSchemaTokensEstimate.toLocaleString("en-US")} estimated tokens`,
		`  active prompt snippets: ${report.current.tools.activePromptChars.toLocaleString("en-US")} chars / ${report.current.tools.activePromptTokensEstimate.toLocaleString("en-US")} estimated tokens`,
		"",
		"System prompt text:",
		`  source: ${report.current.systemPrompt.source}`,
		`  append prompts: ${report.current.systemPrompt.appendSystemPromptCount}`,
		`  size: ${report.current.systemPrompt.chars.toLocaleString("en-US")} chars / ${formatBytes(report.current.systemPrompt.bytes)} / ${report.current.systemPrompt.tokensEstimate.toLocaleString("en-US")} estimated tokens`,
		"",
		"Representative workload plan (live execution deferred):",
		...report.evaluationPlan.map((task) => `  - ${task.id}: ${task.description}`),
		"",
		"Synthetic skill collections (2% reference comparison only; no budget applied):",
		...report.skillCollections.map(
			(collection) =>
				`  ${collection.skillCount} skills: ${collection.metadataChars.toLocaleString("en-US")} chars / ${collection.metadataTokensEstimate.toLocaleString("en-US")} estimated tokens; ${collection.referenceBudgets.map((budget) => `${budget.contextWindow}=>${budget.referenceTokenBudget} (${budget.fits ? "fits" : "exceeds"})`).join(", ")}`,
		),
		"",
		"Limitations:",
		...report.limitations.map((limitation) => `  - ${limitation}`),
	];
	return `${lines.join("\n")}\n`;
}

export async function runAllForOneBaselineCli(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
	const options = parseAllForOneCliArgs(argv);
	if (options.help) {
		process.stdout.write(ALLFORONE_USAGE);
		return;
	}

	const report = await collectAllForOneBaseline(options);
	process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatAllForOneBaselineText(report));
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
	runAllForOneBaselineCli().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`allforone-baseline: ${message}`);
		process.exitCode = 1;
	});
}
