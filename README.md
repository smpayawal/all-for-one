<p align="center">
  <img src="packages/coding-agent/src/modes/interactive/assets/all-for-one.png" alt="All-For-One logo" width="180">
</p>

# All-For-One

*A personal coding harness based on [Pi](https://github.com/earendil-works/pi).*

All-For-One is my fork of Pi, adjusted for the way I use a coding agent day to day. It keeps Pi's small, terminal-first design and adds the tools, context handling, safeguards, and interface changes I prefer.

The goal is simple: keep the straightforward Pi experience while making it a better fit for my own workflow.

## What is different?

- `allforone` as the main command, with `afo` as a shorter alias.
- A session rail for activity, tools, loaded context, and skills.
- Native, patch, and full tool profiles.
- Project-scoped instructions, local project memory, and built-in coding skills.
- Optional validation, execution safeguards, and compaction diagnostics.

All-For-One still uses `.pi` and keeps the original `pi` command, settings, sessions, extensions, SDK, and RPC interfaces compatible.

## Run from source

Requires Node.js 22.19 or later.

```bash
git clone https://github.com/smpayawal/all-for-one.git
cd all-for-one

npm install --ignore-scripts
npm run build
node packages/coding-agent/dist/allforone-cli.js
```

The Pi-compatible source launcher is also available:

```bash
./pi-test.sh
```

Provider setup, models, themes, extensions, and general configuration continue to follow the [Pi documentation](https://pi.dev/docs/latest).

## Releases

Standalone builds for macOS, Linux, and Windows are published through [GitHub Releases](https://github.com/smpayawal/all-for-one/releases).

The release archives provide `allforone`, `afo`, and the compatible `pi` launcher.

## Development

```bash
npm install --ignore-scripts
npm run build
npm run check
./test.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and [AGENTS.md](AGENTS.md) for repository-specific development notes.

## Security

All-For-One runs with the permissions of the user who starts it. Use a container, virtual machine, or another sandbox when stronger isolation is required.

See [SECURITY.md](SECURITY.md) and Pi's [containerization guide](packages/coding-agent/docs/containerization.md).

## Credits

All-For-One is built from [Pi](https://github.com/earendil-works/pi) by Mario Zechner and its contributors.

## License

[MIT](LICENSE)
