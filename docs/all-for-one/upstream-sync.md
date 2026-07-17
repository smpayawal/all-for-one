# Upstream synchronization

The branch model is intentionally simple:

```text
main  ->  allforone
```

`allforone` must be based on `main`; dedicated work branches are not part of the workflow. The read-only relationship check is:

```bash
node scripts/check-upstream-relationship.mjs --json
node --test scripts/check-upstream-relationship.test.mjs
```

The verifier checks that local `main` is an ancestor of the current branch and reports ahead/behind counts. It does not fetch, merge, rebase, switch branches, or modify the worktree.

The dedicated workflow is `.github/workflows/allforone-ci.yml`. It runs on `allforone` pull requests/pushes, has a scheduled check, uses pinned actions, installs with `npm ci --ignore-scripts`, runs the repository gate and tests, and includes a focused cross-platform matrix. It has no secrets and no automatic upstream merge.

Before synchronization, fetch upstream in a controlled environment, run the verifier, inspect the diff against `upstream/main`, and rehearse any merge in a temporary worktree. Do not use a rehearsal to overwrite the shared worktree or discard unrelated staged changes.

The 2026-07-17 rehearsal used `upstream/main` at `f7e060374541be0097ee015aaddb097a4f760984` and a temporary commit containing the current worktree snapshot. The merge-tree rehearsal found one content conflict in `packages/coding-agent/package.json`; the remaining changed files had no reported merge conflict. The shared `allforone` worktree was not merged, rebased, switched, or reset.
