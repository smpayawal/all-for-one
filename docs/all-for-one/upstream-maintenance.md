# Upstream maintenance classification

The relationship check reports `main` as an ancestor of `allforone`; use it for the current ahead/behind counts. This audit does not merge, rebase, switch, or rewrite either branch.

## Divergence classes

| Class | Current paths | Maintenance rule |
|-------|---------------|------------------|
| Upstream-sensitive runtime | `packages/agent/src/agent-loop.ts`, `agent.ts`, `types.ts`, `runtime-error.ts`, and their tests | Compare against `main` before upstream sync. Avoid adding coding-agent policy here unless the shared lifecycle contract cannot express it. |
| Coding-agent hardening | `packages/coding-agent/src/core/agent-session.ts`, compaction, execution-integrity, scoped-context, memory, resource loading, mutation tools, and focused tests | Keep behavior bounded and evidence-driven. Prefer coding-agent-local seams over expanding the agent loop. |
| Current profile seam | `packages/coding-agent/src/core/coding-model-profile.ts`, settings, CLI, SDK, prompt, tool registry, and focused tests | Keep one canonical registry; profiles select active built-ins and execution mode. No provider prompt rules or second registry. |
| Product/UI identity | interactive components, branding assets, export templates, README, and release-facing docs | Preserve the All-For-One identity without changing Native Pi lifecycle contracts. |
| Governance and diagnostics | `.github/workflows/allforone-ci.yml`, `scripts/allforone-*`, upstream verifier, security and validation docs | Keep checks read-only, deterministic, and distinct from production runtime behavior. |
| Generated catalog boundary | `packages/ai/src/models.generated.ts` and direct provider model files | Treat as generated artifacts. Do not hand-edit them for coding-agent behavior; refresh only through the repository generator when catalog work is explicitly in scope. |

## Required sync check

Before an upstream update, inspect the exact changed hot files and run:

```bash
node scripts/check-upstream-relationship.mjs --main origin/main --json
git diff --stat main...allforone
git diff -- packages/agent packages/coding-agent/src/core/agent-session.ts
```

The expected maintenance direction is `main -> allforone -> focused branch/PR`. A sync review should classify new upstream conflicts by the table above, preserve the permanent integration branch, and keep optional All-For-One behavior outside the shared agent loop wherever a coding-agent seam is sufficient.

## Upstream hot-file freeze

The current upstream-hot-file list is intentionally explicit:

- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/agent.ts`
- `packages/agent/src/types.ts`
- `packages/coding-agent/src/main.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/resource-loader.ts`
- `packages/coding-agent/src/core/extensions/types.ts`
- `packages/coding-agent/src/core/compaction/`
- `packages/coding-agent/src/core/execution-integrity.ts`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`

After every synchronization from `main`, review the net downstream diff for these paths, classify each conflict or behavior change, and record any compatibility decision in the synchronization PR. The `main`-push drift workflow at `.github/workflows/allforone-upstream-drift.yml` is a read-only early warning; it does not merge or modify either branch.

Further expansion of the shared core is frozen unless the feature author documents one of these justifications:

1. An existing Pi public boundary cannot support the requirement.
2. A measured production problem requires a core change.
3. Keeping the behavior outside the core would create greater complexity or correctness risk.

New work should prefer coding-agent-local seams, extensions, or existing public APIs, and should not add another policy registry or runtime subsystem to the shared agent package without that justification.
