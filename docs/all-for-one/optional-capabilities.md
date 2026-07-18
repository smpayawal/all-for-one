# Optional capabilities

Optional capabilities must not enlarge the permanent model tool schema or change Pi's core execution contract. Most safety and integration features remain explicitly loaded extensions or packages. The adaptive repository map is the one bundled dormant capability: it defaults to `auto`, but performs no repository work and injects no context unless strong deterministic signals activate it. It can be disabled with `/repo-map off`, and failure always falls back to normal Pi behavior.

## Native inline capability boundary

`--no-extensions` disables discovered user, project, package, and explicitly configured extensions. It does not remove hidden native inline capabilities that are compiled into the coding-agent runtime, including `repo-map` and `validate`. These capabilities register handlers or slash commands through Pi's existing extension boundary, but they do not add model-callable tools. Repository mapping performs no repository work unless activated and can be disabled for the session with `/repo-map off`; validation discovery and execution occur only when `/validate` is explicitly invoked or execution integrity is enabled.

## Adaptive bounded repository map

The hidden built-in repository-map extension provides temporary orientation for broad or unfamiliar repository tasks without adding a model-callable tool or another LLM request. It activates only for strong prompt signals or bounded cross-area exploration without a stable target. Generation uses three fixed read-only Git argv calls with NUL-delimited filename parsing, explicit output-truncation failure, priority-first path selection, canonical workspace checks, local symbol-name extraction, an in-memory cache, strict file, symbol, and character limits, and a 7.5-second total response deadline covering Git state, ranking, filesystem checks, and symbol enrichment. If the deadline expires, the map result is discarded and normal Pi behavior continues without injection.

Use `/repo-map auto`, `/repo-map once`, `/repo-map off`, `/repo-map status`, or `/repo-map show`. Automatic and forced generation both require project trust. The map is injected for one provider request, is not appended to the session, starts no service, installs no dependency, and performs no mutation.

## Authorization-oriented safe mode

Load packages/coding-agent/examples/extensions/safe-mode.ts with the extension flag when a session needs allow/ask/deny policy. It:

- allows only a small exact set of read-only commands;
- blocks destructive commands and shell-piped downloads;
- protects credential-like paths such as .env, auth.json, keys, and secrets;
- rejects mutation paths outside the workspace; and
- asks for confirmation before other commands, in-workspace mutations, and unknown extension tools.

This is authorization implemented through the existing tool_call hook. It is not an OS sandbox. The permission-gate and protected-path examples remain useful for smaller policies.

## Read-only code intelligence

Load packages/coding-agent/examples/extensions/code-intel.ts only when the project provides an adapter. Set PI_CODE_INTEL_COMMAND to the adapter executable and optionally PI_CODE_INTEL_ARGS to a JSON string array. Each request passes one JSON argument describing diagnostics, definition, references, or symbols. The adapter owns language-server discovery and must use a server already installed by the project.

The extension starts no server and bundles no language server. It exposes a read-only interface, but the configured adapter is trusted host code and may write unless it is separately sandboxed. Captured stdout and stderr are bounded, returned output is limited to 20,000 characters, and each request has a ten-second timeout. Each request is a short-lived process, which gives clean shutdown without a background daemon.

## External sandbox launch profiles

Use the existing sandbox and gondolin extension examples when process or filesystem isolation is required. Configure the external runtime explicitly for the project and keep its dependencies outside the coding-agent core. Safe mode alone cannot provide a kernel boundary.

## Lazy MCP guidance

MCP adapters should be explicit, package-scoped, and lazy. Do not add built-in MCP servers, auto-discover remote servers, or inject every MCP schema into the default prompt. Load an adapter only for a task that needs it, expose only the namespaced tools required for that task, and keep its lifecycle and network policy owned by the optional package.
