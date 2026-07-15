import { statSync } from "node:fs";
import { isLocalPath, resolvePath } from "../../utils/paths.ts";
import { boundEvidenceReferences, type EvidenceReference, normalizeEvidenceReference } from "./retention.ts";

export type EvidenceResolutionStatus = "available" | "missing" | "non-local";

export interface EvidenceResolution {
	reference: EvidenceReference;
	status: EvidenceResolutionStatus;
	resolvedPath?: string;
	message: string;
}

/**
 * Resolve one evidence pointer without reading or mutating the referenced output.
 * Evidence metadata is trusted local session state; callers must not pass imported or untrusted records here.
 */
export function resolveEvidenceReference(reference: EvidenceReference, cwd: string): EvidenceResolution {
	const normalized = normalizeEvidenceReference(reference);
	if (!normalized) {
		return {
			reference,
			status: "missing",
			message: "Evidence reference metadata is invalid and was not resolved as a filesystem path.",
		};
	}

	if (!isLocalPath(normalized.ref)) {
		return {
			reference: normalized,
			status: "non-local",
			message: `Evidence reference ${normalized.ref} is non-local and was not resolved as a filesystem path.`,
		};
	}

	const resolvedPath = resolvePath(normalized.ref, cwd, { trim: true });
	try {
		if (!statSync(resolvedPath).isFile()) {
			return {
				reference: normalized,
				status: "missing",
				resolvedPath,
				message: `Evidence reference ${normalized.ref} is not available as a regular file at ${resolvedPath}.`,
			};
		}
		return {
			reference: normalized,
			status: "available",
			resolvedPath,
			message: `Evidence reference ${normalized.ref} is available at ${resolvedPath}.`,
		};
	} catch {
		return {
			reference: normalized,
			status: "missing",
			resolvedPath,
			message: `Evidence reference ${normalized.ref} is not available at ${resolvedPath}.`,
		};
	}
}

export function resolveEvidenceReferences(references: readonly EvidenceReference[], cwd: string): EvidenceResolution[] {
	return boundEvidenceReferences(references).map((reference) => resolveEvidenceReference(reference, cwd));
}
