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
