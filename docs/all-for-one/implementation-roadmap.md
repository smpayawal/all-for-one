# All-For-One implementation roadmap

## Goal

Improve All-For-One as a lightweight, production-ready Native Pi coding harness while preserving the approved P0-P5 architecture plan.

The adjustments are:

- UI/UX is the first runtime implementation priority.
- P1 retains the centralized coding-model profile and adaptive mutation interface.
- P2 uses Native Pi skills adaptively instead of requiring manual selection by default.
- Validation is embedded in every phase; there is no dedicated evaluation-platform phase.
- Optional capabilities remain isolated from the main loop and cost-free while disabled.

## Delivery order

```text
P0  Consolidate and freeze architecture
    + complete the UI/UX foundation as the first runtime workstream
P1  Make the tool interface adaptive and unambiguous
P2  Add the essential adaptive skill package
P3  Clarify knowledge ownership
P4  Ship optional robustness packages
P5  Reduce downstream maintenance cost
```

P0's ownership freeze must be established before broad code changes. The UI/UX workstream is the first product implementation and must complete before P1 changes the model-facing tool interface.

## Global constraints

1. Create focused branches from `allforone` and target pull requests to `allforone`.
2. Never add All-For-One changes to `main` or merge `allforone` into `main`.
3. Preserve `pi`, `.pi`, `PI_*`, `@earendil-works/pi-*`, sessions, extension APIs, SDK exports, print mode, and RPC behavior.
4. Retain the adaptive single-agent runtime as the default path.
5. Add no request-classifier model, workflow engine, skill tool, semantic retrieval layer, or permanent agent hierarchy.
6. Prefer Native Pi themes, skills, prompts, extensions, packages, settings, and coding-agent-local modules before changing `packages/agent`.
7. Add no runtime dependency unless current Pi and Node capabilities cannot satisfy a verified requirement.
8. Keep optional behavior free of prompt, process, and rendering cost while disabled.
9. Do not auto-install packages, publish externally, launch subagents, or run discovered commands merely because they exist.
10. Make no quality, latency, cost, token, security, or performance claim without evidence.
11. Validate each phase proportionally; do not create a separate evaluation platform.
12. Review every final diff against both `allforone` and `main` for unnecessary edits to upstream-hot files.

## Current state

The current `allforone` branch already provides:

- the five compatible built-in tools: `read`, `bash`, `edit`, `write`, and `apply_patch`;
- Native Pi theme loading, terminal background detection, and hot reload;
- a branded interactive header;
- a responsive session rail;
- settings and selectors for UI and resource controls;
- progressive-disclosure skills with bounded metadata;
- dynamic extension tools;
- path-scoped project instructions;
- bounded local memory;
- compaction integrity and telemetry;
- execution-integrity modes;
- offline baseline, doctor, evaluator, and upstream relationship commands.

The roadmap consolidates and refines these capabilities. It does not replace them.

---

# P0 — Consolidate and freeze the architecture

## Objective

Establish one authoritative owner for every existing subsystem, freeze compatibility contracts, isolate optional behavior, and deliver the UI/UX foundation as the first runtime improvement.

## P0.1 — Document ownership

### Required ownership decisions

Document the authoritative owner for:

- provider and model APIs;
- coding-model behavior profiles;
- built-in tool definitions and defaults;
- project and scoped context;
- skills and workflows;
- extensions and optional tools;
- local memory;
- compaction;
- execution-integrity evidence;
- interactive presentation;
- validation and CI;
- strong isolation.

### Files

- Update: `docs/all-for-one/architecture.md`
- Update: `docs/all-for-one/README.md`
- Update only where terminology conflicts: `docs/all-for-one/context-and-capabilities.md`
- Update only where terminology conflicts: `docs/all-for-one/known-limitations.md`

### Required rule

No new package or `packages/agent` change is approved unless Pi's public extension, skill, prompt, theme, settings, SDK, or coding-agent boundaries cannot support the verified requirement cleanly.

A new package must solve a distinct optional capability. It must not exist merely to reorganize current code.

## P0.2 — Freeze the canonical tool registry

The canonical built-in registry remains exactly:

```ts
export const DEFAULT_ACTIVE_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  "apply_patch",
] as const;
```

### Requirements

