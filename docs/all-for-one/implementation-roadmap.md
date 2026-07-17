# All-For-One implementation roadmap

## Goal

Improve All-For-One as a fast, robust, cost-conscious Native Pi coding harness by prioritizing terminal UI/UX, then refining adaptive skill and tool use, then adding focused optional capability packages through Pi's existing architecture.

## Architecture

The implementation preserves Native Pi's provider abstraction, agent runtime, TUI, session model, SDK, RPC mode, print mode, extension runner, package manager, and Agent Skills support.

UI work remains inside the interactive coding-agent layer. Adaptive behavior uses concise skill metadata, precise tool definitions, existing runtime context, and the primary model's normal reasoning. Optional capabilities ship as Pi packages or extensions. No classifier model, workflow engine, semantic retrieval layer, or permanent multi-agent hierarchy is added.

## Technology

- TypeScript and Node.js
- `@earendil-works/pi-ai`
- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-tui`
- Native Pi extensions, packages, themes, prompts, and skills
- TypeBox schemas
- Vitest focused tests
- tmux-based interactive smoke checks

## Global constraints

1. Create focused implementation branches from `allforone`; target pull requests to `allforone`.
2. Never add All-For-One changes to `main` or merge `allforone` into `main`.
3. Preserve the `pi` command, `.pi`, `PI_*`, `@earendil-works/pi-*` identifiers, session formats, extension interfaces, SDK exports, print mode, and RPC behavior.
4. Retain the adaptive single-agent runtime as the default path.
5. Prefer skills, themes, extensions, packages, and coding-agent-local composition before modifying `packages/agent`.
6. Add no runtime dependency unless existing Pi and Node capabilities cannot satisfy a verified requirement.
7. Keep optional behavior free of prompt and process cost in normal sessions while disabled.
8. Do not auto-install packages, launch subagents, publish externally, or run discovered commands without the existing explicit control boundary.
9. Do not make quality, latency, token, cost, security, or performance claims without evidence.
10. Keep changes small enough to review and synchronize with upstream Pi.

## Current state

All-For-One already provides:

- five compatible built-in tools: `read`, `bash`, `edit`, `write`, and `apply_patch`;
- bounded path-scoped instructions and skill metadata;
- on-demand skill loading and manual-only skills;
- dynamic extension tools;
- native theme discovery and hot reload;
- a branded interactive header;
- a responsive session rail;
- settings and selectors for current UI and resource controls;
- context, execution-integrity, compaction, memory, and tool-output diagnostics.

The roadmap refines these capabilities. It does not replace them.

---

# Phase 1 — Terminal UI/UX foundation

## Objective

Make interactive mode cleaner, more modern, easier to scan, and more responsive without changing the core runtime or adding a new UI framework.

## Task 1.1 — Establish visual baselines

**Inspect in full:**

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/modes/interactive/components/brand-header.ts`
- `packages/coding-agent/src/modes/interactive/components/session-rail.ts`
- `packages/coding-agent/src/modes/interactive/components/footer.ts`
- `packages/coding-agent/src/modes/interactive/components/status-indicator.ts`
- `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- `packages/coding-agent/src/modes/interactive/components/bash-execution.ts`
- `packages/coding-agent/src/modes/interactive/theme/theme.ts`
- `packages/coding-agent/src/modes/interactive/theme/theme-controller.ts`
- `packages/coding-agent/src/modes/interactive/theme/dark.json`
- `packages/coding-agent/src/modes/interactive/theme/light.json`
- `packages/coding-agent/src/core/settings-manager.ts`
- `packages/coding-agent/src/modes/interactive/components/settings-selector.ts`

**Deliverable:**

Record terminal captures of the current branch at:

- 80 by 24 — narrow baseline;
- 120 by 30 — medium baseline;
- 160 by 40 — wide baseline with rail;
- dark and light terminal backgrounds where available;
- inline images enabled and disabled.

Capture:

- first startup;
- restored non-empty session;
- first user message;
- active model response;
- successful tool call;
- failed tool call;
- long truncated output;
- skill invocation;
- retry;
- compaction;
- narrow-terminal fallback.

Do not commit machine-specific screenshots unless they are deliberately selected as review artifacts. The permanent output is an acceptance matrix attached to the pull request and focused component fixtures in tests.

**Validation:**

Use the tmux workflow documented in `AGENTS.md`. This task records current behavior and makes no visual quality claim.

## Task 1.2 — Add the All-For-One theme pair

**Files:**

- Create: `packages/coding-agent/src/modes/interactive/theme/all-for-one-dark.json`
- Create: `packages/coding-agent/src/modes/interactive/theme/all-for-one-light.json`
- Modify: `packages/coding-agent/src/modes/interactive/components/first-time-setup.ts`
- Modify only when native discovery cannot load the JSON files unchanged: `packages/coding-agent/src/modes/interactive/theme/theme.ts`
- Modify only when selection behavior requires it: `packages/coding-agent/src/modes/interactive/theme/theme-controller.ts`
- Create: `packages/coding-agent/test/all-for-one-theme.test.ts`
- Modify: `packages/coding-agent/docs/themes.md`

**Decision:**

A new All-For-One installation with no saved theme resolves terminal background in the existing first-run path and selects `all-for-one-dark` or `all-for-one-light`. Existing explicit theme settings remain unchanged. Native Pi's `dark` and `light` remain available through `/settings`, settings files, and CLI theme loading.

**Requirements:**

- Use the existing complete theme schema.
- Preserve `dark` and `light` unchanged.
- Add no dependency.
- Use terminal default foreground where it improves compatibility.
- Reserve accent colors for selection, hierarchy, and state.
- Keep message and tool backgrounds restrained.
- Ensure pending, success, warning, and error remain distinguishable through text or symbols in addition to color.
- Verify truecolor and 256-color fallback.
- Add no third bundled All-For-One aesthetic theme in this phase.

**Focused test cases in `all-for-one-theme.test.ts`:**

- both theme files validate against the existing schema;
- every required token resolves;
- dark and light names are unique;
- first-run dark background selects `all-for-one-dark`;
- first-run light background selects `all-for-one-light`;
- an explicit saved theme is not replaced;
- Native Pi `dark` and `light` remain discoverable;
- project and user theme precedence remains unchanged.

**Validation commands:**

Run the new focused test from `packages/coding-agent`, then run `npm run check` from the repository root.

## Task 1.3 — Convert the header into welcome and working states

**Files:**

- Modify: `packages/coding-agent/src/modes/interactive/components/brand-header.ts`
- Modify: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Modify: `packages/coding-agent/test/brand-header.test.ts`
- Modify: `packages/coding-agent/test/interactive-mode-status.test.ts`

**Interface:**

```ts
export type BrandHeaderState = "welcome" | "working";
```

`BrandHeaderComponent` receives resolved presentation data. It does not receive `AgentSession` or query provider state itself.

**Behavior:**

- `welcome` appears only for an empty interactive session;
- it shows the optional cached product image when supported and enough height exists;
- it shows product title, version, selected model, and one concise help hint;
- it has a text fallback;
- `working` uses a compact one-line title or removes the built-in header when the footer already communicates durable state;
- restored non-empty sessions start in `working`;
- the first accepted user message performs one state transition;
- custom extension headers remain authoritative;
- no branded block is appended to session history;
- no animation or background resource is introduced.

**Focused validation:**

- image-capable welcome state;
- text-only welcome state;
- constrained-height welcome state;
- restored session starts compact;
- first message transitions once;
- custom header remains authoritative;
- print, RPC, and SDK modes remain unaffected.

## Task 1.4 — Refine the contextual session rail

**Files:**

- Modify: `packages/coding-agent/src/modes/interactive/components/session-rail.ts`
- Modify: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Modify: `packages/coding-agent/src/core/settings-manager.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/settings-selector.ts`
- Modify: `packages/coding-agent/test/session-rail.test.ts`
- Modify: `packages/coding-agent/test/settings-manager.test.ts`
- Create: `packages/coding-agent/test/session-rail-settings.test.ts`

**Interface:**

```ts
export type SessionRailMode = "auto" | "on" | "off";
```

Add to settings:

```ts
sessionRailMode?: SessionRailMode;
```

Default to `auto`.

**Sections:**

- `STATUS`: lifecycle, progress, and completed or failed count.
- `ACTIVITY`: active tools and recent outcomes.
- `CONTEXT`: active project instructions plus warning count.
- `CAPABILITIES`: skills loaded for the current task and relevant enabled optional capabilities.

**Behavior:**

- `auto`: show only when terminal width permits and useful content exists;
- `on`: show whenever width permits;
- `off`: do not register passive rail overlays;
- hide empty sections in `auto`;
- replace `CONTEXT / AGENTS` with `CONTEXT`;
- use existing session and extension events only;
- do not scan files, classify the request, or invoke a model to populate the rail;
- preserve current width bounds unless the Phase 1 baseline demonstrates a concrete readability failure;
- show shortcuts only when vertical space permits;
- keep the main transcript usable with no rail.

**Focused test cases:**

- width below, at, and above threshold;
- minimum and maximum rail width;
- `auto`, `on`, and `off`;
- no useful content in `auto`;
- each section independently populated;
- empty sections omitted;
- sanitized extension status text;
- setting persistence and project override;
- no overlay registration in `off` mode.

## Task 1.5 — Standardize transcript and tool presentation

**Files:**

- Modify narrowly: `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- Modify narrowly: `packages/coding-agent/src/modes/interactive/components/bash-execution.ts`
- Modify narrowly: `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`
- Modify narrowly: `packages/coding-agent/src/modes/interactive/components/user-message.ts`
- Modify narrowly: `packages/coding-agent/src/modes/interactive/components/footer.ts`
- Modify narrowly: `packages/coding-agent/src/modes/interactive/components/status-indicator.ts`
- Modify: `packages/coding-agent/test/interactive-mode-status.test.ts`
- Create: `packages/coding-agent/test/interactive-presentation.test.ts`

