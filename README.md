# All-For-One

<p align="center">
  <img src="packages/coding-agent/src/modes/interactive/assets/all-for-one.png" alt="All-For-One logo" width="180">
</p>

All-For-One is a lightweight coding harness based on Pi. It preserves Pi's provider, agent runtime, terminal UI, session, SDK, and extension architecture while retaining focused changes for context integrity, reliable execution evidence, usability, and maintainability.

## Overview

All-For-One is an independent downstream project. [Pi](https://github.com/earendil-works/pi) remains the upstream project, and All-For-One is not presented as the official Pi distribution. Native Pi package boundaries, compatibility identifiers, and command behavior are intentionally retained, including the `pi` CLI, `.pi` configuration directory, `PI_*` environment variables, session formats, extension interfaces, and SDK exports.

The normal coding-agent runtime keeps Pi's adaptive single-agent design. It does not require a request-classifier model, workflow engine, permanent reviewer or validator agent, semantic retrieval layer, or general orchestration hierarchy.

The approved P0-P5 plan begins by auditing and simplifying the current downstream divergence. After optional behavior is made lazy and duplicate or speculative machinery is removed, the first new product feature is the terminal UI/UX foundation. P1 then introduces a minimal active mutation profile, P2 adds exactly five progressive-disclosure Native Pi skills, P3 clarifies knowledge ownership, P4 considers optional robustness capabilities independently, and P5 completes the release and upstream-maintenance review. See the [All-For-One documentation index](docs/all-for-one/README.md) and [implementation roadmap](docs/all-for-one/implementation-roadmap.md).

## Current changes from Pi

The current `allforone` branch adds or records:

- a compatible coding tool set including `read`, `bash`, `edit`, `write`, and `apply_patch`, alongside Pi's read-only tool inventory;
- bounded context and skill diagnostics, including path-scoped instruction handling;
- `apply_patch` mutation safeguards with concurrent-change detection and best-effort rollback;
- context, execution-evidence, memory, compaction, and diagnostic additions that remain subject to the P0 retain/move/remove audit;
- a branded interactive header and responsive session rail;
- offline diagnostics and upstream relationship checks; and
- focused branch CI and validation documentation.

Existing additions are not automatically permanent. The roadmap requires each divergence to have one owner, a demonstrated problem, acceptable normal-session cost, compatibility evidence, and a rollback path. No measured quality, latency, token, cost, reliability, performance, or security improvement is claimed without evidence.

## Packages

The native Pi package names and boundaries are retained:

| Package | Description |
|---------|-------------|
| **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API |
| **[@earendil-works/pi-agent-core](packages/agent)** | Generic agent runtime with tool calling and state management |
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | Interactive coding-agent CLI and coding-specific composition |
| **[@earendil-works/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
| **[@earendil-works/pi-orchestrator](packages/orchestrator)** | Experimental upstream package; not required by the All-For-One default path |

## Development

From the repository root:

```bash
npm install --ignore-scripts
npm run build
npm run check
./test.sh
./pi-test.sh
```

`./pi-test.sh` runs the `pi` CLI from source. See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution expectations, [AGENTS.md](AGENTS.md) for repository rules, and the [All-For-One validation notes](docs/all-for-one/validation.md) for focused checks.

Validation is risk-based. Documentation-only changes should not require the same build and cross-platform matrix as runtime, packaging, path, shell, process, or terminal-sensitive changes.

## Upstream compatibility

The branch relationship is:

```text
upstream Pi -> main -> allforone -> focused work branches
```

`main` remains the clean local mirror of upstream Pi. `allforone` is the official All-For-One development and integration branch. Focused branches start from `allforone` and return to it; All-For-One changes do not belong on `main`, and the published `allforone` history is not rewritten.

Every implementation pull request is reviewed against both `allforone` and `main` for unnecessary edits to upstream-hot files, duplicate ownership, compatibility risk, and rollback.

## Security

All-For-One runs locally with the permissions of the current user. Approval or safe-mode prompts authorize actions but are not a security sandbox. Use a container, virtual machine, or operating-system sandbox for stronger isolation. See [SECURITY.md](SECURITY.md) and the [containerization guide](packages/coding-agent/docs/containerization.md).

## License

All-For-One is derived from Pi and is distributed under the MIT License. See [LICENSE](LICENSE).