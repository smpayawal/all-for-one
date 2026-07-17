# Upstream synchronization

The branch model is intentionally simple:

```text
upstream Pi  ->  main  ->  allforone  ->  focused work branches
```

`main` is the local mirror of upstream Pi, and `allforone` is the downstream integration branch. Focused work branches may start from `allforone` and should return through pull requests targeting `allforone`. Never merge `allforone` into `main`, rebase the published `allforone` branch, or use a focused branch as a replacement for the integration branch. The read-only relationship check is:

```bash
node scripts/check-upstream-relationship.mjs --main origin/main --json
node --test scripts/check-upstream-relationship.test.mjs
```

The verifier checks that local `main` is an ancestor of the current branch and reports ahead/behind counts; the CI job passes `origin/main` explicitly because it does not create or mutate a local comparison branch. It does not fetch, merge, rebase, switch branches, or modify the worktree.

The dedicated workflow is `.github/workflows/allforone-ci.yml`. It runs on pull requests targeting `allforone` and pushes to `allforone`, uses pinned actions, installs with `npm ci --ignore-scripts`, runs the repository gate and tests, and includes a focused cross-platform matrix. The existing build refreshes network-backed AI catalog files, so the workflow first checks that only `packages/ai/src/models.generated.ts`, `packages/ai/src/image-models.generated.ts`, and direct `packages/ai/src/providers/*.models.ts` paths changed, restores only those paths, and then checks for unexpected worktree changes. The repository default branch is `main`, so a workflow file that exists only on `allforone` cannot receive scheduled or manual-dispatch events until it is merged into the default branch; this workflow deliberately uses branch-targeted triggers instead. It has no secrets and no automatic upstream merge.

Before synchronization, fetch upstream in a controlled environment, run the verifier, inspect the diff against `upstream/main`, and rehearse any merge in a temporary worktree. Do not use a rehearsal to overwrite the shared worktree or discard unrelated staged changes.

The 2026-07-17 rehearsal used `upstream/main` at `f7e060374541be0097ee015aaddb097a4f760984` and a temporary commit containing the current worktree snapshot. The merge-tree rehearsal found one content conflict in `packages/coding-agent/package.json`; the remaining changed files had no reported merge conflict. The shared `allforone` worktree was not merged, rebased, switched, or reset.
