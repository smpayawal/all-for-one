# Development Rules

## Conversational Style

- Keep answers short and concise.
- No emojis in commits, issues, PR comments, or code.
- No fluff or cheerful filler text.
- Technical prose only; be direct.
- When the user asks a question, answer it first before making edits or running implementation commands.
- When responding to user feedback or an analysis, explicitly say whether you agree or disagree before saying what changed.

## Code Quality

- Read files in full before wide-ranging changes, before editing files you have not fully inspected, and when asked to investigate or audit. Do not rely on search snippets for broad changes.
- No `any` unless absolutely necessary.
- Inline single-line helpers that have only one call site.
- Check `node_modules` for external API types; do not guess.
- **No inline imports** (`await import()`, `import("pkg").Type`, dynamic type imports). Top-level imports only.
- Never remove or downgrade code to fix type errors from outdated dependencies; upgrade the dependency instead.
- Use only erasable TypeScript syntax (Node strip-only mode) in code checked by the root config (`packages/*/src`, `packages/*/test`, `packages/coding-agent/examples`): no parameter properties, `enum`, `namespace`/`module`, `import =`, `export =`, or other constructs needing JavaScript emit. Use explicit fields with constructor assignments.
- Always ask before removing functionality or code that appears intentional.
- Preserve Pi-compatible public contracts unless a migration is explicitly requested, designed, documented, and tested.
- Never hardcode key checks such as `matchesKey(keyData, "ctrl+x")`. Add defaults to `DEFAULT_EDITOR_KEYBINDINGS` or `DEFAULT_APP_KEYBINDINGS` so they stay configurable.
- Never modify `packages/ai/src/models.generated.ts` directly; update `packages/ai/scripts/generate-models.ts` instead, then regenerate. Including the resulting `models.generated.ts` diff is acceptable even if regeneration includes unrelated upstream model metadata changes.

## All-For-One release and upstream reference

These rules apply to `main` and branches derived from it. They override the inherited Pi release guidance later in this file.

- `main` is the official All-For-One product branch.
- `pi` is the native Pi reference branch. Keep it free of All-For-One product commits.
- Follow [RELEASING.md](RELEASING.md) for All-For-One releases.
- All-For-One releases use `afo-v*` tags and GitHub Releases only.
- Never run inherited Pi package publication or release commands on `main` or product branches, including `npm run publish`, `npm run release:patch`, `npm run release:minor`, `npm run release:major`, or `npm run release:fix-links`.
- Keep the internal `@earendil-works/pi-*` workspace packages private downstream.
- Do not merge the complete `pi` branch into `main` by default.
- Create selective upstream adoption branches from `main` using `adopt/pi-<short-sha>-<topic>`.
- Record the exact source Pi commit in each adoption pull request and port only the relevant changes.

## Commands

- After code changes, run `npm run check` with full output. Fix all errors, warnings, and informational diagnostics before committing. This command does not run tests.
- Never run `npm run build` or `npm test` unless requested by the user.
- Never run the full Vitest suite directly: it includes end-to-end tests that activate when endpoint or authentication environment variables are present. For all non-end-to-end tests, run `./test.sh` from the repository root. Otherwise run specific tests from the package root: `node ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts`.
- If you create or modify a test file, run it and iterate on the test or implementation until it passes.
- For `packages/coding-agent/test/suite/`, use `test/suite/harness.ts` and the faux provider. Do not use real provider APIs, keys, or paid tokens.
- Put issue-specific regressions under `packages/coding-agent/test/suite/regressions/` named `<issue-number>-<short-slug>.test.ts`.
- For ad hoc scripts, write them to a temporary file, run and edit them there, then remove them. Do not embed multi-line scripts in shell commands.
- Never commit unless the user asks.

## Dependency and Install Security

- Treat npm dependency and lockfile changes as reviewed code. Direct external dependencies stay pinned to exact versions.
- Hydrate or update locally with `npm install --ignore-scripts`; use `npm ci --ignore-scripts` for clean or CI-style installs. Do not run lifecycle scripts unless the user asks.
- If dependency metadata changes, refresh `package-lock.json` with `npm install --package-lock-only --ignore-scripts`.
- If `packages/coding-agent/npm-shrinkwrap.json` needs regeneration, run `node scripts/generate-coding-agent-shrinkwrap.mjs`; verify with `--check` or `npm run check`. New dependencies with lifecycle scripts require review and an explicit allowlist entry in that script.
- Pre-commit blocks lockfile commits unless `PI_ALLOW_LOCKFILE_CHANGE=1`. Do not bypass it unless the user wants the lockfile change committed.