- One registry remains authoritative.
- No sixth default tool is introduced.
- No dedicated planning, testing, linting, git, TODO, repository-map, skill, or review tool is added.
- Extension tools remain separate from built-in defaults.
- Manual allowlists and denylists continue to work.
- P1 may select a primary mutation tool without deleting the compatible five-tool registry.

### Files to verify

- `packages/coding-agent/src/core/tools/index.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- CLI and SDK default tool configuration
- baseline and doctor commands
- related tests and documentation

## P0.3 — Identify isolated optional features

Classify current and proposed behavior as either core-compatible or optional.

### Must remain optional

- safe-mode authorization;
- language-server code intelligence;
- sandbox launchers;
- MCP adapters;
- browser and external-service tools;
- worktree automation;
- delegation or subagents;
- additional theme collections;
- specialized domain workflows.

### Isolation standard

An optional feature must:

- register through Native Pi extensions or packages;
- add no model-visible schema while disabled;
- start no watcher, service, socket, or helper process while disabled;
- avoid changing the generic agent loop;
- clean up session-owned resources;
- remain removable without migrating session formats.

## P0.4 — Preserve Pi compatibility

Verify and document preservation of:

- `pi` command behavior;
- `.pi` configuration paths;
- `PI_*` environment variables;
- `@earendil-works/pi-*` package identities;
- session formats;
- extension events and interfaces;
- SDK exports;
- RPC protocol behavior;
- print-mode behavior;
- package, skill, prompt, and theme discovery.

User-facing identity remains All-For-One. Technical compatibility identifiers remain Pi-compatible.

## P0.5 — UI/UX foundation: first runtime workstream

### Objective

Modernize the terminal experience before changing the model-facing tool and skill interface.

The work remains inside Native Pi's interactive architecture and adds no model calls, repository scans, background services, desktop shell, or web UI.

### Step A — Capture current visual baselines

Inspect in full:

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/modes/interactive/components/brand-header.ts`
- `packages/coding-agent/src/modes/interactive/components/session-rail.ts`
- `packages/coding-agent/src/modes/interactive/components/footer.ts`
- `packages/coding-agent/src/modes/interactive/components/status-indicator.ts`
- `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- `packages/coding-agent/src/modes/interactive/components/bash-execution.ts`
- `packages/coding-agent/src/modes/interactive/theme/theme.ts`
- `packages/coding-agent/src/modes/interactive/theme/theme-controller.ts`
- `packages/coding-agent/src/core/settings-manager.ts`
- `packages/coding-agent/src/modes/interactive/components/settings-selector.ts`

Capture controlled tmux states at:

- 80 by 24;
- 120 by 30;
- 160 by 40;
- image and text-only terminals;
- dark and light backgrounds.

Include startup, restored session, response streaming, successful and failed tools, truncation, skill invocation, retry, compaction, and narrow-terminal fallback.

### Step B — Add the All-For-One theme pair

Create:

- `packages/coding-agent/src/modes/interactive/theme/all-for-one-dark.json`
- `packages/coding-agent/src/modes/interactive/theme/all-for-one-light.json`
- `packages/coding-agent/test/all-for-one-theme.test.ts`

Modify only as required:

- first-run theme selection;
- existing theme loader or controller;
- `packages/coding-agent/docs/themes.md`.

Requirements:

- use the existing complete theme schema;
- preserve Native Pi `dark` and `light` unchanged;
- use existing terminal-background detection for a new installation with no saved theme;
- never overwrite an explicit saved theme;
- distribute no font files;
- require no Nerd Font or private-use glyph;
- add no dependency;
- keep state distinguishable through text or symbols as well as color;
- verify truecolor and 256-color fallback;
- add no third built-in All-For-One aesthetic theme in P0.

### Step C — Refine welcome and working header states

Modify:

- `packages/coding-agent/src/modes/interactive/components/brand-header.ts`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- focused header and interactive lifecycle tests.

Introduce a presentation-only state such as:

```ts
export type BrandHeaderState = "welcome" | "working";
```

Requirements:

- show the optional cached product mark only for an empty welcome state with sufficient terminal capability and height;
- include concise product, version, model, and help information;
- use text fallback everywhere;
- start restored non-empty sessions compact;
- transition once after the first accepted user message;
- preserve extension-provided custom headers;
- never append branding to session history;
- add no animation or background loader.

### Step D — Refine the session rail

Modify:

- `packages/coding-agent/src/modes/interactive/components/session-rail.ts`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/core/settings-manager.ts`
- `packages/coding-agent/src/modes/interactive/components/settings-selector.ts`
- focused rail and settings tests.

