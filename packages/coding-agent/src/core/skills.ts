import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import ignore from "ignore";
import { basename, dirname, join, relative, resolve, sep } from "path";
import { CONFIG_DIR_NAME, getAgentDir } from "../config.ts";
import { parseFrontmatter } from "../utils/frontmatter.ts";
import { canonicalizePath, resolvePath } from "../utils/paths.ts";
import type { ResourceDiagnostic } from "./diagnostics.ts";
import { createSyntheticSourceInfo, type SourceInfo } from "./source-info.ts";

/** Max name length per spec */
const MAX_NAME_LENGTH = 64;

/** Max description length per spec */
const MAX_DESCRIPTION_LENGTH = 1024;

const IGNORE_FILE_NAMES = [".gitignore", ".ignore", ".fdignore"];

type IgnoreMatcher = ReturnType<typeof ignore>;

function toPosixPath(p: string): string {
	return p.split(sep).join("/");
}

function prefixIgnorePattern(line: string, prefix: string): string | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("#") && !trimmed.startsWith("\\#")) return null;

	let pattern = line;
	let negated = false;

	if (pattern.startsWith("!")) {
		negated = true;
		pattern = pattern.slice(1);
	} else if (pattern.startsWith("\\!")) {
		pattern = pattern.slice(1);
	}

	if (pattern.startsWith("/")) {
		pattern = pattern.slice(1);
	}

	const prefixed = prefix ? `${prefix}${pattern}` : pattern;
	return negated ? `!${prefixed}` : prefixed;
}

function addIgnoreRules(ig: IgnoreMatcher, dir: string, rootDir: string): void {
	const relativeDir = relative(rootDir, dir);
	const prefix = relativeDir ? `${toPosixPath(relativeDir)}/` : "";

	for (const filename of IGNORE_FILE_NAMES) {
		const ignorePath = join(dir, filename);
		if (!existsSync(ignorePath)) continue;
		try {
			const content = readFileSync(ignorePath, "utf-8");
			const patterns = content
				.split(/\r?\n/)
				.map((line) => prefixIgnorePattern(line, prefix))
				.filter((line): line is string => Boolean(line));
			if (patterns.length > 0) {
				ig.add(patterns);
			}
		} catch {}
	}
}

export interface SkillFrontmatter {
	name?: string;
	description?: string;
	"disable-model-invocation"?: boolean;
	[key: string]: unknown;
}

export interface Skill {
	name: string;
	description: string;
	filePath: string;
	baseDir: string;
	sourceInfo: SourceInfo;
	disableModelInvocation: boolean;
}

export interface LoadSkillsResult {
	skills: Skill[];
	diagnostics: ResourceDiagnostic[];
}

/**
 * Validate skill name per Agent Skills spec.
 * Returns array of validation error messages (empty if valid).
 */
function validateName(name: string): string[] {
	const errors: string[] = [];

	if (name.length > MAX_NAME_LENGTH) {
		errors.push(`name exceeds ${MAX_NAME_LENGTH} characters (${name.length})`);
	}

	if (!/^[a-z0-9-]+$/.test(name)) {
		errors.push(`name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`);
	}

	if (name.startsWith("-") || name.endsWith("-")) {
		errors.push(`name must not start or end with a hyphen`);
	}

	if (name.includes("--")) {
		errors.push(`name must not contain consecutive hyphens`);
	}

	return errors;
}

/**
 * Validate description per Agent Skills spec.
 */
