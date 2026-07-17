# All-For-One documentation

This directory contains the current architecture, constraints, implementation direction, and operational guidance for All-For-One.

All-For-One remains a lightweight downstream of Native Pi. The documentation in this directory preserves the branch relationship and compatibility contract:

```text
upstream Pi -> main -> allforone -> focused branches
```

## Current architecture and plans

- [Architecture](architecture.md) — package ownership, runtime boundaries, compatibility rules, and prohibited duplication.
- [UI/UX design](ui-ux.md) — terminal-native visual and interaction improvements delivered as the first runtime workstream in P0.
- [Adaptive capabilities](adaptive-capabilities.md) — the P1 centralized coding-model profile and P2 automatic skill, tool, and workflow selection without another orchestration layer.
- [Implementation roadmap](implementation-roadmap.md) — the authoritative P0-P5 delivery plan, affected files, validation gates, and completion criteria.

## Authoritative roadmap

The approved order is:

```text
P0  Consolidate and freeze architecture
    + complete the UI/UX foundation as the first runtime workstream
P1  Make the tool interface adaptive and unambiguous
P2  Add the essential adaptive skill package
P3  Clarify knowledge ownership
P4  Ship optional robustness packages
P5  Reduce downstream maintenance cost
```

There is no dedicated evaluation-platform phase. Validation is performed within the phase that introduces the behavior.

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

## Project invariants

Every proposal and implementation must preserve these invariants:

1. Native Pi remains the architectural baseline.
2. `main` remains the clean local mirror of upstream Pi.
3. All-For-One work is integrated through `allforone` and focused branches created from it.
4. The primary runtime remains adaptive and single-agent.
5. Pi-compatible commands, configuration paths, package names, sessions, extension APIs, SDK behavior, print mode, and RPC mode remain compatible unless an intentional migration is separately designed.
6. The canonical built-in tool registry remains `read`, `bash`, `edit`, `write`, and `apply_patch`.
7. New behavior belongs in an existing Native Pi skill, extension, theme, prompt, settings, SDK, or coding-agent-local boundary before a core agent-loop change is considered.
8. A new package or `packages/agent` change requires evidence that Pi's public boundaries cannot satisfy the requirement cleanly.
9. Optional behavior must have no prompt, process, or rendering cost while disabled.
10. No performance, quality, latency, cost, model-reliability, or security claim is made without supporting evidence.
11. No classifier model, skill tool, workflow engine, semantic retrieval layer, duplicate memory system, or evaluation platform is introduced.

## Documentation ownership

- `architecture.md` owns stable package, runtime, compatibility, and subsystem ownership decisions.
- `ui-ux.md` owns P0 terminal presentation and interaction decisions.
- `adaptive-capabilities.md` owns the P1 model profile and P2 skill, tool, and workflow activation rules.
- `implementation-roadmap.md` owns the P0-P5 delivery order and implementation gates.

Do not duplicate these decisions in new phase documents. Historical plans may remain for traceability, but these four documents are the current source of truth.
