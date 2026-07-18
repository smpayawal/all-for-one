# Validation policy and current evidence

Validation starts with the smallest relevant checks, then expands according to risk. Every result is classified as passed, failed, skipped, or environment-limited. An environment limitation is never converted into a pass.

## Evidence rules

- Evidence applies only to the exact commit that ran the check.
- A moving branch name is not a validation identity.
- Local checks do not replace the required GitHub Actions platform matrix.
- A pull-request head must contain the current `allforone` base.
- The merge result must run the push workflow again.
- Generated files and the final worktree must remain clean.
- Live-provider quality, latency, token, and cost claims require paired controlled runs.

## Runtime hardening history

The original runtime-release-hardening implementation was committed as `2f7295f8e7135f01da4fdd07fc678b73cdcd89d3` directly to `allforone`. Its recorded local checks included build, repository checks, full workspace tests, focused process tests, safe-mode and profile tests, offline diagnostics, and non-publishing package smoke checks.

Those results are historical evidence for that commit only. They do not validate the later `fix/runtime-hardening-followup` changes.

## Required pull-request gate

The exact follow-up head must pass:

1. checked-out SHA verification;
2. current `allforone` base ancestry;
3. dependency installation with lifecycle scripts disabled;
4. build;
5. generated-output verification;
6. `npm run check`;
7. focused All-For-One and coding-agent tests;
8. full workspace tests;
9. offline doctors, baselines, and evaluator availability;
10. upstream relationship verification;
11. clean-worktree verification;
12. Ubuntu, macOS, and Windows platform-focused jobs.

The process-focused suites must cover:

- normal completion and nonzero exit;
- independent output bounds;
- timeout and abort classification;
- descendants that ignore graceful termination;
- root-exits-first behavior;
- unavailable Windows discovery and `taskkill` helpers;
- bounded incomplete-cleanup reporting;
- no indefinite wait for an unkillable or unverifiable process tree.

## Packaging and runtime smoke

Before a release, run the non-publishing local release flow and exercise the generated Node and Bun entry points where supported:

- `--version`;
- `--help`;
- offline model listing;
- print startup;
- JSON startup;
- RPC startup;
- interactive startup;
- extension loading;
- session creation and resume;
- Pi-compatible configuration paths.

Automated smoke checks must not consume paid provider access. A missing-provider-key result is an expected limitation, not a successful model prompt.

## Security boundary

Safe mode is authorization-oriented and is not a sandbox. Bash and extension code retain host permissions. Untrusted repositories require an external container, VM, restricted account, or other operating-system isolation boundary.

Process cleanup is best-effort. The runtime must return a bounded, explicit incomplete-cleanup result when the host refuses or cannot verify termination; it must not hang indefinitely or claim successful cleanup without evidence.

## Evaluation boundary

The offline baselines and scenario inventory validate schemas and measurement readiness only. Paired runs with the same repository, prompt, model, context, permissions, and initial state are required before publishing comparative quality, reliability, latency, token, or cost claims.
