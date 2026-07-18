# All-For-One validation baseline

Date: 2026-07-18

This file records current local evidence for the uncommitted `fix/runtime-release-hardening` worktree. Historical branch names, commit hashes, and CI run IDs from earlier hardening passes are intentionally omitted from the current baseline; they are not evidence for this revision.

## Revision boundary

| Item | Value |
| --- | --- |
| working branch | `fix/runtime-release-hardening` |
| implementation base / `HEAD` | `f4d1df9baf439d76154d3cb0cb8685a08c65dbff` |
| `allforone` | `f4d1df9baf439d76154d3cb0cb8685a08c65dbff` |
| `main`, `origin/main`, `upstream/main` | `3da591ab74ab9ab407e72ed882600b2c851fae21` |
| `main...HEAD` | `0 95`; `main` is an ancestor |
| worktree | intentionally dirty; no commit, push, tag, publication, or PR |
| remote CI for this revision | not run; Windows coverage remains pending in CI |

## Current checks

| Command or suite | Result | Classification |
| --- | --- | --- |
| `npm run check` | Passed in the final post-documentation invocation; Biome checked 856 files and all repository gate checks completed. | repository gate |
| `npm run build` | Passed after fetching the network-backed model catalogs; generated catalog side effects were restored. | build and artifact validation |
| isolated `npm test` | Agent-core: 17 files, 223 passed. AI: 76 files passed, 25 skipped; 558 passed, 738 skipped. Coding-agent: 198 files passed, 7 skipped; 1,928 passed, 49 skipped. TUI completed. Root exit 0. | full workspace suite with disposable configuration |
| `test/exec.test.ts`, `test/bash-process-tree.test.ts`, `test/process-tree-windows.test.ts` | 12 passed; 2 Windows tests skipped on macOS. | process lifecycle and platform fallback regression coverage |
| profile tests plus `3592-no-builtin-tools-keeps-extension-tools.test.ts` | 12 passed. | profile switching and extension compatibility |
| `test/safe-mode.test.ts` | 35 passed. | safe-mode classification and boundary coverage |
| `npm run doctor:allforone -- --json` | 12/12 checks passed. | local environment diagnostics |
| `npm run baseline:allforone -- --json` | Passed; all 12 scenario IDs present. | offline evaluation inventory |
| `npm run baseline:context -- --json` | Passed; schema v2. | deterministic fixture validation |
| `npm run baseline:execution -- --json` | Passed; schema v2 enforce fixture. | deterministic fixture validation; production enforcement remains off |
| `npm run evaluate:context -- --help`; `npm run evaluate:execution -- --help` | Both passed. | evaluator availability only |
| `node --test scripts/check-upstream-relationship.test.mjs scripts/check-clean-worktree.test.mjs` | 7 passed. | governance and generated-file policy regressions |
| All-For-One workflow YAML parse | Both workflow files parsed successfully. | static CI validation |
| `npm run release:local -- --out /private/tmp/pi-allforone-release --force --skip-check --skip-test` | Exit 0; four tarballs, Darwin-arm64 Bun binary, Node install, and Bun package install created. | non-publishing artifact/install smoke |

The no-skip release preflight was attempted first but stopped before packaging in the host environment. Because its output was truncated by the terminal bridge, no narrower failure is claimed. The separately completed `npm run check`, isolated full `npm test`, and `npm run build` provide the preflight evidence used for the artifact-only rerun.

## Packaged CLI smoke

All commands below ran from `/private/tmp` with disposable `HOME` and `PI_CODING_AGENT_DIR` values:

| Entry point | Version/help | Offline model list | Interactive start |
| --- | --- | --- | --- |
| isolated Node install | passed; `0.80.10` | passed; clean no-models message | entered UI and exited cleanly |
| isolated Bun package install | passed; `0.80.10` | passed; clean no-models message | not separately exercised; same package contents as Node install |
| Darwin-arm64 Bun binary | passed; `0.80.10` | passed; clean no-models message | entered UI and exited cleanly |

JSON print mode emitted the session record and stopped with the expected missing-provider-key error. RPC print mode exited cleanly without a live provider. No credentials were read from the user profile and no live prompt was sent.

## Platform and evaluation limits

Windows-specific process-tree tests are present in the focused matrix but were skipped on the macOS host. They must pass in the exact-head Windows CI job before platform completion is claimed.

The 12 real-use scenarios in [baseline.md](baseline.md) are not yet live results. Paired runs are required before making any claim about quality, reliability, latency, token usage, or cost. The current evidence establishes build/test/fixture and packaged-startup behavior only.
