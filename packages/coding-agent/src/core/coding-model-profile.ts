import type { ToolExecutionMode } from "@earendil-works/pi-agent-core";

export type MutationStrategy = "edit" | "apply_patch";
export type ToolProfile = "native" | "patch" | "full";

export interface CodingModelProfile {
	mutationStrategy: MutationStrategy;
	toolExecution: ToolExecutionMode;
}

export type CodingModelProfileOverride = Partial<CodingModelProfile>;

export interface CodingModelIdentity {
	provider: string;
	id: string;
}

export const DEFAULT_CODING_MODEL_PROFILE: CodingModelProfile = {
	mutationStrategy: "edit",
	toolExecution: "parallel",
};

const TOOL_PROFILE_TOOL_NAMES: Record<ToolProfile, readonly string[]> = {
	native: ["read", "bash", "edit", "write"],
	patch: ["read", "bash", "apply_patch", "write"],
	full: ["read", "bash", "edit", "write", "apply_patch"],
};

export function isMutationStrategy(value: unknown): value is MutationStrategy {
	return value === "edit" || value === "apply_patch";
}

export function isToolExecutionMode(value: unknown): value is ToolExecutionMode {
	return value === "sequential" || value === "parallel";
}

export function isToolProfile(value: unknown): value is ToolProfile {
	return value === "native" || value === "patch" || value === "full";
}

export function getToolNamesForProfile(profile: ToolProfile): string[] {
	return [...TOOL_PROFILE_TOOL_NAMES[profile]];
}

export function toolProfileForMutationStrategy(strategy: MutationStrategy): Exclude<ToolProfile, "full"> {
	return strategy === "apply_patch" ? "patch" : "native";
}

/**
 * The current pi-ai catalog has no coding-behavior metadata. Keep this hook
 * explicit so catalog metadata can be added later without a second registry
 * or provider-specific prompt rules.
 */
export function resolveCatalogCodingModelProfile(
	_model: CodingModelIdentity | undefined,
): CodingModelProfileOverride | undefined {
	return undefined;
}

function readProfileOverride(value: unknown): CodingModelProfileOverride | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}

	const record = value as Record<string, unknown>;
	const override: CodingModelProfileOverride = {};
	if (isMutationStrategy(record.mutationStrategy)) {
		override.mutationStrategy = record.mutationStrategy;
	}
	if (isToolExecutionMode(record.toolExecution)) {
		override.toolExecution = record.toolExecution;
	}
	return Object.keys(override).length > 0 ? override : undefined;
}

function getSettingsProfileOverrides(
	model: CodingModelIdentity | undefined,
	profiles: Record<string, CodingModelProfileOverride> | undefined,
): CodingModelProfileOverride[] {
	if (!profiles) {
		return [];
	}

	const keys = ["*", model?.provider, model?.id, model ? `${model.provider}/${model.id}` : undefined].filter(
		(key): key is string => key !== undefined,
	);
	const overrides: CodingModelProfileOverride[] = [];
	for (const key of [...new Set(keys)]) {
		const override = readProfileOverride(profiles[key]);
		if (override) {
			overrides.push(override);
		}
	}
	return overrides;
}

function applyProfileOverride(profile: CodingModelProfile, override: unknown): void {
	const normalized = readProfileOverride(override);
	if (!normalized) {
		return;
	}
	if (normalized.mutationStrategy) {
		profile.mutationStrategy = normalized.mutationStrategy;
	}
	if (normalized.toolExecution) {
		profile.toolExecution = normalized.toolExecution;
	}
}

export function resolveCodingModelProfile(options: {
	model?: CodingModelIdentity;
	explicit?: CodingModelProfileOverride;
	settings?: Record<string, CodingModelProfileOverride>;
	catalog?: CodingModelProfileOverride;
}): CodingModelProfile {
	const profile = { ...DEFAULT_CODING_MODEL_PROFILE };
	applyProfileOverride(profile, options.catalog ?? resolveCatalogCodingModelProfile(options.model));
	for (const override of getSettingsProfileOverrides(options.model, options.settings)) {
		applyProfileOverride(profile, override);
	}
	applyProfileOverride(profile, options.explicit);
	return profile;
}

export function resolveToolProfile(options: {
	explicit?: ToolProfile;
	settings?: ToolProfile;
	modelProfile: CodingModelProfile;
}): ToolProfile {
	if (isToolProfile(options.explicit)) {
		return options.explicit;
	}
	if (isToolProfile(options.settings)) {
		return options.settings;
	}
	return toolProfileForMutationStrategy(options.modelProfile.mutationStrategy);
}
