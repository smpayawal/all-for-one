# Release policy

This hardening pass does not create commits, tags, releases, pushes, or pull requests. User-staged and user-unstaged work remains in the shared worktree.

Before a future release:

1. review the package changelog `[Unreleased]` sections;
2. run `npm run check` and the appropriate focused tests;
3. run the repository-requested release smoke tests from outside the checkout;
4. inspect generated lockfile/shrinkwrap changes; and
5. obtain explicit authorization before committing or pushing.

Dependency changes remain reviewed code. Use exact versions and `npm ci --ignore-scripts` for clean validation. Do not reinstall or remove `node_modules` merely to hide an environment failure.

## Non-publishing local smoke validation

The repository-provided release tool keeps artifacts outside the checkout. Run it from the repository root with a disposable output directory:

```bash
npm run release:local -- --out /tmp/pi-allforone-release --force
```

This runs the documented check/test/build/package path, creates Node tarballs and an isolated Node install, and builds the Bun binary/install when Bun is available. Use `--skip-bun-install` only to omit the second package install; the binary build still requires Bun. `--skip-install` is limited to tarball creation and is not a complete runtime smoke test.

Run the generated Node and, where supported, Bun entry points from outside the checkout with disposable configuration and session directories:

```bash
SMOKE_ROOT=/tmp/pi-allforone-release
SMOKE_HOME=/tmp/pi-allforone-home
SMOKE_AGENT=/tmp/pi-allforone-agent
export HOME="$SMOKE_HOME" PI_CODING_AGENT_DIR="$SMOKE_AGENT"

"$SMOKE_ROOT/node/pi" --offline --version
"$SMOKE_ROOT/node/pi" --offline --help
"$SMOKE_ROOT/node/pi" --offline --list-models
"$SMOKE_ROOT/node/pi" --offline --no-session --print "smoke prompt"
"$SMOKE_ROOT/node/pi" --offline --no-session --mode json --print "smoke prompt"
printf '{"id":"smoke","method":"get_state"}\n' | "$SMOKE_ROOT/node/pi" --offline --mode rpc
"$SMOKE_ROOT/node/pi" --offline --session-dir /tmp/pi-allforone-sessions --session-id smoke
```

Repeat the same `--version`, `--help`, `--list-models`, print, JSON, RPC, and interactive-start checks with `"$SMOKE_ROOT/bun/pi"` when the Bun artifact exists. The extension/session/config checks use an existing Pi-compatible config directory, `--extension packages/coding-agent/examples/extensions/safe-mode.ts`, a disposable `--session-dir`, and a second invocation with `--resume` or `--continue`. Interactive mode is a manual bounded smoke check; terminate it after startup if no safe test provider is configured.

Print, JSON, RPC, and interactive prompting may require a safe test credential. Automated checks must not use paid provider access; a no-credential or offline startup failure is recorded as a limitation, not a successful provider prompt. Confirm the executable still identifies as `pi`, built-in Pi command/option names remain present, `main` needs no All-For-One change, and no publish, tag, release, registry, or credential action occurs during the smoke run.
