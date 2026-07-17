# Validation policy and evidence

The smallest relevant checks run first, followed by the repository gate and the requested full test command. A command is reported as pass, fail, or environment-limited; an environment failure is not converted into a pass.

Structural diagnostics:

```bash
npm run check
npm run baseline:allforone -- --json
npm run baseline:context -- --json
npm run baseline:execution -- --json
npm run doctor:allforone -- --json
node scripts/check-upstream-relationship.mjs --json
```

Focused tests use the package-local Vitest runner:

```bash
cd packages/coding-agent
HOME=/private/tmp/afo-test-home node node_modules/vitest/dist/cli.js --run <focused-files>
```

The full `npm test` command is explicitly requested for this repository task, although the repository instructions normally prefer `./test.sh` or package-local focused tests. Its final result and failure classification belong in [test-baseline.md](test-baseline.md).

The dedicated CI gate builds packages after `npm ci --ignore-scripts` before running the full test command so direct CLI tests resolve fresh workspace distributions. The local evidence in this report intentionally did not run the prohibited-by-default build command; see the recorded artifact classification in [test-baseline.md](test-baseline.md).

Live paired task evaluation remains pending. No correctness, latency, token-savings, or cost claim is made from structural fixtures alone.
