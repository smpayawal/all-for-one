# Validation policy and evidence

The smallest relevant checks run first, followed by the repository gate and the requested full test command. A command is reported as pass, fail, or environment-limited; an environment failure is not converted into a pass.

The current remaining-hardening implementation is commit `74c6d0073f26563940a01a33890d453c47b37595` on `fix/remaining-audit-hardening`, based on remote `allforone` `fc5533fc7a7d89f8cbde3d08bc66ceaf77c6e88d`. The exact commit has no available GitHub Actions run, so CI is not reported green. The historical run `29548893362` tested `3258be547c5175043d9fabadace558e27c0f838a` only.

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

The current implementation has no exact-commit GitHub Actions result. A historical `allforone` run is retained only as dated evidence and does not establish CI status for the current remote head or implementation commit.

Live paired task evaluation remains pending. No correctness, latency, token-savings, or cost claim is made from structural fixtures alone.
