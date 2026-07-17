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