**Presentation contract:**

- a collapsed successful tool call normally occupies one concise row;
- a failed tool call exposes a short actionable error without expansion;
- pending, success, cancelled, and failed states use text or symbols plus color;
- shell failures display exit status when available;
- truncated output states what was omitted and how to continue;
- model, directory, and lifecycle metadata are not repeated in several persistent surfaces;
- tool expansion and extension renderers remain compatible;
- diagnostic information is not hidden.

**Focused test cases:**

- pending, success, cancelled, and failed rows;
- shell exit status;
- truncated read and shell output;
- expansion behavior;
- long path truncation;
- narrow width;
- extension renderer unchanged;
- footer and status do not duplicate the same transient state.

Split implementation commits by presentation contract when the affected components can be reviewed independently.

## Task 1.6 — UI/UX integration gate

**Documentation:**

- Update: `docs/all-for-one/ui-ux.md`
- Update: `packages/coding-agent/docs/themes.md`
- Update when user-visible behavior changed: `packages/coding-agent/README.md`
- Add a concise entry under the existing `[Unreleased]` section in `packages/coding-agent/CHANGELOG.md`

**Validation:**

1. Run each modified or created focused test.
2. Run `npm run check` from the repository root.
3. Run tmux smoke checks at 80 by 24, 120 by 30, and 160 by 40.
4. Exercise both bundled All-For-One themes and Native Pi theme selection.
5. Exercise image and text-only header paths.
6. Confirm extension header, footer, widget, overlay, command, and editor compatibility.
7. Review the diff against `main` and `allforone` for unnecessary edits to upstream-hot files.