Add one setting:

```ts
export type SessionRailMode = "auto" | "on" | "off";
```

Sections:

- `STATUS` — lifecycle and progress;
- `ACTIVITY` — active and recent tool outcomes;
- `CONTEXT` — active instruction resources and warning count;
- `CAPABILITIES` — skills actually loaded and relevant enabled optional tools.

Requirements:

- `auto` displays only when terminal width permits and useful content exists;
- `on` displays whenever width permits;
- `off` registers no passive rail overlays;
- hide empty sections in `auto`;
- replace `CONTEXT / AGENTS` with `CONTEXT`;
- use existing events only;
- perform no classification, repository scan, or model call for the rail;
- preserve the main transcript when the rail is absent.

### Step E — Standardize transcript and tool presentation

Refine narrowly:

- tool execution;
- bash execution;
- assistant and user message presentation;
- footer;
- status indicator;
- corresponding focused tests.

Presentation contract:

- collapsed successful tool calls normally occupy one concise row;
- failed tools expose a short actionable error before expansion;
- pending, success, cancellation, warning, and failure use text or symbols plus color;
- shell failures show exit status when available;
- truncation states what was omitted and how to continue;
- expansion and extension renderers remain compatible;
- header, rail, status, and footer do not repeat the same information;
- diagnostic information needed for investigation remains accessible.

## P0 validation

Run only the checks justified by the changed files:

1. Every modified or created focused test.
2. `npm run check` after runtime or checked JSON changes.
3. tmux smoke checks at the three target terminal sizes.
4. Theme selection, text fallback, and image-capable paths.
5. Extension header, footer, widget, overlay, command, and editor compatibility.
6. Diff review against `allforone` and `main`.

### P0 completion criteria

- Ownership and compatibility contracts are authoritative.
- The five-tool registry is frozen.
- Optional behavior is clearly isolated.
- The first runtime delivery is the completed UI/UX foundation.
- The transcript is cleaner at narrow, medium, and wide sizes.
- The welcome mark no longer permanently consumes height.
- The rail is responsive and optional.
- No core agent-loop change, model call, repository scan, or new dependency was added for presentation.

---

# P1 — Make the tool interface adaptive and unambiguous

## Objective

Create the highest-value harness improvement: one centralized coding-model profile that selects a primary existing-file mutation interface and presents strict, non-overlapping tool responsibilities.

## P1.1 — Add the centralized coding-model profile

### Proposed owner

Create one coding-agent-local module, for example:

```text
packages/coding-agent/src/core/coding-model-profile.ts
```

Use existing Native Pi model identity. Do not add another model registry.

### Minimum profile

```ts
export interface CodingModelProfile {
  existingFileMutation: "edit" | "apply_patch";
  supportsParallelTools?: boolean;
  recommendedThinkingLevel?: ThinkingLevel;
}
```

Only fields with a demonstrated current need are permitted.

### Requirements

- one module owns all model-specific coding preferences;
- no provider-specific checks in `packages/agent`;
- no duplicated model-name checks across tools or prompts;
- unknown models use a documented safe fallback;
- the selected profile appears in diagnostics;
- configuration can override the profile;
- no unsupported performance or quality claim is attached to a profile.

## P1.2 — Select the primary existing-file mutation tool

For automatic/default model behavior, select either:

- `edit`, or
- `apply_patch`.

`write` remains reserved for file creation and intentional full replacement.

### Compatibility behavior

- preserve the canonical five-tool registry;
- allow users, CLI callers, and SDK callers to expose the full set;
- do not rename or change public tool schemas;
- keep a documented fallback for unknown models or operations the primary tool cannot express;
- do not silently remove explicitly configured tools.

## P1.3 — Rewrite tool descriptions and guidance

Inspect and refine:

- `packages/coding-agent/src/core/tools/read.ts`
- `packages/coding-agent/src/core/tools/bash.ts`
- `packages/coding-agent/src/core/tools/edit.ts`
- `packages/coding-agent/src/core/tools/write.ts`
- `packages/coding-agent/src/core/tools/apply-patch.ts`
- shared registry and system-prompt construction only where necessary.

