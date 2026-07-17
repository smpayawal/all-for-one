# All-For-One validation baseline

Date: 2026-07-17

Counts below are from commands actually run after the hardening changes. An environment or build-artifact limitation is reported as a limitation, not converted into a pass.

## Branch relationship

| Check | Result |
| --- | --- |
| working branch | `fix/post-audit-hardening` |
| current branch tip | `3f48b29e818a0ca26090fc59e2cb7ad17e885287` |
| `main` | `216e672e7c9fc65682553394b74e483c0c9e47f7` |
| `allforone` | `3258be547c5175043d9fabadace558e27c0f838a` |
| merge base | `216e672e7c9fc65682553394b74e483c0c9e47f7` |
| `main...HEAD` | `0 44` |
| `main` is an ancestor of `HEAD` | yes |
| `HEAD` is two local commits ahead of `allforone` | yes; `6c7c349`, `3f48b29` |
| `origin/HEAD` | `origin/main` |

The branch was created from `allforone`. The hardening implementation is committed locally at `3f48b29` (with the preceding hardening commit `6c7c349`); it has not been pushed, merged, rebased, or tagged during this validation pass.

## Final validation

| Command or suite | Result | Classification |
| --- | --- | --- |
| `npm run check` | pass; Biome checked 832 files and pinned dependencies/imports/shrinkwrap/install-lock/tsgo/browser smoke passed | repository gate passed |
| `git diff --check` and `node --check scripts/check-clean-worktree.mjs` | passed | static validation |
| focused coding-agent hardening matrix | 10 files passed, 1 skipped; 183 passed, 2 skipped | pass; escalated only for required temporary IPC resources |
| focused agent-loop regression | 1 file, 32 passed | pass |
| `doctor:allforone -- --json` | 12/12 checks passed | pass |
| `baseline:allforone -- --json` | passed | offline structural baseline |
| `baseline:context -- --json` | passed; schema v2, capability `context-integrity` | deterministic fixtures |
| `baseline:execution -- --json` | passed; schema v2, capability `execution-integrity` | deterministic fixtures; default production mode remains off |
| `evaluate:context -- --help` | passed | CLI available; no live pair supplied |
| `evaluate:execution -- --help` | passed | CLI available; no live pair supplied |
| `node --test scripts/check-upstream-relationship.test.mjs` | 3 passed | pass |
| `node scripts/check-upstream-relationship.mjs --main origin/main --json` | `mainIsAncestor: true`; `ahead: 44`; `behind: 0` | pass; read-only relationship check for current `HEAD` |
| `npm run build` | pass; fetched provider catalogs and built tui, ai, agent, coding-agent, and orchestrator packages | pass; generated catalog side effects were restored and are not part of this diff |
| GitHub Actions `All-For-One CI` run `29548893362` | committed `allforone` HEAD `3258be547c5175043d9fabadace558e27c0f838a`; `gate` and `platform-focused` Ubuntu, macOS, and Windows jobs all completed successfully | remote baseline pass; does not cover local commit `3f48b29` |
| CLI args/tool-registry tests | 2 files, 74 passed | pass; default five-tool surface and optional read-only tools verified |
| exact workflow All-For-One focused list | 21 files, 368 passed | pass |
| built CLI `--help` with isolated HOME | passed; title and built-in list include `apply_patch` | pass; host-global lock permission avoided |
| root `npm test` with host HOME / agent | 17 files, 209 passed | pass |
| root `npm test` with host HOME / AI | 88 files passed, 12 skipped; 594 passed, 701 skipped | pass |
| root `npm test` with host HOME / coding-agent | 187 files passed, 6 skipped, 1 failed; 1,821 passed, 47 skipped | exit 1; one user-scoped `.agents` package-state expectation |
| root `npm test` with host HOME / TUI | passed | package tests completed; aggregate command remained nonzero because coding-agent failed |
| root `npm test` with isolated HOME / agent | 17 files, 209 passed | pass |
| root `npm test` with isolated HOME / AI | 75 files passed, 25 skipped; 557 passed, 738 skipped | pass |
| root `npm test` with isolated HOME and temporary agent dir / coding-agent | 188 files passed, 6 skipped; 1,825 passed, 47 skipped | pass; temporary dir exposed the existing managed `fd` binary without changing user state |
| root `npm test` with isolated HOME / TUI | passed | aggregate root command passed |
| workflow platform-focused set on macOS | 10 files passed, 1 skipped; 183 passed, 2 skipped | local pass; the corresponding remote matrix passed for `allforone` HEAD, not local commit `3f48b29` |
| `check-clean-worktree.mjs --allow-build-generated` after build | rejected unrelated intentional hardening changes; generated catalog paths were allowlisted | expected on the intentionally dirty worktree |

## Failure classification

The root `npm test` invocation was run as requested with the host HOME and with an isolated HOME. The host run’s sole failure expected no discovered user skill, but the current machine exposes `/Users/smpayawal/.agents/skills/microsoft-foundry/SKILL.md`. During this follow-up, two isolated full-suite attempts hit existing `footer-data-provider.test.ts` reftable-directory timing waits; that file passed 8/8 in isolation, and bounded retries completed the wrapped full root command with exit 0. The final isolated root command exposed the existing managed `fd` binary through a temporary `PI_CODING_AGENT_DIR` and exited 0; the host-only failure is user-scoped package state rather than a repository regression.

The build was also run because it was explicitly requested and completed successfully with network access to provider model catalogs. It changed generated catalog files as a build side effect; those files were restored to their pre-build state.

The committed `allforone` HEAD passed the remote GitHub Actions `All-For-One CI` run `29548893362`, including the clean-runner gate and Ubuntu, macOS, and Windows platform-focused jobs. That run predates and does not cover local commit `3f48b29`. No live provider/model evaluation, external deployment, or push was performed. Therefore this report makes no quality, latency, cost, token-savings, or provider-tokenization claim. The worktree was clean at local commit `3f48b29` before this evidence-document follow-up; it is intentionally dirty only because these current-revision corrections are not authorized for another commit. The clean-worktree script was previously exercised and correctly rejected the intentionally dirty pre-commit state.
