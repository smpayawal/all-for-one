<p align="center">
  <img src="packages/coding-agent/src/modes/interactive/assets/all-for-one.png" alt="All-For-One logo" width="180">
</p>

# All-For-One

All-For-One is my personal customization of [Pi](https://github.com/earendil-works/pi). I use it as a terminal coding harness for my own development workflow.

It keeps Pi's adaptive single-agent foundation and compatibility while adding a small set of interface, context, tool, and validation changes that are useful to me. It is not intended as a community project or a replacement for Pi.

## Customizations

- `allforone` as the main command, with `afo` as a shorter alias.
- The Pi-compatible `pi` command and `.pi` configuration.
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

Provider setup, models, themes, extensions, and general configuration follow the [Pi documentation](https://pi.dev/docs/latest).

## Credits

All-For-One is based on [Pi](https://github.com/earendil-works/pi) by Mario Zechner and its contributors.

## License

[MIT](LICENSE)