Responsibilities:

- `read`: bounded inspection;
- `bash`: commands, search, repository operations, build, test, and lint;
- `edit`: exact localized replacement in one existing file;
- `write`: creation or intentional complete replacement;
- `apply_patch`: structured multi-hunk or multi-file mutation.

Descriptions must remain correct when the full set is enabled manually.

## P1.4 — Standardize tool interface behavior

Across built-in tools, standardize:

- concise descriptions and prompt snippets;
- bounded output;
- explicit continuation after truncation;
- actionable schema and precondition errors;
- cancellation semantics;
- shell exit status and relevant stderr;
- path and operation summaries;
- deterministic source metadata;
- no repeated system-prompt guidance.

Do not add a keyword router. Deterministic validation may reject invalid calls, but semantic selection remains the primary model's responsibility.

## P1 tests and validation

Add or update focused coverage for:

- coding-model profile resolution;
- known and unknown model fallback;
- manual profile override;
- primary mutation exposure or ordering;
- complete five-tool manual configuration;
- tool schema compatibility;
- strict description ownership;
- prompt and schema size diagnostics;
- patch safety and mutation queue behavior;
- cancellation, truncation, and shell exit information;
- CLI and SDK compatibility.

Run focused tests, `npm run check`, and controlled faux-provider sessions. Live provider comparisons are optional evidence for profile decisions, not a separate platform or phase.

### P1 completion criteria

- one module owns coding-model behavior;
- a profiled model has one primary existing-file mutation interface;
- `write` is unambiguously creation/full replacement;
- the complete five-tool set remains manually available;
- tool descriptions and outputs are concise and non-overlapping;
- unknown models preserve safe Pi-compatible behavior;
- no new mutation tool, provider abstraction, agent-loop branch, or evaluation platform exists.

---

# P2 — Add the essential adaptive skill package

## Objective

Implement only the five approved engineering skills through Native Pi's skill system and let the primary agent decide when they materially improve the task.

## P2.1 — Create the package

Suggested package location:

```text
packages/all-for-one-skills/
```

Create only:

```text
skills/repository-orientation/SKILL.md
skills/systematic-debugging/SKILL.md
skills/plan-complex-change/SKILL.md
skills/verify-before-completion/SKILL.md
skills/review-diff/SKILL.md
```

Use Native Pi package metadata or conventional `skills/` discovery.

The package contains Markdown skills and optional deterministic helper scripts only. It does not depend on a model SDK, agent runtime, database, vector store, or orchestration library.

## P2.2 — Make selection adaptive

All five skills are model-visible by default with precise trigger and exclusion language.

| Skill | Trigger |
|---|---|
| `repository-orientation` | Unfamiliar repository, broad architecture task, cross-package work, or execution-path tracing |
| `systematic-debugging` | Failing tests, crashes, regressions, unexpected behavior, or performance faults |
| `plan-complex-change` | Multi-module feature, architecture change, migration, compatibility-sensitive refactor, or staged implementation |
| `verify-before-completion` | Before claiming implemented work is fixed, passing, secure, compatible, or complete |
| `review-diff` | Requested review, high-risk or broad mutation, or final scope and regression review |

Each description must also state when not to use the skill so simple work remains direct.

## P2.3 — Preserve manual overrides

Maintain:

- `/skill:<name>` for direct invocation;
- `disable-model-invocation` for project or user manual-only policy;
- package resource filtering;
- `--no-skills` and explicit skill paths;
- project-local overrides and current precedence;
- bounded metadata and duplicate diagnostics.

Adaptive default behavior must not remove manual control.

## P2.4 — Prevent workflow bloat

A workflow is a procedure inside a skill followed by the same primary agent.

Do not add:

- a skill tool;
- a universal router skill;
- a workflow state machine;
- a scheduler;
- subagents;
- mandatory planning, TDD, review, or verification for trivial tasks;
- automatic package installation;
- another context or memory layer.

Skills may be composed only when responsibilities are distinct and necessary.

## P2.5 — Skill quality rules

- Keep each `SKILL.md` concise and procedural.
- Put detailed references one level below only when necessary.
- Avoid copying third-party repositories wholesale.
- Preserve required attribution and license notices for reused material.
- Do not repeat base system instructions or repository policy.
- Do not require another skill to interpret the current skill.
- Stop when the task's evidence requirement is satisfied.

