# All-For-One architecture

## Purpose

All-For-One is a lightweight downstream hardening and usability layer over the Native Pi monorepo. It preserves Pi's adaptive single-agent architecture and package boundaries while adding focused context integrity, execution integrity, file-mutation safety, diagnostics, terminal UX, and optional capability packages.

The branch relationship is:

```text
upstream Pi -> main -> allforone -> focused branches
```

`main` remains the clean local mirror of upstream Pi. `allforone` is the All-For-One integration branch. Focused implementation branches start from and return to `allforone`.

## Architectural objective

All-For-One should improve the primary coding agent rather than surround it with a permanent hierarchy.

The preferred path is:

```text
User
  -> Interactive, print, RPC, or SDK entry point
  -> Coding-agent session composition
  -> Relevant project context, skills, and tools
  -> Native Pi agent runtime
  -> Provider/model abstraction
  -> Tool execution and repository feedback
  -> Result
```

Optional capabilities may participate only when explicitly configured or selected by the primary model from bounded metadata.

## Package ownership

| Package or layer | Ownership |
|---|---|
| `packages/ai` | Provider APIs, model metadata, streaming, usage, cost fields, and inference abstraction |
| `packages/agent` | Generic agent state, message flow, tool calling, retries, cancellation, and execution loop |
| `packages/tui` | Reusable terminal rendering primitives and input behavior |
| `packages/coding-agent` | Coding CLI, sessions, built-in tools, project context, skills, extensions, settings, compaction composition, interactive mode, print mode, RPC mode, and SDK integration |
| Pi packages and extensions | Optional tools, workflows, integrations, themes, and policy modules |
| Repository documents | Version-controlled project terminology, decisions, architecture, and operational instructions |

Behavior belongs in the narrowest correct owner. UI policy must not leak into `packages/agent` or `packages/ai`. Provider-specific behavior must not leak into generic tools or TUI components.

## Runtime boundaries

### Provider and model abstraction

Native Pi's provider and model contracts remain authoritative. All-For-One preserves provider independence and does not introduce a second model registry or agent-specific provider API.

A future model-specific coding preference may select among existing compatible mutation tools, but it must live in one coding-agent-local policy, use existing model identity, allow manual override, and fall back to Native Pi behavior.

### Agent runtime

The default runtime remains one adaptive agent with access to relevant context and tools.

All-For-One does not require:

- an orchestrator;
- planner, implementer, reviewer, or validator agents;
- a workflow engine;
- an agent council;
- a classifier model before each turn.

Delegation may exist later as an optional explicit capability for genuinely independent work. It is not part of the normal execution path.

### Coding-agent session

`AgentSession` remains the coding-agent composition root for:

- active tools;
- skills and prompt metadata;
- scoped project instructions;
- extensions;
- compaction;
- execution-integrity observation;
- session persistence;
- interactive, print, RPC, and SDK behavior.

Responsibilities should be extracted only when the new module has one clear purpose, a stable interface, independent tests, and lower upstream conflict risk.

### Tool execution

The compatible built-in tool registry remains:

```text
read
bash
edit
write
apply_patch
```

The tools have distinct intended responsibilities:

- `read`: bounded file inspection;
- `bash`: shell, search, build, test, lint, and repository commands;
- `edit`: exact localized replacement in one existing file;
- `write`: file creation or intentional complete replacement;
- `apply_patch`: structured multi-hunk or multi-file mutation.

Optional tools register through Native Pi extensions. Disabled optional tools must not add schemas to the model context or start background resources.

### Skills and workflows

Skills provide progressive-disclosure procedural knowledge.

- Names and descriptions are bounded model-visible metadata.
- Full skill bodies load only when relevant.
- Manual-only skills remain available through explicit commands but are hidden from automatic selection.
- Project-local skills override user-global and package-provided duplicates through the existing deterministic precedence rules.

A workflow is a skill-guided sequence over existing tools. It is not a separate scheduler or execution engine.

### Project context

Project instructions are loaded from the root and applicable ancestor chain. Nested instructions activate only for relevant paths and remain bounded.

Knowledge ownership is:

- `AGENTS.md` or equivalent context files: behavioral and repository instructions;
- `CONTEXT.md` when adopted by a project: shared terminology and durable domain language;
- ADRs: architectural decisions and trade-offs;
- source and tests: executable truth;
- local memory: explicit user corrections, conventions, decisions, or tool quirks that do not belong in the repository;
- session context: temporary task state.

Do not duplicate repository architecture into opaque semantic memory.

### Compaction and memory

Compaction remains the owner of bounded session-history reduction. It preserves required structural state and records in-memory diagnostics without creating a second persistent knowledge system.

Local memory remains explicit, bounded JSONL state outside the repository. It is not automatically extracted from every conversation and is not a vector database.

### Execution integrity

