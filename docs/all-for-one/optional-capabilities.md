# Optional capabilities

Optional safety and integration features stay outside the normal session. They are loaded explicitly as extensions or packages, so the default prompt, process model, and tool registry pay no cost for them.

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
