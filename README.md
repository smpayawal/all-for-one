# All-For-One

<p align="center">
  <img src="packages/coding-agent/src/modes/interactive/assets/all-for-one.png" alt="All-For-One logo" width="180">
</p>

All-For-One is a lightweight coding harness based on Pi. It preserves Pi's provider, agent runtime, terminal UI, session, SDK, and extension architecture while adding focused changes for context handling, execution integrity, validation, and maintainability.

## Overview

All-For-One is an independent downstream project. [Pi](https://github.com/earendil-works/pi) remains the upstream project, and All-For-One is not presented as the official Pi distribution. Native Pi package boundaries, compatibility identifiers, and command behavior are intentionally retained, including the `pi` CLI, `.pi` configuration directory, `PI_*` environment variables, session formats, extension interfaces, and SDK exports.

The main coding-agent runtime keeps Pi's adaptive single-agent design. It does not require a general orchestration layer or workflow engine.

## Changes from Pi

The current `allforone` branch adds or records:

- a canonical five-tool coding registry with a four-tool default active set: `read`, `bash`, `edit`, and `write`; `apply_patch` remains available through the patch/full profiles or explicit configuration;
- bounded context and skill diagnostics, including path-scoped instruction handling;
- `apply_patch` mutation safeguards with concurrent-change detection and best-effort rollback;
- context and execution-integrity checks plus in-memory compaction telemetry;
- offline baseline, doctor, and evaluator commands, with a read-only upstream relationship check; and
- focused branch CI and validation documentation.

These are repository-level capabilities and diagnostics. No measured quality, latency, token, cost, or performance improvement is claimed from them. Enforcement remains opt-in where documented. Detailed internal engineering notes and evaluation records are intentionally maintained outside this public repository.

## Packages

The native Pi package names and boundaries are retained:

| Package | Description |
|---------|-------------|
| **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API |
| **[@earendil-works/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | Interactive coding-agent CLI |
| **[@earendil-works/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
| **[@earendil-works/pi-orchestrator](packages/orchestrator)** | Experimental orchestration package |

## Development

From the repository root:

```bash
npm install --ignore-scripts
npm run build
npm run check
./test.sh
./pi-test.sh
```

`./pi-test.sh` runs the `pi` CLI from source. See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution expectations and [AGENTS.md](AGENTS.md) for repository rules.

## Upstream compatibility

The branch relationship is:

```text
upstream Pi -> main -> allforone -> focused work branches
```

`main` remains the clean local mirror of upstream Pi. `allforone` is the official All-For-One development and integration branch. Focused branches start from `allforone` and return to it; All-For-One changes do not belong on `main`, and the published `allforone` history is not rewritten.

## Security

All-For-One runs locally with the permissions of the current user. Approval prompts authorize actions but are not a security sandbox. Use a container, virtual machine, or other sandbox for stronger isolation. See [SECURITY.md](SECURITY.md) and the [containerization guide](packages/coding-agent/docs/containerization.md).

## License

All-For-One is derived from Pi and is distributed under the MIT License. See [LICENSE](LICENSE).
