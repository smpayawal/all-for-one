# Validation policy and evidence

The smallest relevant checks run first, followed by the repository gate and the requested full test command. A command is reported as pass, fail, or environment-limited; an environment failure is not converted into a pass.

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

The dedicated CI gate builds packages after `npm ci --ignore-scripts` before running the full test command so direct CLI tests resolve fresh workspace distributions. The normal build regenerates network-backed AI catalog sources, so CI first checks that only the explicit generated-path allowlist changed, restores those paths, and then runs a strict clean-worktree assertion; unexpected tracked changes still fail the gate. The build command was run locally because this task explicitly requested it and completed with network access. See the recorded artifact classification in [test-baseline.md](test-baseline.md).

The committed `allforone` HEAD `3258be547c5175043d9fabadace558e27c0f838a` passed GitHub Actions `All-For-One CI` run `29548893362`; its `gate` job and Ubuntu, macOS, and Windows platform-focused jobs completed successfully. Local commit `6c7c349bdd241759928ceeaab69ee896c878307f` is one commit ahead of `allforone` and still requires a clean remote CI run for final CI acceptance.

Live paired task evaluation remains pending. No correctness, latency, token-savings, or cost claim is made from structural fixtures alone.