Execution integrity observes or enforces repository-grounded evidence according to its configured mode. Discovered commands are suggestions and evidence sources; they are never automatically executed merely because they exist.

A passing command is not treated as complete proof of task correctness. Completion claims remain tied to the smallest decisive verification for the actual request.

## Interactive UI architecture

Interactive presentation is isolated to `packages/coding-agent/src/modes/interactive/` and the reusable primitives it consumes from `packages/tui`.

The target composition is:

```text
Welcome or compact header
Transcript and tool activity
Transient status
Editor and autocomplete
Footer
Optional responsive session rail
Extension widgets and overlays
```

The transcript and editor remain primary. Header, rail, status, and footer must not duplicate the same information.

UI behavior consumes existing session events. It must not cause additional model calls, repository scans, or background services.

Print, RPC, and SDK modes do not receive implicit interactive layout state.

See [UI/UX design](ui-ux.md).

## Adaptive capability architecture

Adaptive behavior uses the primary model's normal reasoning over concise capability metadata.

The decision hierarchy is:

1. answer directly when no capability is needed;
2. select the narrowest built-in tool;
3. load one clearly matching visible skill when procedural guidance adds value;
4. use an enabled optional tool only when relevant;
5. require explicit selection for high-cost, destructive, external, or multi-agent workflows.

The harness provides deterministic eligibility and safety boundaries but does not classify requests through another model or a growing keyword router.

Manual overrides through skill commands, settings, package filters, CLI flags, SDK configuration, and tool allowlists or denylists remain authoritative.

See [Adaptive capabilities](adaptive-capabilities.md).

## Optional capability boundary

The following belong outside the default core:

- permission and safe-mode policy;
- language-server code intelligence;
- MCP adapters;
- browser or external-service integrations;
- sandbox launchers;
- worktree automation;
- subtask delegation;
- specialized domain workflows;
- additional themes.

Use Native Pi packages to distribute these resources. Prefer existing maintained packages when they satisfy the requirement.

## Current All-For-One additions

The current `allforone` branch includes or records:

- a canonical built-in capability registry with five default active tools;
- bounded path-scoped context and skill metadata diagnostics;
- preflighted `apply_patch` mutations with concurrent-change detection and best-effort rollback;
- opt-in repository-grounded execution-integrity observation;
- explicit local memory limits outside the repository;
- in-memory compaction telemetry;
- generic offline baselines, doctors, evaluators, and an upstream relationship verifier;
- a branded interactive header and responsive session rail;
- focused branch CI and validation documentation.

These features remain subject to the known limitations documented in this directory.

## Prohibited duplication

Do not add another:

- provider abstraction;
- agent loop;
- session manager;
- context manager;
- skill loader;
- plugin or package system;
- mutation engine;
- validation agent;
- compaction system;
- persistent memory layer;
- theme loader;
- command palette;
- workflow engine;
- tool registry.

Extend or compose the existing Native Pi owner instead.

## Compatibility contract

All-For-One preserves unless a separate intentional migration is designed and tested:

- `pi` CLI behavior;
- `.pi` configuration;
- `PI_*` environment variables;
- `@earendil-works/pi-*` package identities;
- session formats;
- extension events and APIs;
- SDK exports;
- RPC protocol behavior;
- print-mode behavior;
- package, skill, prompt, and theme discovery.

User-facing branding uses All-For-One. Technical identifiers remain Pi-compatible.

## Security boundary

All-For-One runs with the permissions of the local process. Approval and permission prompts authorize actions but do not provide filesystem or process isolation.

Stronger isolation belongs in a container, virtual machine, or OS sandbox. Optional safe-mode extensions may reduce accidental actions but must not be presented as a security sandbox.

## Upstream-maintenance rule

Before changing an upstream-hot file:

1. identify the exact requirement or defect;
2. inspect the Native Pi implementation and current All-For-One divergence;
3. attempt the change through a skill, extension, theme, package, or coding-agent-local module;
4. modify agent core only when those boundaries cannot solve the verified requirement cleanly;
5. add focused tests;
6. rehearse synchronization with `main` when merge risk is material;
7. document the reason and rollback path.

## Non-goals

- General workflow platform
- Permanent multi-agent architecture
- Desktop or web application shell
- Built-in marketplace replacement
- Automatic package installation
- Semantic or vector memory
- Always-on repository graph
- Bundled language servers
- Mandatory MCP
- Automatic git commits
- Automatic external publication
- Dedicated evaluation platform

## Related documents

- [Documentation index](README.md)
- [UI/UX design](ui-ux.md)
- [Adaptive capabilities](adaptive-capabilities.md)
- [Implementation roadmap](implementation-roadmap.md)
- [Context and capabilities](context-and-capabilities.md)
- [Execution integrity](execution-integrity.md)
- [Security](security.md)
- [Known limitations](known-limitations.md)
- [Upstream synchronization](upstream-sync.md)