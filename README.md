<p align="center">
  <img src="packages/coding-agent/src/modes/interactive/assets/all-for-one.png" alt="All-For-One logo" width="180">
</p>

# All-For-One

*My personal fork of [Pi](https://github.com/earendil-works/pi).*

All-For-One is a lightweight terminal coding harness based on Pi. I use it as my day-to-day coding agent and maintain a small set of changes that fit the way I work.

It keeps Pi's core behavior, so existing `.pi` configuration and the original `pi` command continue to work.

## What changed

- `allforone` as the main command, with `afo` as a shorter alias.
- A session rail for activity, tools, loaded context, and skills.
- Tool profiles for normal editing, patch-based work, or full access.
- Project instructions, local project memory, and built-in coding skills.
- Optional validation and execution checks.

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

Standalone releases use GitHub Releases and include builds for macOS, Linux, and Windows. Each archive provides `allforone`, `afo`, and the compatible `pi` launcher.

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