**Phase completion criteria:**

- the transcript is cleaner at all target sizes;
- the welcome mark does not permanently consume height;
- the rail is useful, optional, and responsive;
- all essential states remain understandable without color;
- no model call, repository scan, dependency, or non-interactive layout behavior was added.

---

# Phase 2 — Adaptive skill and tool selection

## Objective

Let the primary agent choose the smallest useful capability from precise metadata and current context while preserving explicit overrides and the Native Pi single-agent loop.

## Task 2.1 — Tighten built-in tool contracts

**Files:**

- Modify: `packages/coding-agent/src/core/tools/read.ts`
- Modify: `packages/coding-agent/src/core/tools/bash.ts`
- Modify: `packages/coding-agent/src/core/tools/edit.ts`
- Modify: `packages/coding-agent/src/core/tools/write.ts`
- Modify: `packages/coding-agent/src/core/tools/apply-patch.ts`
- Modify only for shared definitions: `packages/coding-agent/src/core/tools/index.ts`
- Modify: `packages/coding-agent/test/tools.test.ts`
- Modify: `packages/coding-agent/test/tool-registry.test.ts`
- Modify: `packages/coding-agent/test/apply-patch-tool.test.ts`
- Modify: `packages/coding-agent/test/system-prompt.test.ts`

**Contracts:**

