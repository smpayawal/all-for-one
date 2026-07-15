import { statSync } from "node:fs";
import { isLocalPath, resolvePath } from "../../utils/paths.ts";
import type { EvidenceReference } from "./retention.ts";

export type EvidenceResolutionStatus = "available" | "missing" | "non-local";

export interface EvidenceResolution {
	reference: EvidenceReference;
	status: EvidenceResolutionStatus;
	resolvedPath?: string;
	message: string;
}

/** Resolve one evidence pointer without reading or mutating the referenced output. */
export function resolveEvidenceReference(reference: EvidenceReference, cwd: string): EvidenceResolution {
	if (!isLocalPath(reference.ref)) {
		return {
			reference,
			status: "non-local",
			message: `Evidence reference ${reference.ref} is non-local and was not resolved as a filesystem path.`,
		};
	}

	const resolvedPath = resolvePath(reference.ref, cwd, { trim: true });
	try {
		if (!statSync(resolvedPath).isFile()) {
			return {
				reference,
				status: "missing",
				resolvedPath,
				message: `Evidence reference ${reference.ref} is not available as a regular file at ${resolvedPath}.`,
			};
		}
		return {
			reference,
			status: "available",
			resolvedPath,
			message: `Evidence reference ${reference.ref} is available at ${resolvedPath}.`,
		};
	} catch {
		return {
			reference,
			status: "missing",
			resolvedPath,
			message: `Evidence reference ${reference.ref} is not available at ${resolvedPath}.`,
		};
	}
}

export function resolveEvidenceReferences(references: readonly EvidenceReference[], cwd: string): EvidenceResolution[] {
	return references.map((reference) => resolveEvidenceReference(reference, cwd));
}
