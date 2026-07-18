import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ValidationCommandKind = "check" | "typecheck" | "lint" | "test" | "build";
export type ValidationCommandConfidence = "verified" | "inferred";
export type NodePackageManager = "npm" | "pnpm" | "bun" | "yarn";
export type ValidationExecutionKind = "local" | "custom" | "remote";
export type ValidationGuidanceMode = "off" | "observe" | "enforce";

export interface ValidationExecutionProvenance {
	requestedCommand: string;
	executedCommand: string;
	cwd: string;
	executionKind: ValidationExecutionKind;
	exitCode: number | null;
}

export interface ValidationCommand {
	kind: ValidationCommandKind;
	/** Human-readable command retained for compatibility and display. */
	command: string;
	/** Executable passed directly to spawn without shell parsing. */
	program?: string;
	/** Arguments passed directly to the executable. */
	args?: string[];
	confidence: ValidationCommandConfidence;
	source: string;
}

export interface ValidationCommandDiscovery {
	ecosystems: string[];
	packageManager?: NodePackageManager;
	packageManagers?: NodePackageManager[];
	commands: ValidationCommand[];
}

export type ValidationCommandMatchScope = "exact" | "targeted-unverified";

export interface ValidationCommandMatch {
	command: ValidationCommand;
	scope: ValidationCommandMatchScope;
}

export const VALIDATION_DISCOVERY_INPUT_FILES = [
	"package.json",
	"package-lock.json",
	"npm-shrinkwrap.json",
	"pnpm-lock.yaml",
	"bun.lock",
	"bun.lockb",
	"yarn.lock",
	"pyproject.toml",
	"requirements.txt",
	"setup.py",
	"tox.ini",
	"poetry.lock",
	"Pipfile.lock",
	"uv.lock",
	"Cargo.toml",
	"Cargo.lock",
	"go.mod",
	"go.sum",
	"Makefile",
] as const;

const PACKAGE_MANAGER_ORDER: NodePackageManager[] = ["npm", "pnpm", "bun", "yarn"];
export const MAX_VALIDATION_PROMPT_COMMANDS = 4;
export const MAX_VALIDATION_PROMPT_CHARS = 800;

const NODE_SCRIPT_KINDS: Array<{ kind: ValidationCommandKind; names: string[] }> = [
	{ kind: "check", names: ["check"] },
	{ kind: "typecheck", names: ["typecheck", "type-check", "check:types"] },
	{ kind: "lint", names: ["lint"] },
	{ kind: "test", names: ["test"] },
	{ kind: "build", names: ["build"] },
];

function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf-8");
	} catch {
		return undefined;
	}
}

function createValidationCommand(
	kind: ValidationCommandKind,
	program: string,
	args: string[],
	confidence: ValidationCommandConfidence,
	source: string,
): ValidationCommand {
	return {
		kind,
		command: [program, ...args].join(" "),
		program,
		args,
		confidence,
		source,
	};
}

function addCommand(commands: ValidationCommand[], command: ValidationCommand): void {
	if (!commands.some((existing) => existing.command === command.command)) {
		commands.push(command);
	}
}

function detectPackageManagers(cwd: string, packageManagerField: unknown): NodePackageManager[] {
	const managers = new Set<NodePackageManager>();
	if (typeof packageManagerField === "string") {
		const name = packageManagerField.split("@")[0];
		if (PACKAGE_MANAGER_ORDER.includes(name as NodePackageManager)) {
			managers.add(name as NodePackageManager);
		}
	}

	const lockfiles: Array<[NodePackageManager, string[]]> = [
		["npm", ["package-lock.json", "npm-shrinkwrap.json"]],
		["pnpm", ["pnpm-lock.yaml"]],
		["bun", ["bun.lock", "bun.lockb"]],
		["yarn", ["yarn.lock"]],
	];
	for (const [manager, files] of lockfiles) {
		if (files.some((file) => existsSync(join(cwd, file)))) managers.add(manager);
	}
	return PACKAGE_MANAGER_ORDER.filter((manager) => managers.has(manager));
}

function nodeScriptInvocation(manager: NodePackageManager, script: string): { program: string; args: string[] } {
	if (script === "test") {
		if (manager === "npm") return { program: "npm", args: ["test"] };
		if (manager === "bun") return { program: "bun", args: ["run", "test"] };
		return { program: manager, args: ["test"] };
	}
	return { program: manager, args: ["run", script] };
}