- `read`: bounded file inspection;
- `bash`: commands, search, builds, tests, linting, and repository operations;
- `edit`: exact localized replacement in one existing file;
- `write`: file creation or intentional complete replacement;
- `apply_patch`: structured multi-hunk or multi-file mutation.

**Requirements:**

- preserve all names, public definitions, SDK behavior, and extension events;
- keep descriptions concise;
- remove overlapping wording;
- provide corrective guidance only when the mismatch can be identified deterministically;
- do not parse user prompts with keyword rules;
- do not silently remove tools for unknown models;
- preserve allowlist and denylist behavior;
- preserve the five-tool compatibility profile.

**Focused validation:**

- tool schemas and snippets remain present and bounded;
- each tool description states one primary responsibility;
- system-prompt guidelines contain no duplicates;
- tool registry order and source metadata remain deterministic;
- existing patch safety and mutation queue tests continue to pass.

## Task 2.2 — Refine skill activation guidance

**Files:**

- Modify narrowly: `packages/coding-agent/src/core/skills.ts`
- Modify narrowly: `packages/coding-agent/src/core/system-prompt.ts`
- Modify: `packages/coding-agent/test/skills.test.ts`
- Modify: `packages/coding-agent/test/system-prompt.test.ts`
- Modify: `packages/coding-agent/docs/skills.md`
- Update: `docs/all-for-one/adaptive-capabilities.md`

**Requirements:**

- retain progressive disclosure and the existing metadata budget;
- retain `disable-model-invocation` and `/skill:<name>`;
- retain deterministic precedence and duplicate handling;
- tell the model to load a skill only when its description clearly matches and materially improves the task;
- prefer no skill over several ambiguous generic skills;
- do not require a universal bootstrap or router skill;
- do not add embeddings, semantic indexing, or a classifier turn;
- keep the full skill body outside the prompt until invocation;
- keep manual-only skills absent from model-visible metadata.

**Focused validation:**

- visible skill metadata remains within configured budget;
- manual-only skills remain invokable explicitly;
- empty skill sets do not add unnecessary prompt sections;
- duplicate names and paths remain diagnostic;
- project-local skills continue to override package skills;
- custom system prompts retain compatible skill behavior.

## Task 2.3 — Represent actual capability use in session state

**Files:**