## Git

Multiple All-For-One sessions may be running in the same working directory, each modifying different files. Git operations that touch unstaged, staged, or untracked files outside your own changes can overwrite other sessions' work.

Committing:

- Only commit files changed in the current session.
- Stage explicit paths; never use `git add -A` or `git add .`.
- Before committing, run `git status` and verify that only intended files are staged.
- `packages/ai/src/models.generated.ts` may be included alongside files that required its regeneration.
- Message format: `{feat,fix,docs}[(ai,tui,agent,coding-agent)]: <commit message>`. Keep messages concise and informative.

Never run:

- `git reset --hard`
- `git checkout .`
- `git clean -fd`
- `git stash`
- `git add -A`
- `git add .`
- `git commit --no-verify`
- force pushes

If rebase conflicts occur:

- Resolve conflicts only in files you modified.
- If a conflict is in a file you did not modify, abort and ask the user.

## Issues and PRs

Follow this file for repository workflow and [RELEASING.md](RELEASING.md) for the downstream release process.

When reviewing pull requests:

- Do not run `gh pr checkout`, `git switch`, or otherwise move the worktree to the pull request branch unless the user explicitly asks.
- Use `gh pr view`, `gh pr diff`, `gh api`, and local `git show` or `git diff` against fetched refs to inspect pull request metadata, commits, and patches without changing branches.
- If you need pull request file contents, fetch or read them into temporary files, or use `git show <ref>:<path>` without switching branches.

When creating issues:

- Add `pkg:*` labels for affected packages (`pkg:agent`, `pkg:ai`, `pkg:coding-agent`, `pkg:tui`); use all that apply.

When posting issue or pull request comments:

- Write the comment to a temporary file and post with `gh issue/pr comment --body-file`.
- Keep comments concise, technical, and consistent with the user's tone.
- End every AI-posted comment with the AI-generated disclaimer required by the originating prompt.

When closing issues through a commit:

- Include `fixes #<number>` or `closes #<number>` in the message. Repeat the keyword for each issue.

## Testing All-For-One interactive mode with tmux

Run the TUI in a controlled terminal from the repository root:

```bash
tmux new-session -d -s afo-test -x 80 -y 24
tmux send-keys -t afo-test "node packages/coding-agent/dist/allforone-cli.js" Enter
sleep 3 && tmux capture-pane -t afo-test -p
tmux send-keys -t afo-test "your prompt here" Enter
tmux send-keys -t afo-test Escape
tmux kill-session -t afo-test
```

The Pi-compatible launcher may still be tested with `./pi-test.sh` when compatibility is in scope.

## Changelog

Location: `packages/*/CHANGELOG.md`, one per package.

Sections under `## [Unreleased]`: `### Breaking Changes`, `### Added`, `### Changed`, `### Fixed`, and `### Removed`.

Rules:

- All new entries go under `## [Unreleased]`. Read the full section first and append to existing subsections; never duplicate them.
- Released version sections are immutable.

Attribution:

- Internal upstream issue: `Fixed foo bar ([#123](https://github.com/earendil-works/pi-mono/issues/123))`
- External upstream contribution: `Added feature X ([#456](https://github.com/earendil-works/pi-mono/pull/456) by [@username](https://github.com/username))`

## Upstream Pi release reference

This section is retained only to understand native Pi maintenance. Do not run these commands on `main` or product branches. Use [RELEASING.md](RELEASING.md) for All-For-One.

Native Pi uses lockstep package versioning. Its release process may include changelog review, local Node and Bun smoke tests, package release commands, tag workflows, and npm publication. Treat those steps only as upstream reference material; they are not the All-For-One release path.

## All-For-One compatibility

On `main` and branches derived from it, Pi compatibility is a product requirement. Preserve Pi commands, identifiers, APIs, data formats, extension behavior, SDK behavior, sessions, and RPC contracts unless a migration is explicitly designed, documented, and tested.

This requirement does not authorize changing `pi`, broadly importing upstream code, or preserving every upstream implementation detail. Compatibility and implementation ownership are separate decisions.

## User Override

If the user's instructions conflict with a rule in this document, ask for explicit confirmation before overriding it.