## P2 tests and validation

Verify:

- package discovery through Native Pi;
- all five skills are model-visible by default;
- explicit invocation of every skill;
- project or user manual-only override;
- full skill bodies remain outside the prompt before invocation;
- metadata remains within budget;
- project-local duplicate precedence;
- resource filters can disable individual skills;
- simple tasks do not require a skill;
- a controlled faux-provider can load a matching skill;
- no new tool schema or workflow runtime appears.

### P2 completion criteria

- only the five approved skills are included;
- the primary model can select them from task context;
- manual invocation and manual-only policy remain supported;
- descriptions are specific and non-overlapping;
- skill bodies load progressively;
- no skill tool, workflow engine, subagent requirement, or semantic retrieval system exists.

---

# P3 — Clarify knowledge ownership

## Objective

Make project knowledge discoverable and durable without duplicating scoped context, compaction, source, tests, or local memory.

## P3.1 — Standardize optional `CONTEXT.md`

Define `CONTEXT.md` as optional project documentation for:

- stable terminology;
- domain facts;
- important system boundaries;
- external-system names;
- durable constraints not better represented in code or ADRs.

It must not duplicate:

- `AGENTS.md` behavioral instructions;
- source code;
- complete architecture documentation;
- transient task notes;
- secrets;
- generated inventories.

Discovery should use current resource-loading boundaries where possible. Do not add a semantic index.

## P3.2 — Standardize ADR discovery

Document supported ADR locations and naming conventions, then expose bounded metadata or direct references through existing project context mechanisms.

Requirements:

- ADRs remain version-controlled Markdown;
- only relevant decisions are read when needed;
- no database or embedding index;
- no duplicate architectural summary in local memory;
- source and tests remain executable truth.

## P3.3 — Restrict local memory

Local memory is limited to explicit:

- user preferences;
- corrections;
- stable conventions not appropriate for the repository;
- recurring tool or environment quirks.

Do not automatically extract every conversation. Do not store repository architecture, full code summaries, secrets, or transient task progress.

Preserve existing bounds, atomic updates, and best-effort secret checks.

## P3.4 — Preserve scoped-context behavior

Retain:

- parent-to-child instruction ordering;
- path-scoped activation;
- bounded active scopes and characters;
- deterministic replacement of stale sibling context;
- the first-mutation scoped-instruction barrier;
- diagnostics for omitted, oversized, conflicting, or replaced scopes.

Do not add semantic conflict resolution or shell-directory inference.

## P3.5 — Refine compaction continuity

Using the existing compaction owner, retain:

- active goal and constraints;
- decisions and rationale;
- files inspected and modified;
- unresolved blockers and risks;
- commands run and results observed;
- next required validation.

Do not add another memory layer or exact transcript archive.

## P3 validation

- focused context, memory, and compaction tests;
- bounded prompt and metadata diagnostics;
- compaction structural validation and repair behavior;
- no duplicate instruction or knowledge injection;
- compatibility with session persistence and restoration;
- documentation examples for `CONTEXT.md` and ADRs.

### P3 completion criteria

- each type of knowledge has one owner;
- optional `CONTEXT.md` and ADRs are documented and bounded;
- local memory remains narrow and explicit;
- scoped context remains compatible;
- compaction preserves continuation evidence without becoming a second knowledge base.

---

# P4 — Ship optional robustness packages

## Objective

Deliver robustness capabilities outside the default core with zero normal-session cost while disabled.

Each capability is a separate focused branch and pull request.

## P4.1 — Safe-mode extension

Provide optional allow, ask, or deny policy for selected shell and file mutations.

Requirements:

- protect configured paths;
- warn or block clearly dangerous actions;
- preserve project trust;
- provide concise reasons;
- avoid pretending to parse every shell construct;
- do not claim OS isolation;
- do not modify the generic agent loop.

## P4.2 — Read-only code-intelligence extension

Expose one optional namespaced tool with a small operation enum, initially limited to:

```text
diagnostics
definition
references
```

Requirements:

- use project-installed language servers where practical;
- bundle no language-server ecosystem by default;
- start services lazily;
- remain read-only initially;
- bound results and timeouts;
- shut down processes cleanly;
- feed diagnostics into existing evidence surfaces rather than create a validator agent.

## P4.3 — External sandbox/container templates

