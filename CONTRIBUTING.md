# Contributing to All-For-One

All-For-One is an independent downstream project based on Pi. Keep changes small, focused, and consistent with the existing architecture.

## Contribution guidelines

- Preserve Pi architecture and package boundaries.
- Prefer extensions or optional modules when functionality does not belong in the core.
- Avoid unnecessary dependencies and broad refactors.
- Do not edit unrelated files.
- Understand and review agent-generated changes before submitting them.
- Document user-visible or compatibility-affecting behavior.

## Branches

- Create work from `allforone`.
- Submit changes back to `allforone`.
- Do not add All-For-One features to `main`.
- Do not merge `allforone` into `main` or rewrite its published history.

Upstream synchronization branches use the form `sync/pi-*`. These pull requests must be merged with a merge commit. Do not squash or rebase them because `main` must remain an ancestor of `allforone`. After review and successful checks, use the `merge-sync` action in the Upstream Pi Sync workflow with the pull request number.

## Downstream ownership

Keep behavior in the narrowest correct Pi layer. The All-For-One product namespace is not a general destination for downstream code.

| Area | Ownership |
| --- | --- |
| `packages/coding-agent/src/allforone/` | Product identity, command presentation, and compatibility aliases only. |
| `packages/agent/` | Provider-independent agent loop and runtime behavior shared by every mode. |
| `packages/coding-agent/src/core/` | Sessions, compaction, memory, scoped context, validation, tools, and coding-agent policy. |
| `packages/coding-agent/src/extensions/` | Optional repository mapping, validation, and other extension-owned behavior. |
| `packages/coding-agent/src/modes/interactive/` | TUI-only presentation such as the session rail and brand header. |

Do not move a feature solely to make it look more All-For-One-specific. Extract a downstream module only when it creates a narrow interface, preserves Pi behavior, and measurably reduces ownership or upstream merge conflicts.

## Validation

Run the smallest relevant checks before opening a pull request. At minimum, use `npm run check`; run `./test.sh` when the change affects runtime behavior or test coverage. Do not claim that tests passed unless they were actually run.

For dependency, build, or package changes, use the broader checks as appropriate:

```bash
npm install --ignore-scripts
npm run build
npm run check
./test.sh
```

Report any check that was not run or was limited by the environment. Follow the repository rules in [AGENTS.md](AGENTS.md).

## Releases

All-For-One releases use `afo-v*` tags and GitHub Releases. The inherited Pi package publication commands are not part of the downstream release process. See [RELEASING.md](RELEASING.md).