- Modify narrowly: `packages/coding-agent/src/core/agent-session.ts`
- Modify narrowly: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/session-rail.ts`
- Modify: `packages/coding-agent/test/agent-session-dynamic-tools.test.ts`
- Modify: `packages/coding-agent/test/session-rail.test.ts`
- Modify: `packages/coding-agent/test/interactive-mode-status.test.ts`

**Interface requirement:**

Expose actual session capability state through a coding-agent-local read model. Reuse existing skill invocation parsing, registered tool metadata, and session events. Do not add generic capability state to `packages/agent`.

The read model contains only state already known by the session:

```ts
interface ActiveCapabilityState {
  loadedSkills: readonly string[];
  explicitSkills: readonly string[];
  optionalTools: readonly string[];
}
```

The exact type name may follow existing coding-agent naming, but ownership and fields must remain as defined above.

**Behavior:**

- record skills whose bodies were actually loaded or explicitly invoked;
- do not list every discovered skill in the rail;
- derive optional tools from registered non-built-in tool definitions;
- clear or recompute state correctly when the session is replaced or resources reload;
- expose the detailed full inventory through `/context`;
- do not persist a hidden task classification;
- do not create an additional telemetry store.

## Task 2.4 — Preserve explicit manual control

**Files:**

- Modify when needed: `packages/coding-agent/docs/skills.md`
- Modify when needed: `packages/coding-agent/docs/packages.md`
- Modify when needed: `packages/coding-agent/docs/sdk.md`
- Update: `docs/all-for-one/adaptive-capabilities.md`

**Document and preserve:**

- `/skill:<name>`;
- `disable-model-invocation`;
- `--no-skills` and explicit `--skill` paths;
- package resource filters;
- extension enable and disable configuration;
- built-in and extension tool allowlists or denylists;
- SDK active-tool options;
- project instructions;
- absence of automatic package installation.

## Task 2.5 — Adaptive behavior integration gate

Use deterministic tests and controlled faux-provider sessions. A paid live-model benchmark is not a completion requirement.

**Validation:**

1. Run all modified skill, system-prompt, dynamic-tool, session-rail, and tool-registry tests.
2. Run `npm run check`.
3. Run a faux-provider session where a visible skill is loaded on demand.
4. Run a manual-only skill invocation.
5. Run a simple file task and confirm no workflow skill is required.
6. Run a dynamic extension tool registration and confirm it appears only after registration.
7. Confirm disabled optional tools add no schema or rail state.
8. Inspect `/context` output for visible skills, manual-only skills, active tools, origins, and metadata cost.

**Phase completion criteria:**

- clearly matching visible skills can be loaded on demand;
- simple tasks remain direct;
- manual-only skills remain explicit;
- all five built-in tools remain compatible and better differentiated;
- actual capability use is visible without invented agents or classifications;
- no classifier turn, workflow engine, embedding system, or new provider call exists;
- optional capabilities remain absent from prompt and process state while disabled.

---

# Phase 3 — First-party skills and optional robustness

## Objective

Add specialized capability through Native Pi packages without expanding the default core tool surface.

Each package is a separate focused branch and pull request. None is required to merge Phase 2.

## Task 3.1 — Create the first-party engineering skills package

**Files:**

- Create: `packages/all-for-one-skills/package.json`
- Create: `packages/all-for-one-skills/skills/repository-orientation/SKILL.md`
- Create: `packages/all-for-one-skills/skills/systematic-debugging/SKILL.md`
- Create: `packages/all-for-one-skills/skills/verify-before-completion/SKILL.md`
- Create: `packages/all-for-one-skills/skills/plan-complex-change/SKILL.md`
- Create: `packages/all-for-one-skills/skills/review-diff/SKILL.md`
- Create references only where the main skill would otherwise become long
- Create: `packages/coding-agent/test/all-for-one-skills-package.test.ts`
- Update root workspace and release metadata only as required by the existing monorepo package conventions
- Update: `docs/all-for-one/adaptive-capabilities.md`

**Package boundary:**

The package contains Markdown skills and optional deterministic helper scripts. It does not depend on a model SDK, agent runtime, database, or orchestration library. It declares the skills through Native Pi package metadata or the conventional `skills/` directory.

**Invocation policy:**

| Skill | Invocation |
|---|---|
| `repository-orientation` | Model-visible |
| `systematic-debugging` | Model-visible |
| `verify-before-completion` | Model-visible |
| `plan-complex-change` | Manual-only |
| `review-diff` | Manual-only |

**Requirements:**

- distill principles rather than copying a third-party repository wholesale;
- preserve license and attribution for any reused material;
- keep descriptions specific and non-overlapping;
- keep `SKILL.md` concise;
- use one-level references;
- do not require subagents;
- do not force every task through planning, TDD, worktrees, or review;
- include no universal router skill;
- do not enable or install the package silently for existing users.

**Focused validation:**

- package discovery through the Native Pi package loader;
- three visible and two manual-only skills;
- explicit invocation of every skill;
- no full skill body in the prompt before invocation;
- project-local override of a package skill;
- duplicate diagnostics;
- resource filtering can disable individual skills.

## Task 3.2 — Safe-mode extension

Create a separate Native Pi extension package that can:

- allow, ask, or deny selected shell and file mutations;
- protect configured paths such as credentials and generated dependency directories;
- warn on destructive commands;
- preserve project trust behavior;
- provide concise blocking reasons.

It must not claim OS isolation, replace containers, attempt complete shell-language parsing, or modify the core agent loop.

## Task 3.3 — Read-only code-intelligence extension

Expose one optional namespaced tool with a small operation enum:

```text
diagnostics
definition
references
symbols
```

Requirements:

- use a project-installed language server where possible;
- start lazily;
- bundle no language servers initially;
- return bounded results;
- support cancellation and clean shutdown;
- remain disabled by default;
- avoid duplicating repository search available through `bash`.

## Task 3.4 — External sandbox launch guidance

Improve container and sandbox documentation and optional wrapper scripts without embedding a cross-platform sandbox in the agent runtime.

Security documentation must continue to state that approval prompts are authorization, not isolation.

## Task 3.5 — Narrow MCP adapter guidance

Prefer an existing maintained Pi package when it satisfies the need.

Any first-party adapter must use:

- explicit server configuration;
- tool allowlists;
- bounded descriptions and results;
- lazy connection;
- timeout and cancellation;
- visible provenance;
- clean shutdown.

## Task 3.6 — Keep delegation deferred and explicit

Do not add a permanent agent fleet.

A future single `subtask` capability may be considered only for user-selected independent work. It must be bounded, isolated, structured, optional, and absent from normal sessions while disabled.

---

# Phase 4 — Upstream maintainability and consolidation

## Objective

Reduce future merge cost after UI and adaptive behavior are implemented.

## Task 4.1 — Review upstream-hot files

Compare `main...allforone` and classify changes in:

- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/agent.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- compaction, resource-loading, skills, system-prompt, and tool-composition files.

For each divergence, record:

- the requirement it satisfies;
- why a skill, extension, theme, package, or coding-agent-local module is insufficient;
- compatibility effect;
- likely upstream conflict frequency;
- rollback path.

## Task 4.2 — Extract optional behavior from hot paths

Move behavior only when the new boundary is smaller and clearer. Do not refactor for line count alone.

Candidates include:

- interactive presentation read models extracted from `interactive-mode.ts`;
- optional capability packages instead of default registration;
- coding-agent-local policies instead of agent-core hooks;
- reusable TUI primitives only when they are generally useful beyond All-For-One.

## Task 4.3 — Remove duplicated documentation and policy text

Keep the ownership model from `docs/all-for-one/README.md`:

- architecture boundaries in `architecture.md`;
- visual and interaction behavior in `ui-ux.md`;
- adaptive behavior in `adaptive-capabilities.md`;
- delivery order in this roadmap.

Historical plans remain dated evidence, not the current source of truth.

## Task 4.4 — Rehearse upstream synchronization

Before merging each implementation phase:

1. confirm `main` reflects the intended upstream Pi revision;
2. rehearse merging `main` in an isolated worktree when conflict risk is material;
3. inspect conflicts in upstream-hot files;
4. update the focused branch from `allforone` without rewriting published history;
5. rerun focused validation after conflict resolution.

Do not optimize for a zero-diff downstream. Optimize for intentional, well-owned divergences.

---

# Implementation order

1. Visual baselines.
2. All-For-One dark and light themes.
3. Welcome and compact header states.
4. Responsive rail modes and section cleanup.
5. Transcript and tool presentation.
6. Built-in tool contract refinement.
7. Skill activation guidance.
8. Capability session state and UI observability.
9. Manual-control documentation.
10. Optional first-party skills package.
11. Separate safe-mode, code-intelligence, sandbox, and MCP work.
12. Upstream-hot-file consolidation.

Do not implement Phase 2 in parallel with the first UI composition changes. Stabilize the presentation model first so adaptive capability state has one clear UI destination.

# Validation strategy

Validation is an implementation gate, not a new product subsystem.

## Documentation-only changes

- Review links, paths, internal consistency, terminology, and branch targets.
- No build or test claim is made when code did not change.

## Code changes

For each focused task:

1. Write or update the focused regression test.
2. Run that exact test and inspect full output.
3. Implement the smallest cohesive change.
4. Rerun the focused test.
5. Run related component tests.
6. Run `npm run check` after code changes, as required by repository rules.
7. Use `./test.sh` only when risk and repository rules justify the broader non-e2e suite.
8. Perform tmux smoke checks for interactive changes.
9. Review the final diff against the task files and non-goals.

Never claim a visual improvement solely from unit tests. Never claim correctness solely from a screenshot.

# Rollback boundaries

- Themes are removable JSON resources.
- Header behavior is isolated to interactive presentation.
- Rail mode defaults to `auto` and can be disabled.
- Tool-contract changes preserve names and public APIs.
- Skill activation guidance preserves explicit invocation.
- First-party skills are an optional Pi package.
- Safe mode, code intelligence, MCP, sandbox launchers, and delegation remain separate packages or documentation.
- No phase requires a session-format migration or provider change.

# Design decisions

## UI/UX precedes adaptive capability work

The harness already has substantial runtime hardening. A clearer interface improves daily usability and creates a stable destination for capability observability before adaptive behavior is expanded.

## Terminal controls fonts

Bundling or forcing fonts is incompatible with terminal rendering and adds distribution cost. All-For-One uses terminal-safe typography and documents optional font recommendations.

## New installs use the All-For-One theme pair

The product should have a coherent default identity. Existing explicit selections and Native Pi themes remain fully available.

## The primary model selects capabilities

A separate classifier duplicates reasoning and adds cost and latency. Precise metadata and progressive disclosure are the adaptive mechanism.

## Workflows are skills, not an engine

Procedures belong in concise skills over existing tools. High-cost or high-autonomy workflows remain manual-only.

## Preserve the compatible built-in registry

The five current tools remain available. Their responsibilities become clearer before any model-specific reduction is considered.

## Optional ecosystem instead of core accumulation

Specialized tools, integrations, and security policies ship through Native Pi packages and extensions. Disabled capabilities do not consume normal-session prompt or process resources.

## Avoid `packages/agent` changes

UI, capability policy, skills, and optional integrations belong in the coding-agent or extension layers. Agent-core changes require a proven limitation that cannot be solved at the narrower boundary.

## No dedicated evaluation platform

Focused tests, static checks, controlled faux-provider sessions, and interactive smoke checks are implementation gates. All-For-One does not become a benchmark framework.

# Completion definition

The roadmap is complete when:

- interactive mode is cleaner, responsive, and accessible without a new UI framework;
- UI state is confined to interactive mode;
- skills and tools are selected adaptively through the primary model and precise metadata;
- manual overrides remain complete and documented;
- simple tasks do not incur planning or workflow overhead;
- optional capabilities remain outside the default core;
- no classifier model, workflow engine, semantic memory, embedding index, or permanent multi-agent hierarchy is present;
- Pi compatibility and upstream synchronization remain first-class constraints;
- every retained downstream change has a clear owner and rollback path.