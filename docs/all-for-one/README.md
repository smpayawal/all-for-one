# All-For-One documentation

This directory contains the current architecture, constraints, implementation direction, and operational guidance for All-For-One.

All-For-One remains a lightweight downstream of Native Pi. The branch and integration model is:

```text
upstream Pi -> main -> allforone -> focused branches
```

`main` remains the clean local mirror of upstream Pi. All-For-One changes are integrated through `allforone`; focused branches start from and return to `allforone`.

## Current sources of truth

- [Architecture](architecture.md) — ownership, runtime boundaries, compatible tool inventory, active profiles, optional-cost rules, and prohibited duplication.
- [UI/UX design](ui-ux.md) — terminal-native visual and interaction improvements delivered after P0 consolidation.
- [Adaptive capabilities](adaptive-capabilities.md) — the minimal P1 mutation profile and P2 adaptive Native Pi skills.
- [Implementation roadmap](implementation-roadmap.md) — the authoritative P0-P5 order, cleanup gates, implementation scope, and validation criteria.

## Authoritative roadmap

```text
P0  Consolidate and freeze the architecture
    P0-A audit, simplify, remove duplication, and make optional behavior lazy
    P0-B deliver the terminal UI/UX foundation as the first new product feature
P1  Make the active tool interface adaptive and unambiguous
P2  Add exactly five essential Native Pi skills
P3  Clarify knowledge ownership
P4  Consider optional robustness capabilities independently
P5  Complete release consolidation and upstream-maintenance review
```

P5 maintenance rules apply continuously from P0 onward; they are not deferred until the end. There is no dedicated evaluation-platform phase. Validation is performed within the change that introduces or removes behavior.

## Project invariants

Every proposal and implementation preserves these rules:

1. Native Pi remains the architectural baseline.
2. The normal runtime remains one adaptive primary agent.
3. Pi-compatible commands, configuration paths, package names, sessions, extension APIs, SDK behavior, print mode, and RPC mode remain compatible unless a separate migration is intentionally designed and tested.
4. The compatible built-in tool inventory remains available; active profiles expose only the smallest useful subset.
5. The recommended normal coding profile contains `read`, `bash`, `write`, and one primary existing-file mutation tool: `edit` or `apply_patch`.
6. The complete five-tool coding profile remains available through explicit configuration for compatibility and troubleshooting.
7. New behavior uses existing Pi skills, extensions, themes, prompts, settings, SDK hooks, or coding-agent-local modules before any `packages/agent` change is considered.
8. A new package or generic agent-runtime change requires a demonstrated problem that existing Pi public boundaries cannot solve cleanly.
9. Disabled optional behavior adds no model-visible schema, filesystem discovery, background process, model request, persistent mutation, or meaningful rendering cost.
10. No classifier model, skill tool, workflow engine, semantic retrieval layer, duplicate memory system, permanent agent hierarchy, or evaluation platform is introduced.
11. No quality, latency, token, cost, reliability, performance, or security improvement is claimed without evidence.
12. Every pull request is reviewed against both `allforone` and `main` for unnecessary upstream-hot edits, duplicate ownership, compatibility risk, and rollback.

## Existing operational documentation

- [Upstream synchronization](upstream-sync.md)
- [Release policy](release-policy.md)
- [Validation](validation.md)
- [Context and capabilities](context-and-capabilities.md)
- [Context integrity](context-integrity.md)
- [Compaction](compaction.md)
- [Execution integrity](execution-integrity.md)
- [Security](security.md)
- [Known limitations](known-limitations.md)
- [Test baseline](test-baseline.md)
- [Hardening report](hardening-report.md)

These documents record current implementation and historical evidence. They do not override the architecture, adaptive-capability, UI/UX, and roadmap documents listed above.

## Documentation ownership

- `architecture.md` owns stable package, runtime, compatibility, tool-profile, optional-cost, and subsystem ownership decisions.
- `ui-ux.md` owns interactive presentation decisions.
- `adaptive-capabilities.md` owns the P1 mutation profile and P2 skill-selection rules.
- `implementation-roadmap.md` owns the delivery order, cleanup gates, and completion criteria.

Do not create new phase documents that repeat these decisions. Historical documents may remain for traceability, but conflicting guidance must be corrected, archived, or clearly marked as historical.