# Hardening report

## Initial audit

| Concern | Evidence | Severity | Affected files | Exists on `main`? | Proposed action | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Obsolete built-in `changes` tool | The `allforone` snapshot exposed `changes.ts`, registry activation, public types, docs, and tests; the clean local `main` tree did not contain that built-in. | High | `packages/coding-agent/src/core/tools/*`, registry/types, README/docs, tests | No in clean `main`; present in the audited branch snapshot | Remove the built-in and retain Bash/Git inspection. | Tool-registry, allowlist, exclusion, and focused suite checks |
| Numbered phase artifacts leaked into the product surface | Numbered phase filenames and package scripts were present in the branch snapshot. | Medium | `scripts/`, `docs/`, package scripts, phase tests | No corresponding current workflow in clean `main` | Rename or replace with generic baseline/evaluation/doctor names. | Repository searches, generic CLI help, and baseline tests |
| Untyped tool results could reach lifecycle hooks without normalized content | `lax-message-content` reproduced `result.content` being undefined before the hook/event boundary. | High | `packages/agent/src/agent-loop.ts`, coding-agent session hooks | Shared agent boundary exists on `main` | Normalize malformed extension results before hooks and emitted events. | Regression test plus agent execution-integrity suite |
| File mutation safety was weaker than the requested concurrency and rollback contract | The original `apply_patch` path did not preflight all content/mode state or guarantee same-directory temporary-file cleanup on every failure path. | High | `packages/coding-agent/src/core/tools/apply-patch.ts` | Shared tool exists on `main` | Add bounded preflight, same-directory temp files, rollback, mode preservation, and cancellation cleanup. | Apply-patch and file-mutation tests |
| Context/resource growth lacked one explicit bounded policy | Resource discovery, scoped context, sibling replacement, and duplicate-content handling were spread across runtime paths without a single bounded diagnostic contract. | High | scoped context, resource loader, skills, package manager, SDK/session | Not established in clean `main` | Add explicit item/character limits, deterministic ordering, and diagnostics. | Context baseline, doctor, scoped-context, skills, and memory tests |
| Execution-integrity and compaction behavior needed observable policy boundaries | No generic offline measurement/diagnostic path established the requested off/observe/enforce or compaction evidence behavior. | Medium | execution-integrity, compaction, session/runtime event paths | Not established in clean `main` | Keep enforcement off by default, expose bounded diagnostics, and record compaction telemetry. | Deterministic execution baseline/evaluation and compaction tests |
| CI and upstream drift needed an explicit read-only gate | No All-For-One workflow or upstream relationship verifier was present in the clean `main` tree. | High | `.github/workflows/`, `scripts/check-upstream-relationship.mjs` | No | Add pinned, least-privilege CI and a verifier that does not merge or mutate the checkout. | YAML inspection, verifier test, and CI-only build/test path |

The audit did not justify extracting a separate production subsystem from upstream. The rehearsal found only one `packages/coding-agent/package.json` content conflict, and a new extraction boundary would add maintenance cost without a demonstrated benefit. The current work therefore keeps upstream-sensitive changes narrow and records the conflict for deliberate integration.

## Completed structural work

- Removed the `changes` built-in and made the five-tool default explicit.
- Renamed numbered diagnostics to generic baseline/evaluation/doctor commands.
- Added upstream relationship verification and dedicated pinned-action CI.
- Hardened `apply_patch` against concurrent content/mode changes and temporary-file leakage.
- Bounded scoped context, sibling replacement, duplicate content, and diagnostics.
- Added execution-integrity mode-aware prompt guidance while keeping enforcement off by default.
- Bounded local memory and added safe malformed/oversized-file handling.
- Made skill-source precedence deterministic with explicit paths first.
- Added prompt/schema structural doctor checks, compaction telemetry, and absent-rail event isolation.

## Structural measurement

Compared with the clean `allforone` HEAD snapshot, the current default active tool surface is five tools instead of six after removing `changes`. The active tool schema decreased from 3,888 to 3,356 characters/bytes (532, about 13.7%); active prompt snippets decreased from 370 to 298 characters/bytes (72, about 19.5%). This is a structural reduction, not a model-quality benchmark.

## Upstream rehearsal

The isolated history-preserving rehearsal used fetched `upstream/main` at `f7e060374541be0097ee015aaddb097a4f760984`. The synthetic current-worktree snapshot merged cleanly except for one content conflict in `packages/coding-agent/package.json`; no merge or worktree mutation was performed in the shared checkout.

## Evidence boundary

The repository gate, focused tests, diagnostics, full test command, and upstream verifier must be recorded with their actual exit status. Environment-specific failures (for example local IPC restrictions, missing `fd`, network, or user-state permissions) remain classified as limitations rather than hidden.

No live paired model evaluation was available during this pass. Therefore this report does not claim improved correctness, latency, cost, provider-token usage, or model quality.