function validateDescription(description: string | undefined): string[] {
	const errors: string[] = [];

	if (!description || description.trim() === "") {
		errors.push("description is required");
	} else if (description.length > MAX_DESCRIPTION_LENGTH) {
		errors.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${description.length})`);
	}

	return errors;
}

export interface LoadSkillsFromDirOptions {
	/** Directory to scan for skills */
	dir: string;
	/** Source identifier for these skills */
	source: string;
}

function createSkillSourceInfo(filePath: string, baseDir: string, source: string): SourceInfo {
	switch (source) {
		case "user":
			return createSyntheticSourceInfo(filePath, {
				source: "local",
				scope: "user",
				baseDir,
			});
		case "project":
			return createSyntheticSourceInfo(filePath, {
				source: "local",
				scope: "project",
				baseDir,
			});
		case "path":
			return createSyntheticSourceInfo(filePath, {
				source: "local",
				baseDir,
			});
		default:
			return createSyntheticSourceInfo(filePath, { source, baseDir });
	}
}

/**
 * Load skills from a directory.
 *
 * Discovery rules:
 * - if a directory contains SKILL.md, treat it as a skill root and do not recurse further
 * - otherwise, load direct .md children in the root
 * - recurse into subdirectories to find SKILL.md
 */
export function loadSkillsFromDir(options: LoadSkillsFromDirOptions): LoadSkillsResult {
	const { dir, source } = options;
	return loadSkillsFromDirInternal(dir, source, true);
}

function loadSkillsFromDirInternal(
	dir: string,
	source: string,
	includeRootFiles: boolean,
	ignoreMatcher?: IgnoreMatcher,
	rootDir?: string,
): LoadSkillsResult {
	const skills: Skill[] = [];
	const diagnostics: ResourceDiagnostic[] = [];

	if (!existsSync(dir)) {
		return { skills, diagnostics };
	}

	const root = rootDir ?? dir;
	const ig = ignoreMatcher ?? ignore();
	addIgnoreRules(ig, dir, root);

	try {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.name !== "SKILL.md") {
				continue;
			}

			const fullPath = join(dir, entry.name);

			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					isFile = statSync(fullPath).isFile();
				} catch {
					continue;
				}
			}

			const relPath = toPosixPath(relative(root, fullPath));
			if (!isFile || ig.ignores(relPath)) {
				continue;
			}

			const result = loadSkillFromFile(fullPath, source);
			if (result.skill) {
				skills.push(result.skill);
			}
			diagnostics.push(...result.diagnostics);
			return { skills, diagnostics };
		}

		for (const entry of entries) {
			if (entry.name.startsWith(".")) {
				continue;
			}

			// Skip node_modules to avoid scanning dependencies
			if (entry.name === "node_modules") {
				continue;
			}

			const fullPath = join(dir, entry.name);

			// For symlinks, check if they point to a directory and follow them
			let isDirectory = entry.isDirectory();
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					const stats = statSync(fullPath);
					isDirectory = stats.isDirectory();
					isFile = stats.isFile();
				} catch {
					// Broken symlink, skip it
					continue;
				}
			}

			const relPath = toPosixPath(relative(root, fullPath));
			const ignorePath = isDirectory ? `${relPath}/` : relPath;
			if (ig.ignores(ignorePath)) {
				continue;
			}

			if (isDirectory) {
				const subResult = loadSkillsFromDirInternal(fullPath, source, false, ig, root);
				skills.push(...subResult.skills);
				diagnostics.push(...subResult.diagnostics);
				continue;
			}

			if (!isFile || !includeRootFiles || !entry.name.endsWith(".md")) {
				continue;
			}

			const result = loadSkillFromFile(fullPath, source);
			if (result.skill) {
				skills.push(result.skill);
			}
			diagnostics.push(...result.diagnostics);
		}
	} catch {}

	return { skills, diagnostics };
}

function loadSkillFromFile(
	filePath: string,
	source: string,
): { skill: Skill | null; diagnostics: ResourceDiagnostic[] } {
	const diagnostics: ResourceDiagnostic[] = [];

	try {
		const rawContent = readFileSync(filePath, "utf-8");
		const { frontmatter } = parseFrontmatter<SkillFrontmatter>(rawContent);
		const skillDir = dirname(filePath);
		const parentDirName = basename(skillDir);

		// Validate description
		const descErrors = validateDescription(frontmatter.description);
		for (const error of descErrors) {
			diagnostics.push({ type: "warning", message: error, path: filePath });
		}

		// Use name from frontmatter, or fall back to parent directory name
		const name = frontmatter.name || parentDirName;

		// Validate name
		const nameErrors = validateName(name);
		for (const error of nameErrors) {
			diagnostics.push({ type: "warning", message: error, path: filePath });
		}

		// Still load the skill even with warnings (unless description is completely missing)
		if (!frontmatter.description || frontmatter.description.trim() === "") {
			return { skill: null, diagnostics };
		}

		return {
			skill: {
				name,
				description: frontmatter.description,
				filePath,
				baseDir: skillDir,
				sourceInfo: createSkillSourceInfo(filePath, skillDir, source),
				disableModelInvocation: frontmatter["disable-model-invocation"] === true,
			},
			diagnostics,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to parse skill file";
		diagnostics.push({ type: "warning", message, path: filePath });
		return { skill: null, diagnostics };
	}
}

/** Initial fixed character cap used when no explicit budget is configured. */
export const DEFAULT_SKILL_METADATA_MAX_CHARS = 8_000;

export interface SkillMetadataBudgetOptions {
	/** Maximum characters for the complete model-visible skills section. */
	maxChars?: number;
	/** Optional percentage of the model context window to use for skill metadata. */
	maxContextPercent?: number;
	/** Model context window in tokens, required when maxContextPercent is used. */
	contextWindow?: number;
}

export type SkillMetadataBudgetSource = "default" | "maxChars" | "maxContextPercent";

export interface SkillMetadataDiagnostics {
	discoveredCount: number;
	visibleCount: number;
	manualOnlyCount: number;
	renderedCount: number;
	omittedCount: number;
	truncatedDescriptionCount: number;
	metadataChars: number;
	metadataBytes: number;
	budgetChars: number;
	budgetUsedChars: number;
	budgetSource: SkillMetadataBudgetSource;
	duplicateNames: string[];
	duplicatePaths: string[];
	omittedSkills: string[];
}

export interface FormattedSkillsForPrompt {
	prompt: string;
	diagnostics: SkillMetadataDiagnostics;
}

function normalizeNonNegativeInteger(value: number | undefined): number | undefined {
	if (value === undefined || !Number.isFinite(value) || value < 0) {
		return undefined;
	}
	return Math.floor(value);
}

function normalizeContextPercentage(value: number | undefined): number | undefined {
	if (value === undefined || !Number.isFinite(value) || value <= 0 || value > 100) {
		return undefined;
	}
	return value;
}

function resolveSkillMetadataBudget(options: SkillMetadataBudgetOptions): {
	maxChars: number;
	source: SkillMetadataBudgetSource;
} {
	const explicitMaxChars = normalizeNonNegativeInteger(options.maxChars);
	if (explicitMaxChars !== undefined) {
		return { maxChars: explicitMaxChars, source: "maxChars" };
	}

	const contextWindow = normalizeNonNegativeInteger(options.contextWindow);
	const contextPercent = normalizeContextPercentage(options.maxContextPercent);
	if (contextWindow !== undefined && contextWindow > 0 && contextPercent !== undefined) {
		return {
			maxChars: Math.floor((contextWindow * contextPercent * 4) / 100),
			source: "maxContextPercent",
		};
	}

	return { maxChars: DEFAULT_SKILL_METADATA_MAX_CHARS, source: "default" };
}

function renderSkillEntry(skill: Skill, includeDescription: boolean): string[] {
	return [
		"  <skill>",
		`    <name>${escapeXml(skill.name)}</name>`,
		`    <description>${includeDescription ? escapeXml(skill.description) : ""}</description>`,
		`    <location>${escapeXml(skill.filePath)}</location>`,
		"  </skill>",
	];
}

function renderSkillsPrompt(
	entries: Array<{ skill: Skill; includeDescription: boolean }>,
	omittedCount: number,
	includeNotice: boolean,
): string {
	const lines = [
		"\n\nThe following skills provide specialized instructions for specific tasks.",
		"Use the read tool to load a skill's file when the task matches its description.",
		"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
		"",
		"<available_skills>",
	];

	for (const entry of entries) {
		lines.push(...renderSkillEntry(entry.skill, entry.includeDescription));
	}

	if (includeNotice && omittedCount > 0) {
		const skillWord = omittedCount === 1 ? "skill" : "skills";
		lines.push(
			`  <metadata_notice>${omittedCount} ${skillWord} omitted because the configured skill metadata budget was reached.</metadata_notice>`,
		);
	}

	lines.push("</available_skills>");
	return lines.join("\n");
}

function renderCompactSkillsPrompt(skills: Skill[], omittedCount: number, includeNotice: boolean): string {
	const lines = ["\n\n<available_skills>"];

	for (const skill of skills) {
		lines.push(
			`  <skill><name>${escapeXml(skill.name)}</name><location>${escapeXml(skill.filePath)}</location></skill>`,
		);
	}

	if (includeNotice && omittedCount > 0) {
		const skillWord = omittedCount === 1 ? "skill" : "skills";
		lines.push(
			`  <metadata_notice>${omittedCount} ${skillWord} omitted due to the metadata budget.</metadata_notice>`,
		);
	}

	lines.push("</available_skills>");
	return lines.join("\n");
}

function dedupeVisibleSkills(skills: Skill[]): {
	visibleSkills: Skill[];
	manualOnlyCount: number;
	duplicateNames: string[];
	duplicatePaths: string[];
} {
	const manualOnlyCount = skills.filter((skill) => skill.disableModelInvocation).length;
	const candidates = skills
		.filter((skill) => !skill.disableModelInvocation)
		.sort((left, right) => {
			const nameOrder = left.name.localeCompare(right.name);
			if (nameOrder !== 0) return nameOrder;
			return canonicalizePath(left.filePath).localeCompare(canonicalizePath(right.filePath));
		});

	const visibleSkills: Skill[] = [];
	const names = new Set<string>();
	const paths = new Set<string>();
	const duplicateNames = new Set<string>();
	const duplicatePaths = new Set<string>();

	for (const skill of candidates) {
		const canonicalPath = canonicalizePath(skill.filePath);
		if (names.has(skill.name)) {
			duplicateNames.add(skill.name);
		}
		if (paths.has(canonicalPath)) {
			duplicatePaths.add(canonicalPath);
		}
		if (names.has(skill.name) || paths.has(canonicalPath)) {
			continue;
		}
		names.add(skill.name);
		paths.add(canonicalPath);
		visibleSkills.push(skill);
	}

	return {
		visibleSkills,
		manualOnlyCount,
		duplicateNames: [...duplicateNames].sort(),
		duplicatePaths: [...duplicatePaths].sort(),
	};
}

/**
 * Format skills for inclusion in a system prompt and report the effective
 * metadata budget. Skills with disableModelInvocation=true remain available
 * for explicit /skill:name commands but are not model-visible.
 */
export function formatSkillsForPromptWithDiagnostics(
	skills: Skill[],
	options: SkillMetadataBudgetOptions = {},
): FormattedSkillsForPrompt {
	const budget = resolveSkillMetadataBudget(options);
	const { visibleSkills, manualOnlyCount, duplicateNames, duplicatePaths } = dedupeVisibleSkills(skills);
	const emptyDiagnostics: SkillMetadataDiagnostics = {
		discoveredCount: skills.length,
		visibleCount: visibleSkills.length,
		manualOnlyCount,
		renderedCount: 0,
		omittedCount: 0,
		truncatedDescriptionCount: 0,
		metadataChars: 0,
		metadataBytes: 0,
		budgetChars: budget.maxChars,
		budgetUsedChars: 0,
		budgetSource: budget.source,
		duplicateNames,
		duplicatePaths,
		omittedSkills: [],
	};

	if (visibleSkills.length === 0) {
		return { prompt: "", diagnostics: emptyDiagnostics };
	}

	if (budget.maxChars === 0) {
		const omittedSkills = visibleSkills.map((skill) => skill.name).sort();
		return {
			prompt: "",
			diagnostics: {
				...emptyDiagnostics,
				omittedCount: omittedSkills.length,
				omittedSkills,
			},
		};
	}

	const fullEntries = visibleSkills.map((skill) => ({ skill, includeDescription: true }));
	const fullPrompt = renderSkillsPrompt(fullEntries, 0, false);
	if (fullPrompt.length <= budget.maxChars) {
		return {
			prompt: fullPrompt,
			diagnostics: {
				...emptyDiagnostics,
				renderedCount: visibleSkills.length,
				metadataChars: fullPrompt.length,
				metadataBytes: Buffer.byteLength(fullPrompt, "utf8"),
				budgetUsedChars: fullPrompt.length,
			},
		};
	}

	const included: Array<{ skill: Skill; includeDescription: boolean }> = [];
	const omittedSkills: string[] = [];
	let truncatedDescriptionCount = 0;

	for (const skill of visibleSkills) {
		const fullEntry = [...included, { skill, includeDescription: true }];
		if (renderSkillsPrompt(fullEntry, 0, false).length <= budget.maxChars) {
			included.push({ skill, includeDescription: true });
			continue;
		}

		const minimumEntry = [...included, { skill, includeDescription: false }];
		if (renderSkillsPrompt(minimumEntry, 0, false).length <= budget.maxChars) {
			included.push({ skill, includeDescription: false });
			truncatedDescriptionCount += 1;
		} else {
			omittedSkills.push(skill.name);
		}
	}

	let prompt = renderSkillsPrompt(included, omittedSkills.length, true);
	while (prompt.length > budget.maxChars && included.length > 0) {
		const removed = included.pop();
		if (!removed) break;
		omittedSkills.push(removed.skill.name);
		if (!removed.includeDescription) {
			truncatedDescriptionCount -= 1;
		}
		prompt = renderSkillsPrompt(included, omittedSkills.length, true);
	}

	if (prompt.length > budget.maxChars) {
		prompt = renderSkillsPrompt(included, omittedSkills.length, false);
		if (prompt.length > budget.maxChars) {
			prompt = "";
		}
	}

	if (prompt.length > budget.maxChars || prompt.length === 0 || (included.length === 0 && omittedSkills.length > 0)) {
		const compactIncluded: Skill[] = [];
		const compactOmittedSkills: string[] = [];

		for (const skill of visibleSkills) {
			const candidate = renderCompactSkillsPrompt([...compactIncluded, skill], 0, false);
			if (candidate.length <= budget.maxChars) {
				compactIncluded.push(skill);
			} else {
				compactOmittedSkills.push(skill.name);
			}
		}

		let compactPrompt = renderCompactSkillsPrompt(compactIncluded, compactOmittedSkills.length, true);
		while (compactPrompt.length > budget.maxChars && compactIncluded.length > 0) {
			const removed = compactIncluded.pop();
			if (!removed) break;
			compactOmittedSkills.push(removed.name);
			compactPrompt = renderCompactSkillsPrompt(compactIncluded, compactOmittedSkills.length, true);
		}

		if (compactPrompt.length <= budget.maxChars) {
			prompt = compactPrompt;
			omittedSkills.length = 0;
			omittedSkills.push(...compactOmittedSkills);
			truncatedDescriptionCount = compactIncluded.filter((skill) => skill.description.length > 0).length;
			included.length = 0;
			included.push(...compactIncluded.map((skill) => ({ skill, includeDescription: false })));
		} else {
			const compactPromptWithoutNotice = renderCompactSkillsPrompt(compactIncluded, 0, false);
			if (compactPromptWithoutNotice.length <= budget.maxChars) {
				prompt = compactPromptWithoutNotice;
				omittedSkills.length = 0;
				omittedSkills.push(...compactOmittedSkills);
				truncatedDescriptionCount = compactIncluded.filter((skill) => skill.description.length > 0).length;
				included.length = 0;
				included.push(...compactIncluded.map((skill) => ({ skill, includeDescription: false })));
			}
		}
	}

	omittedSkills.sort();
	return {
		prompt,
		diagnostics: {
			...emptyDiagnostics,
			renderedCount: included.length,
			omittedCount: omittedSkills.length,
			truncatedDescriptionCount,
			metadataChars: prompt.length,
			metadataBytes: Buffer.byteLength(prompt, "utf8"),
			budgetUsedChars: prompt.length,
			omittedSkills,
		},
	};
}

/** Format skills for inclusion in a system prompt. */
export function formatSkillsForPrompt(skills: Skill[], options?: SkillMetadataBudgetOptions): string {
	return formatSkillsForPromptWithDiagnostics(skills, options).prompt;
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export interface LoadSkillsOptions {
	/** Working directory for project-local skills. */
	cwd: string;
	/** Agent config directory for global skills. */
	agentDir: string;
	/** Explicit skill paths (files or directories) */
	skillPaths: string[];
	/** Include default skills directories. */
	includeDefaults: boolean;
}

/**
 * Load skills from all configured locations.
 * Returns skills and any validation diagnostics.
 */
export function loadSkills(options: LoadSkillsOptions): LoadSkillsResult {
	const { agentDir, skillPaths, includeDefaults } = options;

	// Resolve agentDir - if not provided, use default from config
	const resolvedCwd = resolvePath(options.cwd);
	const resolvedAgentDir = resolvePath(agentDir ?? getAgentDir());

	const skillMap = new Map<string, Skill>();
	const realPathSet = new Set<string>();
	const allDiagnostics: ResourceDiagnostic[] = [];
	const collisionDiagnostics: ResourceDiagnostic[] = [];

	function addSkills(result: LoadSkillsResult) {
		allDiagnostics.push(...result.diagnostics);
		const orderedSkills = [...result.skills].sort((left, right) => {
			const nameOrder = left.name.localeCompare(right.name);
			if (nameOrder !== 0) return nameOrder;
			return canonicalizePath(left.filePath).localeCompare(canonicalizePath(right.filePath));
		});
		for (const skill of orderedSkills) {
			// Resolve symlinks to detect duplicate files
			const realPath = canonicalizePath(skill.filePath);

			// Skip silently if we've already loaded this exact file (via symlink)
			if (realPathSet.has(realPath)) {
				continue;
			}

			const existing = skillMap.get(skill.name);
			if (existing) {
				collisionDiagnostics.push({
					type: "collision",
					message: `name "${skill.name}" collision`,
					path: skill.filePath,
					collision: {
						resourceType: "skill",
						name: skill.name,
						winnerPath: existing.filePath,
						loserPath: skill.filePath,
					},
				});
			} else {
				skillMap.set(skill.name, skill);
				realPathSet.add(realPath);
			}
		}
	}

	const userSkillsDir = join(resolvedAgentDir, "skills");
	const projectSkillsDir = resolve(resolvedCwd, CONFIG_DIR_NAME, "skills");

	const isUnderPath = (target: string, root: string): boolean => {
		const normalizedRoot = resolve(root);
		if (target === normalizedRoot) {
			return true;
		}
		const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
		return target.startsWith(prefix);
	};

	const getSource = (resolvedPath: string): "user" | "project" | "path" => {
		if (!includeDefaults) {
			if (isUnderPath(resolvedPath, userSkillsDir)) return "user";
			if (isUnderPath(resolvedPath, projectSkillsDir)) return "project";
		}
		return "path";
	};

	for (const rawPath of skillPaths) {
		const resolvedPath = resolvePath(rawPath, resolvedCwd, { trim: true });
		if (!existsSync(resolvedPath)) {
			allDiagnostics.push({ type: "warning", message: "skill path does not exist", path: resolvedPath });
			continue;
		}

		try {
			const stats = statSync(resolvedPath);
			const source = getSource(resolvedPath);
			if (stats.isDirectory()) {
				addSkills(loadSkillsFromDirInternal(resolvedPath, source, true));
			} else if (stats.isFile() && resolvedPath.endsWith(".md")) {
				const result = loadSkillFromFile(resolvedPath, source);
				if (result.skill) {
					addSkills({ skills: [result.skill], diagnostics: result.diagnostics });
				} else {
					allDiagnostics.push(...result.diagnostics);
				}
			} else {
				allDiagnostics.push({ type: "warning", message: "skill path is not a markdown file", path: resolvedPath });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "failed to read skill path";
			allDiagnostics.push({ type: "warning", message, path: resolvedPath });
		}
	}

	// Explicit skill paths are invocation-scoped and must win over default user/project skills.
	// Among defaults, project-local skills take precedence over user-global skills.
	if (includeDefaults) {
		addSkills(loadSkillsFromDirInternal(resolve(resolvedCwd, CONFIG_DIR_NAME, "skills"), "project", true));
		addSkills(loadSkillsFromDirInternal(join(resolvedAgentDir, "skills"), "user", true));
	}

	return {
		skills: Array.from(skillMap.values()),
		diagnostics: [...allDiagnostics, ...collisionDiagnostics],
	};
}
