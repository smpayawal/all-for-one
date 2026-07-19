# Contributing to All-For-One

All-For-One is an independent downstream project based on Pi. Keep changes small, focused, and consistent with the existing architecture.

## Contribution guidelines

- Preserve stable package boundaries and Pi-compatible contracts unless a change is intentional, documented, and tested.
- Prefer extensions or optional modules when functionality does not belong in the core.
- Avoid unnecessary dependencies and broad refactors.
- Do not edit unrelated files.
- Understand and review agent-generated changes before submitting them.
- Document user-visible or compatibility-affecting behavior.

## Branches

- `main` is the official All-For-One product branch.
- Create focused product work from `main` and submit changes back to `main`.
- `pi` is the read-only native Pi reference branch.
- Never add All-For-One product changes to `pi`.
- Do not merge the complete `pi` branch into `main` by default.

Selective upstream adoption branches use the form `adopt/pi-<short-sha>-<topic>`. Create them from `main`, identify the exact source Pi commit, and port only the changes that solve a demonstrated All-For-One requirement. Provider catalog updates, security fixes, platform fixes, and relevant runtime corrections are normal adoption candidates.

## Downstream ownership

Keep behavior in the narrowest correct layer. The All-For-One product namespace is not a general destination for downstream code.

| Area | Ownership |
| --- | --- |
| `packages/coding-agent/src/allforone/` | Product identity, command presentation, and compatibility aliases only. |
| `packages/agent/` | Provider-independent agent loop and runtime behavior shared by every mode. |
| `packages/coding-agent/src/core/` | Sessions, compaction, memory, scoped context, validation, tools, and coding-agent policy. |
| `packages/coding-agent/src/extensions/` | Optional repository mapping, validation, and other extension-owned behavior. |
| `packages/coding-agent/src/modes/interactive/` | TUI-only presentation such as the session rail and brand header. |

Do not move a feature solely to make it look more All-For-One-specific. Extract a downstream module only when it creates a narrow interface, preserves required compatibility, and measurably reduces ownership or maintenance cost.

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

All-For-One releases use `afo-v*` tags and GitHub Releases from `main`. The inherited Pi package publication commands are not part of the downstream release process. See [RELEASING.md](RELEASING.md).
