# Validation policy and evidence

The smallest relevant checks run first, followed by the repository gate and the requested full test command. A command is reported as pass, fail, or environment-limited; an environment failure is not converted into a pass.

The current fix branch is `smpayawal/fix-secure-context-windows-validation`, created from `allforone` commit `3fa5a2b505b79d4f6b07be46bce98959db03e251`.

Validation is pinned to immutable commits and a workflow run:

```text
validatedImplementationCommit: 74208c65e8522ea9988ebaf2d44782c127f754e8
validationEvidenceCommit: da9a2408e8fe2b0f1344982f3841a1995de97c51
workflowTestedCommit: 74208c65e8522ea9988ebaf2d44782c127f754e8
workflowRunId: 29568117295
```

The exact workflow run tested `validatedImplementationCommit`. Its Ubuntu gate and Ubuntu, macOS, and Windows focused jobs all passed, including build, full test, focused test, and clean-worktree steps. `validationEvidenceCommit` identifies the separate documentation commit that records this evidence; it is pinned by a documentation-only follow-up because a commit cannot contain its own SHA. No moving branch-head claim is used.

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

The exact workflow result above is the CI evidence for this implementation commit. Local `npm test` and `npm run build` were environment-limited as recorded in [test-baseline.md](test-baseline.md); those failures were not converted into passes. No correctness, latency, token-savings, or cost claim is made from structural fixtures or from the local environment-limited commands.

Live paired task evaluation remains pending. No correctness, latency, token-savings, or cost claim is made from structural fixtures alone.
