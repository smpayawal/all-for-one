# Validation policy and evidence

The smallest relevant checks run first, followed by the repository gate and the requested full test command. A command is reported as pass, fail, or environment-limited; an environment failure is not converted into a pass.

The current fix branch is `smpayawal/fix-context-integrity-tool-hooks`, created from `allforone` commit `b605e39438cf0c7b5f979c336632853c3074fe8c`.

Validation is pinned to immutable commits and a workflow run:

```text
validatedImplementationCommit: 31a7942a5662fe455ecc2a88d6a38b9bfa218d62
validationEvidenceCommit: 31a7942a5662fe455ecc2a88d6a38b9bfa218d62
workflowTestedCommit: 31a7942a5662fe455ecc2a88d6a38b9bfa218d62
workflowRunId: 29564566021
```

The local evidence was rerun after the implementation commit and before this documentation follow-up, so `validationEvidenceCommit` is intentionally the same immutable implementation SHA rather than a moving branch reference. The exact workflow run tested that SHA: the Ubuntu gate, Ubuntu focused, and macOS focused jobs passed; the Windows focused job failed on a pre-existing `test/memory.test.ts` assertion also present in baseline run `29562303888`. CI is therefore not reported green.

Structural diagnostics:

```bash
npm run check
npm run baseline:allforone -- --json
npm run baseline:context -- --json
npm run baseline:execution -- --json
npm run doctor:allforone -- --json
node scripts/check-upstream-relationship.mjs --main origin/main --json
```

Focused tests use the package-local Vitest runner:

```bash
cd packages/coding-agent
HOME=/private/tmp/afo-test-home node node_modules/vitest/dist/cli.js --run <focused-files>
```

The full `npm test` command is explicitly requested for this repository task, although the repository instructions normally prefer `./test.sh` or package-local focused tests. Its final result and failure classification belong in [test-baseline.md](test-baseline.md).

The dedicated CI gate builds packages after `npm ci --ignore-scripts` before running the full test command so direct CLI tests resolve fresh workspace distributions. The normal build regenerates network-backed AI catalog sources, so CI first checks that only `packages/ai/src/models.generated.ts`, `packages/ai/src/image-models.generated.ts`, and direct `packages/ai/src/providers/*.models.ts` paths changed, restores only those paths, and then runs a strict clean-worktree assertion; handwritten provider modules, nested provider files, and other changes fail the gate. See the recorded artifact classification in [test-baseline.md](test-baseline.md).

The exact workflow result above is the only CI evidence for this implementation commit. No correctness, latency, token-savings, or cost claim is made from structural fixtures or from the partial platform result.

Live paired task evaluation remains pending. No correctness, latency, token-savings, or cost claim is made from structural fixtures alone.
