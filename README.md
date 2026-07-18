<p align="center">
  <img src="packages/coding-agent/src/modes/interactive/assets/all-for-one.png" alt="All-For-One logo" width="180">
</p>

# All-For-One

*A terminal-first coding harness based on Pi.*

All-For-One is an independently maintained fork of [Pi](https://github.com/earendil-works/pi). It keeps Pi's lightweight, adaptive single-agent architecture while maintaining its own product identity, release direction, and focused coding-workflow changes.

The primary command is `allforone`, with `afo` as a short alias. The original `pi` command remains available for compatibility. Existing `.pi` configuration, `PI_*` environment variables, package names, sessions, extensions, SDK exports, and RPC interfaces are intentionally preserved.

## Changes from Pi

All-For-One currently includes:

- All-For-One branding and a responsive session rail for activity, tools, loaded context, and skills.
- Native, patch, and full tool profiles, with `edit` as the default existing-file mutation path and `apply_patch` available when selected.
- Path-scoped project instructions, project-specific local memory, bundled coding skills, and bounded repository orientation.
- Optional repository-grounded validation, execution safeguards, compaction diagnostics, and offline maintenance reports.
- Dedicated CI and upstream relationship checks for the `allforone` branch.

The project remains close to Pi and does not introduce a separate workflow engine or permanent agent hierarchy.

## Relationship to Pi

[Pi](https://github.com/earendil-works/pi) remains the architectural upstream and the primary reference for general providers, extensions, skills, themes, and compatibility behavior.

This repository uses the following branch structure:

- `main` tracks upstream Pi.
- `allforone` is the official All-For-One development and integration branch.
- `sync/pi-*` branches integrate an updated Pi baseline into `allforone` through review.
- Focused development branches start from `allforone`.

All-For-One releases use an independent product version and record the Pi version used as their compatibility baseline. Internal Pi package versions remain unchanged unless a deliberate package migration is designed and tested.

### Upstream synchronization

The `Upstream Pi Sync` workflow checks the relationship between native Pi, `main`, and `allforone` every week and on demand.

Its manual actions are intentionally separate:

- `check` reports drift without changing the repository.
- `update-main` fast-forwards `main` only when its history is a clean ancestor of upstream Pi.
- `prepare-sync` performs the same verified fast-forward, then creates a `sync/pi-*` branch and pull request into `allforone` when the merge is conflict-free.

The workflow never force-pushes, never writes All-For-One changes to `main`, and never automatically merges a synchronization pull request. A conflict stops the workflow and must be resolved on a focused `sync/pi-*` branch.

## Run from source

All-For-One requires Node.js 22.19 or later.

```bash
git clone https://github.com/smpayawal/all-for-one.git
cd all-for-one

npm install --ignore-scripts
npm run build
node packages/coding-agent/dist/allforone-cli.js
```

The Pi-compatible source launcher remains available:

```bash
./pi-test.sh
```

On Windows, run either built entry point directly with Node.js.

Provider authentication, model configuration, settings, and customization continue to follow the standard [Pi documentation](https://pi.dev/docs/latest) where All-For-One has not documented a difference.

### Environment compatibility

All-For-One accepts product-prefixed aliases for the public Pi runtime variables:

| All-For-One | Pi-compatible runtime variable |
|---|---|
| `AFO_CODING_AGENT_DIR` | `PI_CODING_AGENT_DIR` |
| `AFO_CODING_AGENT_SESSION_DIR` | `PI_CODING_AGENT_SESSION_DIR` |
| `AFO_PACKAGE_DIR` | `PI_PACKAGE_DIR` |
| `AFO_OFFLINE` | `PI_OFFLINE` |
| `AFO_TELEMETRY` | `PI_TELEMETRY` |
| `AFO_SHARE_VIEWER_URL` | `PI_SHARE_VIEWER_URL` |

Existing `PI_*` variables remain supported. When both names are set, the `AFO_*` value is used and a warning identifies the conflicting variable names. All-For-One continues to use `.pi` for configuration and session compatibility; this alias layer does not create or migrate to a `.allforone` directory.

## Releases

Standalone releases use tags in the form `afo-vX.Y.Z`. Each release records both the All-For-One version and its Pi compatibility baseline.

Release assets include archives for supported macOS, Linux, and Windows targets, a release manifest, and SHA-256 checksums. The archives provide `allforone` as the primary executable and retain `afo` and `pi` compatibility launchers.

All-For-One is distributed through GitHub Releases. The internal `@earendil-works/pi-*` workspace names remain available for source compatibility but are marked private in the downstream branch and are not published to npm. Inherited Pi publish and `v*` release commands fail closed outside the upstream `earendil-works/pi` workspace. Packaging dry runs remain available for validation without enabling publication.

## Development

From the repository root:

```bash
npm install --ignore-scripts
npm run build
npm run check
./test.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and [AGENTS.md](AGENTS.md) for repository-specific development rules.

## Security

All-For-One runs with the permissions of the user who starts it. Approval prompts authorize actions but do not provide security isolation.

Use a container, virtual machine, or another sandbox when stronger boundaries are required. See [SECURITY.md](SECURITY.md) and Pi's [containerization guide](packages/coding-agent/docs/containerization.md).

## License

All-For-One is derived from Pi and is distributed under the [MIT License](LICENSE).