Provide documentation and launch templates for supported container or sandbox approaches.

Requirements:

- remain external to the agent loop;
- distinguish real isolation from approval prompts;
- document workspace, network, credential, process, and cleanup behavior;
- make no cross-platform guarantee without testing;
- do not force sandboxing for ordinary installations.

## P4.4 — Documented MCP adapter configuration

Prefer documented configuration or an existing maintained Pi package before writing a new adapter.

If an adapter is required:

- explicit server and tool allowlists;
- lazy startup;
- bounded descriptions and schemas;
- timeouts and cleanup;
- provenance in diagnostics;
- no automatic discovery of every server or tool;
- no default-core dependency.

## P4 validation

For every optional package:

- disabled-state prompt and process cost is zero;
- enable, invoke, failure, timeout, cancellation, and shutdown are tested;
- removal leaves base sessions unaffected;
- package filtering and trust behavior work;
- security limitations are explicit;
- no core agent-loop change is required unless separately justified.

### P4 completion criteria

- safe mode, code intelligence, sandbox templates, and MCP guidance are independently optional;
- no optional tool schema appears when disabled;
- no background process starts when disabled;
- failure of an optional capability cannot break the base coding session.

---

# P5 — Reduce downstream maintenance cost

## Objective

Minimize the long-term cost of keeping All-For-One synchronized with Native Pi.

## P5.1 — Review against `main`

For every retained divergence:

- identify the owner and purpose;
- identify the upstream file touched;
- determine whether a native hook can replace the edit;
- record compatibility and rollback impact;
- remove obsolete changes.

## P5.2 — Move optional behavior out of upstream-hot files

Prefer extensions, packages, themes, skills, and focused coding-agent modules when Native Pi hooks support them.

Do not move code merely to reduce line count. Extraction is justified only when it creates a stable boundary and reduces conflict risk.

## P5.3 — Remove duplication

Audit and remove:

- repeated tool-name lists;
- duplicate model-profile rules;
- repeated skill policy text;
- stale phase documents;
- duplicate diagnostics;
- helpers with the same ownership;
- obsolete compatibility shims;
- documentation that conflicts with the current source of truth.

## P5.4 — Preserve public compatibility

Verify:

- package exports;
- CLI flags and defaults;
- settings parsing;
- extension APIs and events;
- SDK entry points;
- RPC and print behavior;
- session loading;
- package and resource discovery.

## P5.5 — Document retained divergences

For each intentional difference from Native Pi, record:

- demonstrated problem;
- selected approach;
- why the native behavior or hook was insufficient;
- files and public surfaces affected;
- validation performed;
- security and compatibility implications;
- rollback path;
- likely upstream merge-conflict area.

## P5 validation

- compare `main...allforone` and the focused branch;
- run the smallest decisive focused tests;
- run broader checks based on affected risk;
- rehearse merging current `main` into a disposable focused branch or worktree when appropriate;
- verify no generated or package metadata drift;
- report unrun checks honestly.

### P5 completion criteria

- optional behavior uses native extension boundaries where practical;
- upstream-hot edits are minimized and justified;
- repeated helpers and policy text are removed;
- public Pi-compatible APIs remain stable;
- every retained divergence has evidence, ownership, and rollback documentation.

---

# Cross-phase validation policy

There is no dedicated evaluation-platform phase.

Validation is performed where the behavior is introduced:

- focused unit and integration tests;
- controlled faux-provider sessions;
- prompt and schema size diagnostics;
- tmux TUI smoke tests;
- package discovery and disabled-state checks;
- existing repository static checks and CI;
- upstream comparison and merge rehearsal;
- optional live-provider comparisons only when a concrete model-profile decision requires them.

The existing baseline, doctor, evaluator, and execution-integrity capabilities may be extended narrowly. They must not become a new platform, service, database, dashboard, or mandatory agent review loop.

# Pull request strategy

Use separate focused pull requests:

1. P0 documentation and UI/UX foundation.
2. P1 centralized coding-model profile and tool interface.
3. P2 essential adaptive skills package.
4. P3 knowledge ownership and compaction refinements.
5. One pull request per P4 optional capability.
6. P5 consolidation and upstream-maintenance cleanup.

Do not combine unrelated phases into one implementation pull request. The current documentation pull request defines the approved plan and does not itself claim runtime validation.
