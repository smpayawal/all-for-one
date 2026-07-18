# Validation policy and current evidence

Validation starts with the smallest relevant checks, then runs the repository gate, focused regressions, the requested full test command, build, and the non-publishing release smoke. Every result is recorded as passed, failed, or environment-limited; an environment limitation is not converted into a pass.

## Revision and governance boundary

This evidence applies to the intentionally uncommitted worktree on `fix/runtime-release-hardening`.

```text
implementationBase: f4d1df9baf439d76154d3cb0cb8685a08c65dbff
allforone:         f4d1df9baf439d76154d3cb0cb8685a08c65dbff
main:              3da591ab74ab9ab407e72ed882600b2c851fae21
origin/main:       3da591ab74ab9ab407e72ed882600b2c851fae21
upstream/main:     3da591ab74ab9ab407e72ed882600b2c851fae21
main...HEAD:       0 95
```

`git fetch --all --prune` completed before the implementation audit. The upstream relationship checker passed with `mainIsAncestor: true`, `ahead: 95`, and `behind: 0`. No commit, push, tag, release publication, or pull request was made. The worktree is intentionally dirty because the requested changes remain uncommitted.

The CI workflows now check out the exact pull-request head SHA (or the triggering SHA outside pull requests) and verify that the checked-out `HEAD` matches it before reporting evidence. The YAML files parse locally, but no remote CI run exists for this uncommitted branch; Windows-specific results therefore remain a CI responsibility.

## Local validation

The following checks passed during this work:

| Check | Result |
| --- | --- |
| `npm run check` | Passed in the final post-documentation run; Biome checked 856 files and the pinned-dependency, import, shrinkwrap, install-lock, TypeScript, and browser-smoke checks completed. |
| `npm run build` | Passed with network access; TUI, AI, agent, coding-agent, and orchestrator built. Generated provider catalogs were restored afterward. |
| `npm test` | Passed in an isolated disposable HOME and `PI_CODING_AGENT_DIR`: agent-core 223 passed; AI 558 passed and 738 skipped; coding-agent 1,928 passed and 49 skipped; TUI completed; root exit 0. |
| Process-tree focused matrix | Passed: 12 tests; 2 Windows tests skipped on macOS. Covers output bounds, timeout/abort, surviving descendants, force cleanup, and root-exits-first fallback. |
| Profile and extension regressions | Passed: 12 tests, including model-switch profile preservation and the no-built-in-tools extension regression. |
| Safe-mode focused suite | Passed: 35 tests, including destructive commands, credentials, traversal, symlink/syntax cases, and approval-is-not-isolation coverage. |
| `doctor:allforone -- --json` | Passed: 12/12 checks. |
| `baseline:allforone -- --json` | Passed: all 12 required evaluation scenario IDs. |
| `baseline:context -- --json` | Passed: schema v2. |
| `baseline:execution -- --json` | Passed: schema v2 enforce fixture. |
| `evaluate:context -- --help`; `evaluate:execution -- --help` | Passed: both CLIs available; no live paired evaluation was run. |
| Workflow YAML parse | Passed for both All-For-One workflows. |
| `node --test scripts/check-upstream-relationship.test.mjs scripts/check-clean-worktree.test.mjs` | Passed: 7 tests. |
| Non-publishing release artifact phase | Passed: four tarballs, Darwin-arm64 Bun binary, isolated Node install, and isolated Bun package install created under `/private/tmp/pi-allforone-release`. |

The first no-skip `release:local` preflight did not reach packaging in the host environment. After the independent check, full-test, and build passes above, the artifact/install phase was rerun with `--skip-check --skip-test` and completed successfully. This is not reported as a full no-skip release-script pass.

The isolated artifact smoke from `/private/tmp` passed version and help startup for the Node install, Bun package install, and Bun binary. Offline model listing exited cleanly with the expected no-models message. Node and Bun binary interactive startup entered the UI and exited cleanly. JSON print startup emitted a valid session record before stopping for the absent provider key; RPC print startup exited cleanly. No live provider prompt, paid token, deployment, or publish operation was performed.

## Required platform and live-evaluation follow-up

The local host is macOS, so the Windows process-tree tests were skipped locally. The Windows CI job must run the PowerShell discovery, awaited `taskkill`, root-exits-first fallback, helper-failure, and descendant-cleanup cases before this work is considered platform-complete.

The 12-scenario real-use evaluation remains a procedure and fixture inventory, not a result. It must be run as paired baseline/All-For-One sessions with the same repository, prompt, model, context, and tool permissions. See [baseline.md](baseline.md). No quality, latency, token, or cost claim is made from deterministic fixtures, smoke checks, or structural diagnostics.
