# All-For-One validation baseline

Date: 2026-07-18

This document separates historical local evidence from exact-head CI evidence. A test result applies only to the revision that actually ran it. Branch names, moving branch heads, and later commits do not inherit an earlier pass.

## Runtime hardening evidence boundary

The first runtime-release-hardening implementation was committed as:

```text
2f7295f8e7135f01da4fdd07fc678b73cdcd89d3
```

That commit was placed directly on `allforone`, despite the normal focused-branch and pull-request policy. The local results recorded below belong to that implementation revision only. They are not evidence for later follow-up changes.

The follow-up branch `fix/runtime-hardening-followup` must be validated by the complete pull-request workflow on its exact immutable head before merge. The final push to `allforone` must run the push workflow again.

## Historical local checks for `2f7295f8...`

| Command or suite | Recorded result | Classification |
| --- | --- | --- |
| `npm run check` | Passed; Biome checked 856 files and repository gate checks completed. | local repository gate |
| `npm run build` | Passed after fetching model catalogs; generated catalog side effects were restored. | local build |
| isolated `npm test` | Agent-core: 223 passed. AI: 558 passed, 738 skipped. Coding-agent: 1,928 passed, 49 skipped. TUI completed. | local full workspace suite |
| process-tree focused matrix | 12 passed; two Windows tests skipped on macOS. | local process lifecycle coverage |
| profile regressions | 12 passed. | local profile coverage |
| safe-mode suite | 35 passed. | local authorization coverage |
| `doctor:allforone -- --json` | 12/12 checks passed. | local diagnostics |
| All-For-One, context, and execution baselines | Passed their deterministic schemas and scenario inventories. | offline fixture validation |
| non-publishing release artifacts | Four tarballs, a Darwin-arm64 Bun binary, isolated Node install, and isolated Bun package install were created. | local packaging smoke |

The no-skip release command did not complete in the original host session. The artifact phase was rerun with check and test phases skipped only after those phases had completed independently. This is not a full no-skip release-script pass.

## Exact-head merge requirements

A merge or release candidate requires all of the following on the same commit:

1. exact checked-out SHA verification;
2. current `allforone` base ancestry for pull requests;
3. build and `npm run check`;
4. focused process, safe-mode, profile, context, and execution tests;
5. full workspace tests;
6. offline doctors and baselines;
7. upstream relationship verification;
8. generated-file and clean-worktree checks;
9. Ubuntu, macOS, and Windows platform jobs;
10. a final push workflow after merge.

Windows process-tree behavior is not considered complete until the Windows job exercises awaited `taskkill`, descendant discovery, root-exits-first handling, unavailable-helper behavior, and cleanup-failure reporting.

## Evaluation limitation

The 12 real-use scenarios in [baseline.md](baseline.md) are procedures and data requirements, not live benchmark results. Paired runs are required before making claims about quality, reliability, latency, token usage, or cost.
