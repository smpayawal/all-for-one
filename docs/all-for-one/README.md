# All-For-One documentation

This directory contains the current architecture, constraints, implementation direction, and operational guidance for All-For-One.

All-For-One remains a lightweight downstream of Native Pi. The documentation in this directory must preserve the branch relationship and compatibility contract:

```text
upstream Pi -> main -> allforone -> focused branches
```

## Current architecture and plans

- [Architecture](architecture.md) — current and target ownership boundaries.
- [UI/UX design](ui-ux.md) — terminal-native visual and interaction improvements.
- [Adaptive capabilities](adaptive-capabilities.md) — automatic skill, tool, and workflow selection without a second orchestration layer.
- [Implementation roadmap](implementation-roadmap.md) — ordered implementation tasks, affected files, acceptance criteria, and rollback boundaries.

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
6. New behavior belongs in a skill, extension, theme, prompt, or coding-agent-local module before a core agent-loop change is considered.
7. Optional behavior must have no material normal-session cost while disabled.
8. No performance, quality, latency, cost, or security claim is made without supporting evidence.

## Documentation ownership

- `architecture.md` owns stable package and runtime boundaries.
- `ui-ux.md` owns terminal presentation and interaction decisions.
- `adaptive-capabilities.md` owns skill, tool, and workflow activation rules.
- `implementation-roadmap.md` owns delivery order and implementation gates.

Do not duplicate these decisions in new phase documents. Historical plans may remain for traceability, but this directory is the current source of truth.