function discoverNode(
	cwd: string,
	ecosystems: string[],
	commands: ValidationCommand[],
): {
	packageManager?: NodePackageManager;
	packageManagers?: NodePackageManager[];
} {
	const packageJsonPath = join(cwd, "package.json");
	const packageJsonText = readText(packageJsonPath);
	if (packageJsonText === undefined) return {};
	ecosystems.push("node");

	let packageJson: { packageManager?: unknown; scripts?: unknown } = {};
	try {
		packageJson = JSON.parse(packageJsonText) as { packageManager?: unknown; scripts?: unknown };
	} catch {
		return {};
	}

	const packageManagers = detectPackageManagers(cwd, packageJson.packageManager);
	if (packageManagers.length !== 1) {
		return packageManagers.length > 0 ? { packageManagers } : {};
	}
	const packageManager = packageManagers[0];
	const scripts =
		typeof packageJson.scripts === "object" && packageJson.scripts !== null
			? (packageJson.scripts as Record<string, unknown>)
			: {};

	for (const { kind, names } of NODE_SCRIPT_KINDS) {
		const script = names.find((name) => typeof scripts[name] === "string" && scripts[name].trim().length > 0);
		if (!script) continue;
		const body = scripts[script] as string;
		if (script === "test" && /Error: no test specified/i.test(body)) continue;
		const invocation = nodeScriptInvocation(packageManager, script);
		addCommand(
			commands,
			createValidationCommand(
				kind,
				invocation.program,
				invocation.args,
				"verified",
				`package.json#scripts.${script}`,
			),
		);
	}

	return { packageManager, packageManagers };
}

function discoverPython(cwd: string, ecosystems: string[], commands: ValidationCommand[]): void {
	const pythonFiles = ["pyproject.toml", "requirements.txt", "setup.py", "tox.ini"];
	if (!pythonFiles.some((file) => existsSync(join(cwd, file)))) return;
	ecosystems.push("python");

	const pyproject = readText(join(cwd, "pyproject.toml")) ?? "";
	const requirements = readText(join(cwd, "requirements.txt")) ?? "";
	if (/^\[tool\.mypy(?:\.|\])/m.test(pyproject) || /^mypy(?:\W|$)/im.test(requirements)) {
		addCommand(
			commands,
			createValidationCommand(
				"typecheck",
				"python",
				["-m", "mypy", "."],
				"inferred",
				pyproject.includes("[tool.mypy") ? "pyproject.toml" : "requirements.txt",
			),
		);
	}
	if (/^\[tool\.ruff(?:\.|\])/m.test(pyproject) || /^ruff(?:\W|$)/im.test(requirements)) {
		addCommand(
			commands,
			createValidationCommand(
				"lint",
				"python",
				["-m", "ruff", "check", "."],
				"inferred",
				pyproject.includes("[tool.ruff") ? "pyproject.toml" : "requirements.txt",
			),
		);
	}
	if (/^\[tool\.pytest(?:\.|\])/m.test(pyproject) || /^pytest(?:\W|$)/im.test(requirements)) {
		addCommand(
			commands,
			createValidationCommand(
				"test",
				"python",
				["-m", "pytest"],
				"inferred",
				pyproject.includes("[tool.pytest") ? "pyproject.toml" : "requirements.txt",
			),
		);
	}
	if (existsSync(join(cwd, "tox.ini"))) {
		addCommand(commands, createValidationCommand("test", "python", ["-m", "tox"], "inferred", "tox.ini"));
	}
}

function discoverRustAndGo(cwd: string, ecosystems: string[], commands: ValidationCommand[]): void {
	if (existsSync(join(cwd, "Cargo.toml"))) {
		ecosystems.push("rust");
		commands.push(
			createValidationCommand("check", "cargo", ["check"], "inferred", "Cargo.toml"),
			createValidationCommand("test", "cargo", ["test"], "inferred", "Cargo.toml"),
		);
	}
	if (existsSync(join(cwd, "go.mod"))) {
		ecosystems.push("go");
		commands.push(createValidationCommand("test", "go", ["test", "./..."], "inferred", "go.mod"));
	}
}

