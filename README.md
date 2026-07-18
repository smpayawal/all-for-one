<p align="center">
  <img src="packages/coding-agent/src/modes/interactive/assets/all-for-one.png" alt="All-For-One logo" width="180">
</p>

# All-For-One

*A personal Pi fork with focused coding-workflow changes.*

All-For-One is a personal fork of [Pi](https://github.com/earendil-works/pi). It keeps Pi's lightweight, terminal-first, single-agent design while adding a small set of changes for my own development workflow.

The fork preserves Pi's `pi` command, `.pi` configuration directory, package names, sessions, extensions, SDK, and RPC interfaces.

## Changes from Pi

All-For-One currently includes:

- All-For-One branding and a responsive session rail for activity, tools, loaded context, and skills.
- Native, patch, and full tool profiles, with `edit` as the default existing-file mutation path and `apply_patch` available when selected.
- Path-scoped project instructions, project-specific local memory, bundled coding skills, and bounded repository orientation.
- Optional repository-grounded validation, execution safeguards, compaction diagnostics, and offline maintenance reports.
- Dedicated CI and upstream relationship checks for the `allforone` branch.

The project remains close to Pi and avoids introducing a separate workflow engine or permanent agent hierarchy.

## Relationship to Pi

[Pi](https://github.com/earendil-works/pi) is the upstream project and remains the primary reference for general usage, configuration, providers, extensions, skills, and themes.

This repository uses the following branch structure:

- `main` tracks upstream Pi.
- `allforone` contains the All-For-One changes.
- Focused development branches start from `allforone`.

## Run from source

All-For-One requires Node.js 22.19 or later.

```bash
git clone https://github.com/smpayawal/all-for-one.git
cd all-for-one

npm install --ignore-scripts
npm run build
./pi-test.sh
```

On Windows, run the built CLI directly:

```bash
node packages/coding-agent/dist/cli.js
```

Provider authentication, model configuration, settings, and customization follow the standard [Pi documentation](https://pi.dev/docs/latest).

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
