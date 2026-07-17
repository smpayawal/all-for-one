# All-For-One validation baseline

Date: 2026-07-17

Counts below are from commands actually run after the hardening changes. An environment or build-artifact limitation is reported as a limitation, not converted into a pass.

## Branch relationship

| Check | Result |
| --- | --- |
| `main` | `70c57632975c989f80a3a49c79ff43213f1f1dad` |
| `allforone` | `c0de4aa88ef93c70a9e1729c5765d77c508f4edc` |
| merge base | `70c57632975c989f80a3a49c79ff43213f1f1dad` |
| `main...allforone` | `0 39` |
| `main` is an ancestor of `allforone` | yes |

The worktree contained staged and unstaged execution-integrity/runtime changes before this hardening pass. They were preserved and are not treated as a clean baseline commit.

## Final validation

| Command or suite | Result | Classification |
| --- | --- | --- |
| `npm run check` | pass; Biome checked 832 files, pinned dependencies/imports/shrinkwrap/install-lock/tsgo/browser smoke passed | repository gate passed |
| focused All-For-One matrix | 21 files, 345 passed | pass; run with local IPC/filesystem permission |
| `npm test` / agent | 17 files, 204 passed | pass |
| `npm test` / AI | 5 files failed, 70 passed, 25 skipped; 18 tests failed, 527 passed, 736 skipped, 15 errors | exit 1; local network-listener restrictions and provider timeout failures |
| `npm test` / coding-agent | 6 files failed, 182 passed, 6 skipped; 14 tests failed, 1,786 passed, 47 skipped | exit 1; limitations below |
| `npm test` / TUI | passed; separately rerun after the full command | pass |
| `doctor:allforone -- --json` | 12/12 checks passed | pass |
| `baseline:allforone -- --json` | passed | offline structural baseline |
| `baseline:context -- --json` | passed | deterministic fixtures |
| `baseline:execution -- --json` | passed | deterministic fixtures; default production mode remains off |
| `evaluate:context -- --help` | passed | CLI available; no live pair supplied |
| `evaluate:execution -- --help` | passed | CLI available; no live pair supplied |
| upstream relationship test | 3 passed | pass |

## Failure-focused comparison

| Test or concern | Clean `main` | `allforone` before fix | `allforone` after fix | Classification |
| --- | --- | --- | --- | --- |
| Direct CLI session-id/stdout assertions | Reproduced the same `pi-ai` `getAvailable is not a function` failure in an isolated `main` checkout using the shared unbuilt workspace artifacts. | 7 failed assertions | 7 still fail locally without a package build | Stale local distribution artifact, not an All-For-One regression. CI builds packages before the full test command. |
| Untyped tool result / `lax-message-content` | Not isolated as an equivalent test: clean `main` has the shared agent boundary but not the All-For-One telemetry hook that exposed this interaction. | 1 failed assertion with `content` undefined | 6/6 passed after normalization in `agent-loop.ts` | All-For-One lifecycle interaction fixed at the shared boundary; regression is covered. |
| Built-in tool surface | `changes` is absent from the clean `main` tree. | `changes` was present in source, activation, docs, and tests. | `changes` is absent from active source/docs/registry; focused tool tests are 79/79. | Structural removal; Bash/Git inspection remains available. |

## Full-test failure classification

The root `npm test` command exited 1. The coding-agent Vitest summary reported 14 failed tests across six files:

- Three `session-id-readonly` and four `stdout-cleanliness` CLI assertions fail because direct CLI execution resolves the local `pi-ai` distribution, whose unbuilt `createModels()` artifact does not expose the source-level `getAvailable()` API. An isolated `main` checkout reproduced the same error. The repository instructions prohibit running `npm run build` unless requested; the dedicated All-For-One CI builds packages before testing.
- One `package-manager` test times out while attempting to clone `https://github.com/nonexistent/repo`; the sandbox cannot resolve external network hosts.
- Three `footer-data-provider` tests time out while waiting for reftable watcher updates. Two passed with local IPC/filesystem permission; the remaining watcher behavior is platform/environment-sensitive and is covered by the platform matrix.
- Three subprocess assertions in `allforone-baseline` and `context-evaluation` fail in the normal sandbox because `tsx` cannot create its IPC pipe. The same focused files passed with local IPC permission.

The focused hardening matrix and the affected session-rail regression pass. Missing `fd` caused four pre-existing file-search tests to fail in an earlier sandboxed focused run; the final CI installs `fd-find` and that limitation is not part of the final full-test count above.

No live provider/model evaluation, build command, or external deployment was run locally. Therefore this report makes no quality, latency, cost, token-savings, or provider-tokenization claim.