function discoverMake(cwd: string, ecosystems: string[], commands: ValidationCommand[]): void {
	const makefile = readText(join(cwd, "Makefile"));
	if (makefile === undefined) return;
	ecosystems.push("make");
	for (const { kind, names } of NODE_SCRIPT_KINDS) {
		const target = names.find((name) =>
			new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`, "m").test(makefile),
		);
		if (!target) continue;
		addCommand(commands, createValidationCommand(kind, "make", [target], "verified", `Makefile#${target}`));
	}
}

function discoverValidationCommandsNow(cwd: string): ValidationCommandDiscovery {
	const ecosystems: string[] = [];
	const commands: ValidationCommand[] = [];
	const node = discoverNode(cwd, ecosystems, commands);
	discoverPython(cwd, ecosystems, commands);
	discoverRustAndGo(cwd, ecosystems, commands);
	discoverMake(cwd, ecosystems, commands);
	return { ecosystems, ...node, commands };
}

/**
 * Create a memoized validation-discovery view that performs no repository I/O
 * until a consumer reads one of its fields.
 */
export function createLazyValidationCommandDiscovery(
	load: () => ValidationCommandDiscovery,
): ValidationCommandDiscovery {
	let resolved: ValidationCommandDiscovery | undefined;
	const getResolved = (): ValidationCommandDiscovery => {
		if (resolved === undefined) resolved = load();
		return resolved;
	};
	return {
		get ecosystems() {
			return getResolved().ecosystems;
		},
		get packageManager() {
			return getResolved().packageManager;
		},
		get packageManagers() {
			return getResolved().packageManagers;
		},
		get commands() {
			return getResolved().commands;
		},
	};
}

export function discoverValidationCommands(cwd: string): ValidationCommandDiscovery {
	return createLazyValidationCommandDiscovery(() => discoverValidationCommandsNow(cwd));
}

function normalizeCommandWhitespace(command: string): string {
	return command.trim().replace(/\s+/g, " ");
}

function containsShellControlSyntax(command: string): boolean {
	return /[;&|<>`\r\n]/.test(command) || /\$\(/.test(command);
}

function containsNonValidatingTestFlag(command: string): boolean {
	return /(?:^|\s)--(?:help|list|collect-only|dry-run)(?:\s|$)/.test(command);
}

/**
 * Match an executed command only against commands already grounded in repository discovery.
 * This intentionally accepts no shell grammar and only permits targeted suffixes for tests.
 */
export function matchValidationCommandWithScope(
	command: string,
	discovery: ValidationCommandDiscovery,
): ValidationCommandMatch | undefined {
	if (!command.trim() || containsShellControlSyntax(command)) return undefined;

	const normalizedCommand = normalizeCommandWhitespace(command);
	const exactMatches = discovery.commands.filter(
		(candidate) => normalizeCommandWhitespace(candidate.command) === normalizedCommand,
	);
	if (exactMatches.length === 1) return { command: exactMatches[0], scope: "exact" };
	if (exactMatches.length > 1) return undefined;
	if (containsNonValidatingTestFlag(normalizedCommand)) return undefined;

	const targetedMatches = discovery.commands.filter((candidate) => {
		if (candidate.kind !== "test") return false;
		const normalizedCandidate = normalizeCommandWhitespace(candidate.command);
		return normalizedCommand.startsWith(`${normalizedCandidate} `);
	});
	return targetedMatches.length === 1 ? { command: targetedMatches[0], scope: "targeted-unverified" } : undefined;
}

export function matchValidationCommand(
	command: string,
	discovery: ValidationCommandDiscovery,
): ValidationCommand | undefined {
	return matchValidationCommandWithScope(command, discovery)?.command;
}

export function fingerprintValidationCommandDiscovery(discovery: ValidationCommandDiscovery): string {
	return JSON.stringify({
		ecosystems: [...discovery.ecosystems].sort(),
		packageManager: discovery.packageManager,
		packageManagers: discovery.packageManagers ? [...discovery.packageManagers].sort() : undefined,
		commands: discovery.commands
			.map(({ kind, command, program, args, confidence, source }) => ({
				kind,
				command,
				program,
				args,
				confidence,
				source,
			}))
			.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
	});
}

export function getProjectValidationPromptGuideline(
	cwd: string,
	toolNames: string[],
	mode: ValidationGuidanceMode = "off",
	discovery = discoverValidationCommands(cwd),
): string | undefined {
	if (!toolNames.includes("bash") || mode === "off") return undefined;
	const commands = discovery.commands;
	if (commands.length === 0) return undefined;
	const rendered = commands
		.slice(0, MAX_VALIDATION_PROMPT_COMMANDS)
		.map((command) => (command.confidence === "inferred" ? `${command.command} (inferred)` : command.command));
	const guideline =
		mode === "observe"
			? `Validation hint: if you run one project check, prefer ${rendered[0]}. Repository discovery is advisory only.`
			: `Project validation commands detected from repository files (up to ${MAX_VALIDATION_PROMPT_COMMANDS} grounded entries): ${rendered.join(", ")}. These are repository-provided suggestions, not safety-approved commands; existing command policy still applies.`;
	return guideline.slice(0, MAX_VALIDATION_PROMPT_CHARS);
}
