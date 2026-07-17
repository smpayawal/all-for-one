# Context and capabilities

All-For-One keeps the Native Pi single-agent runtime and definition-first tool registry. The default active tools are exactly:

```text
read, bash, edit, write, apply_patch
```

`grep`, `find`, and `ls` remain registered optional capabilities. The removed `changes` capability is not part of the registry, public exports, extension event unions, default prompts, or tests. Repository inspection remains available through Bash and the existing read-only tools.

## Bounded context

Project instructions are loaded from the global file and ancestor chain at startup. Nested instructions are loaded only for path-bearing read/edit/write/grep/find/ls/apply_patch calls within the project root. The scoped tracker bounds active scopes to 8 and scoped prompt content to 32,000 characters. It canonicalizes paths, deduplicates exact content, replaces unrelated sibling scopes, reports sibling conflicts without inferring semantic ownership, and reports omitted/oversized scopes.

The first mutation that discovers a new scope is retried after the scope is active. Read-only discovery can add the scope without that mutation retry. Paths outside the project root are rejected with a warning and are not loaded.

## Skills

Skill bodies remain on-demand. Model-visible metadata keeps the existing character budget, manual-only behavior, deterministic deduplication, compact fallback, and omitted-skill diagnostics. Collision precedence is explicit invocation, project-local, user-global, package-provided, then remaining sources; name and canonical path are deterministic tie-breakers.

## Prompt and schema diagnostics

`baseline:allforone` measures the current composition. `doctor:allforone` checks default prompt shape, tool metadata/schema presence, empty-skill behavior, custom and no-tools prompts, execution-integrity guidance modes, nested context, and bounded skill metadata. `/context` exposes the runtime measurements through `AgentSession.getContextInfo()`.

No live model-quality or provider-cost improvement is inferred from these structural measurements.
