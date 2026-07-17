# All-For-One implementation roadmap

## Goal

Improve All-For-One as a fast, robust, cost-conscious Native Pi coding harness by prioritizing terminal UI/UX, then refining adaptive skill and tool use, then packaging focused engineering capabilities through Pi's existing extension and package architecture.

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
7. Keep optional behavior cost-free in normal sessions while disabled.
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

Make the interactive mode cleaner, more modern, easier to scan, and more responsive without changing the core runtime or adding a new UI framework.

## Task 1.1 — Establish visual baselines

**Files inspected:**

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/modes/interactive/components/brand-header.ts`
- `packages/coding-agent/src/modes/interactive/components/session-rail.ts`
- `packages/coding-agent/src/modes/interactive/components/footer.ts`
- `packages/coding-agent/src/modes/interactive/components/status-indicator.ts`
- `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- `packages/coding-agent/src/modes/interactive/theme/theme.ts`
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

Capture these states:

- first startup;
- first user message;
- active model response;
- successful tool call;
- failed tool call;
- long truncated output;
- skill invocation;
- retry;
- compaction;
- narrow-terminal fallback.

Do not commit machine-specific screenshots unless they are deliberately added as review artifacts. The permanent result is the documented acceptance matrix and focused component fixtures.

**Validation:**

Use the existing tmux workflow from `AGENTS.md`. This task makes no visual quality claim; it only records current behavior for comparison.

## Task 1.2 — Add restrained All-For-One themes

**Files:**

- Create: `packages/coding-agent/src/modes/interactive/theme/all-for-one-dark.json`
- Create: `packages/coding-agent/src/modes/interactive/theme/all-for-one-light.json`
- Modify only if required: `packages/coding-agent/src/modes/interactive/theme/theme.ts`
- Modify only if required: `packages/coding-agent/src/modes/interactive/theme/theme-schema.json`
- Modify: `packages/coding-agent/test/theme.test.ts` if this existing test owns theme validation; otherwise extend the nearest existing theme test without creating a duplicate suite
- Modify: `packages/coding-agent/docs/themes.md`

**Requirements:**

- Use the existing complete theme schema.
- Preserve built-in `dark` and `light` unchanged.
- Add no theme dependency or runtime code when JSON discovery already works.
- Use terminal default foreground where it improves compatibility.
- Keep ordinary text neutral and reserve accent colors for selection and state.
- Ensure pending, success, warning, and error remain distinguishable without color alone in their components.
- Verify truecolor and 256-color fallback.
- Do not add more than two bundled All-For-One themes in this phase.

**Default-selection decision:**

Do not overwrite an existing explicit theme setting. For a new installation with no theme selection, prefer the matching All-For-One theme only if the first-run selection path can do so without changing Pi's general theme discovery semantics. Otherwise keep Native Pi's existing background-based default and document how to select the All-For-One themes. Compatibility is more important than forced branding.

**Focused validation:**

- Theme JSON schema validation.
- Existing theme loading and selection tests.
- Startup with both new themes.
- Hot reload of a project or user theme remains unchanged.
- `npm run check` after implementation code or checked JSON changes.

## Task 1.3 — Convert the header into welcome and working states

**Files:**

- Modify: `packages/coding-agent/src/modes/interactive/components/brand-header.ts`
- Modify: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Modify: `packages/coding-agent/test/brand-header.test.ts`
- Modify the nearest interactive lifecycle test if header transitions require integration coverage

**Interfaces:**

Introduce one small presentation input rather than giving the component access to `AgentSession`:

```ts
export type BrandHeaderState = "welcome" | "working";
```

The component receives the state and already-resolved display values such as title, version, model label, and image eligibility. Interactive mode owns when the state changes.

**Behavior:**

- `welcome`: optional inline product mark, product title, version, selected model, and one concise help hint when sufficient terminal height exists.
- `working`: compact text-only title or no built-in header when the footer already communicates the durable state.
- Transition after the first accepted user message or restored non-empty session.
- Do not append a second branded block to the transcript.
- Preserve extension-provided custom headers.
- Preserve text fallback when images are unavailable or blocked.
- Do not load the PNG repeatedly.

**Focused validation:**

- image-capable welcome state;
- text-only welcome state;
- restored session starts compact;
- first message transitions once;
- custom header remains authoritative;
- no behavior change in print, RPC, or SDK modes.

## Task 1.4 — Refine the contextual session rail

**Files:**

- Modify: `packages/coding-agent/src/modes/interactive/components/session-rail.ts`
- Modify: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Modify: `packages/coding-agent/src/core/settings-manager.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/settings-selector.ts`
- Modify: `packages/coding-agent/test/session-rail.test.ts`
- Modify: `packages/coding-agent/test/settings-manager.test.ts`
- Modify the nearest settings-selector test if one exists

**Interface:**

```ts
export type SessionRailMode = "auto" | "on" | "off";
```

Add:

```ts
sessionRailMode?: SessionRailMode;
```

Default to `auto`.

**Section model:**

- `STATUS`: lifecycle and optional extension progress.
- `ACTIVITY`: active tools and recent outcomes.
- `CONTEXT`: active project instruction resources and warning count.
- `CAPABILITIES`: skills actually loaded for the task and relevant enabled optional capabilities.

**Behavior:**

- `auto`: display only when terminal width permits and useful rail content exists.
- `on`: display whenever width permits, including empty-state placeholders only where necessary.
- `off`: never register or show passive rail overlays.
- Hide empty sections in `auto` mode.
- Remove the `CONTEXT / AGENTS` wording; the project remains single-agent by default.
- Continue using existing session and extension events. Do not scan files or invoke a model to populate the rail.
- Preserve current width bounds unless captured evidence shows a specific readability problem.
- Preserve shortcut wrapping only when vertical space permits.

**Focused validation:**

- width below threshold;
- width at threshold;
- maximum rail width;
- each mode;
- no useful content in `auto`;
- active and recent tools;
- context resources and warnings;
- loaded skills;
- sanitized extension-provided text;
- print, RPC, and SDK unaffected.

## Task 1.5 — Standardize transcript and tool presentation

**Files:**

- Inspect and modify narrowly: `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- Inspect and modify narrowly: `packages/coding-agent/src/modes/interactive/components/bash-execution.ts`
- Inspect and modify narrowly: `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`
- Inspect and modify narrowly: `packages/coding-agent/src/modes/interactive/components/user-message.ts`
- Inspect and modify narrowly: `packages/coding-agent/src/modes/interactive/components/footer.ts`
- Inspect and modify narrowly: `packages/coding-agent/src/modes/interactive/components/status-indicator.ts`
- Modify the corresponding existing focused tests only

**Requirements:**

- A collapsed successful tool call normally occupies one concise row.
- A failed tool call exposes a short actionable error without requiring expansion.
- Pending, success, cancelled, and failed states use text or symbols in addition to color.
- Shell failures display exit status when available.
- Truncated output explicitly states what was omitted and how to continue.
- Avoid repeating model, directory, or lifecycle state in several persistent surfaces.
- Preserve expansion behavior and extension renderers.
- Do not suppress information needed for diagnosis.

**Boundary:**

Do not redesign every component in one change. Group only components that share the same presentation contract, and keep separate commits where a reviewer could accept one change while rejecting another.

## Task 1.6 — UI/UX documentation and smoke gate

**Files:**

- Update: `docs/all-for-one/ui-ux.md`
- Update: `packages/coding-agent/docs/themes.md`
- Update only when user-visible behavior changed: `packages/coding-agent/README.md`
- Add changelog entry under the existing `[Unreleased]` section when implementation begins

**Validation:**

- Run every modified focused test.
- Run `npm run check` because implementation code changed.
- Run tmux smoke checks at 80 by 24, 120 by 30, and 160 by 40.
- Exercise dark, light, image, and text fallback paths where available.
- Confirm extension header, footer, widget, overlay, command, and editor compatibility.
- Record limitations instead of claiming universal terminal rendering.

**Phase completion criteria:**

- The UI is cleaner at all three target sizes.
- The welcome mark no longer permanently consumes transcript height.
- The rail is useful, optional, and responsive.
- No model call, repository scan, dependency, or non-interactive behavior was added for presentation.

---

# Phase 2 — Adaptive skill and tool selection

## Objective

Let the primary agent choose the smallest useful capability automatically from precise metadata and task context while preserving explicit overrides and the Native Pi single-agent loop.

## Task 2.1 — Audit and tighten built-in tool contracts

**Files:**

- Modify: `packages/coding-agent/src/core/tools/read.ts`
- Modify: `packages/coding-agent/src/core/tools/bash.ts`
- Modify: `packages/coding-agent/src/core/tools/edit.ts`
- Modify: `packages/coding-agent/src/core/tools/write.ts`
- Modify: `packages/coding-agent/src/core/tools/apply-patch.ts`
- Modify only if shared definitions require it: `packages/coding-agent/src/core/tools/index.ts`
- Modify: `packages/coding-agent/test/tools.test.ts`
- Modify: `packages/coding-agent/test/tool-registry.test.ts`
- Modify focused individual tool tests such as `packages/coding-agent/test/apply-patch-tool.test.ts`
- Modify: `packages/coding-agent/test/system-prompt.test.ts`

**Requirements:**

- Preserve all five tool names and public definitions.
- Make responsibilities non-overlapping:
  - `read`: inspect files;
  - `bash`: commands and repository operations;
  - `edit`: exact localized replacement in one existing file;
  - `write`: create or intentionally replace a complete file;
  - `apply_patch`: structured multi-hunk or multi-file mutation.
- Keep descriptions concise enough to avoid prompt growth.
- Return corrective errors when the requested operation clearly belongs to another existing tool and can be identified deterministically.
- Do not add a hidden keyword router.
- Do not remove a tool from unknown models.

**Validation:**

- Schema and prompt snapshots remain bounded.
- Existing SDK and extension tool behavior remains compatible.
- No duplicate guideline is appended to the system prompt.
- Tool registry and active-tool allow/deny behavior remain deterministic.

## Task 2.2 — Define first-party skill activation policy

**Files:**

- Modify narrowly if needed: `packages/coding-agent/src/core/skills.ts`
- Modify narrowly if needed: `packages/coding-agent/src/core/system-prompt.ts`
- Modify: `packages/coding-agent/test/skills.test.ts`
- Modify: `packages/coding-agent/test/system-prompt.test.ts`
- Modify: `packages/coding-agent/docs/skills.md`
- Update: `docs/all-for-one/adaptive-capabilities.md`

**Requirements:**

- Retain progressive disclosure and the existing metadata budget.
- Retain `disable-model-invocation` and `/skill:<name>`.
- Keep source precedence and duplicate behavior unchanged unless a concrete defect is found.
- Add at most one concise base instruction that tells the model to load a skill only when its description clearly matches and materially improves the task.
- Do not require a universal bootstrap skill.
- Do not add skill embeddings or semantic indexing.
- Expose actual loaded skill state to the rail using existing session events or a small coding-agent-local event if one is already necessary for correct UI state.

**Validation:**

- automatic skill metadata remains bounded;
- manual-only skills are omitted from the model-visible catalog;
- explicit skill invocation still works;
- duplicate and omitted diagnostics remain accurate;
- empty skill sets do not add unnecessary prompt text.

## Task 2.3 — Build a minimal first-party engineering skill package

**Preferred location:**

Create a standalone Native Pi package under the narrowest existing workspace location selected during implementation. Do not place its skill bodies in `packages/agent` or hardcode them into the system prompt.

A candidate package layout is:

```text
packages/all-for-one-skills/
  package.json
  skills/
    repository-orientation/SKILL.md
    systematic-debugging/SKILL.md
    verify-before-completion/SKILL.md
    plan-complex-change/SKILL.md
    review-diff/SKILL.md
```

Before creating a new workspace package, verify whether the repository already has an intended first-party Pi-package location. Reuse it when present.

**Skill policy:**

| Skill | Invocation |
|---|---|
| `repository-orientation` | Model-visible |
| `systematic-debugging` | Model-visible |
| `verify-before-completion` | Model-visible |
| `plan-complex-change` | Manual-only |
| `review-diff` | Manual-only |

**Requirements:**

- Distill engineering principles; do not copy a third-party repository wholesale.
- Preserve applicable licenses and attribution for any reused material.
- Keep each `SKILL.md` concise and specific.
- Put large references outside the main body.
- Do not require subagents.
- Do not force every task through planning, TDD, worktrees, or review.
- Do not include an always-triggered skill router.
- Package through Native Pi's `pi.skills` or conventional `skills/` discovery.
- Make installation optional; do not add the package to every user's settings silently.

**Focused validation:**

- Pi skill validation;
- package discovery and filtering;
- model-visible versus manual-only catalog behavior;
- explicit `/skill:<name>` invocation;
- duplicate resolution against project-local overrides;
- no prompt content from full skill bodies before invocation.

## Task 2.4 — Make actual capability use visible

**Files:**

- Modify narrowly: `packages/coding-agent/src/core/agent-session.ts`
- Modify narrowly: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- Modify: `packages/coding-agent/src/modes/interactive/components/session-rail.ts`
- Modify: `packages/coding-agent/test/agent-session-dynamic-tools.test.ts`
- Modify: `packages/coding-agent/test/session-rail.test.ts`
- Modify the nearest skill-invocation component test

**Requirements:**

- Display skills that were actually loaded or explicitly invoked for the current task.
- Display enabled optional capabilities only when relevant to the current session.
- Do not display every discovered skill in the rail.
- Do not infer or persist a hidden task label.
- `/context` remains the detailed complete inventory.
- Use existing skill invocation parsing and session events where possible.
- Avoid modifying `packages/agent`.

## Task 2.5 — Preserve and document manual control

**Files:**

- Update: `packages/coding-agent/docs/skills.md`
- Update: `packages/coding-agent/docs/packages.md`
- Update: `docs/all-for-one/adaptive-capabilities.md`
- Update only when behavior changes: CLI and SDK documentation

**Document:**

- automatic versus manual-only skills;
- `/skill:<name>`;
- `--no-skills` and explicit skill paths;
- package resource filters;
- extension enable and disable behavior;
- tool allowlists and denylists;
- SDK active-tool options;
- project instruction overrides;
- absence of automatic package installation.

## Task 2.6 — Adaptive behavior gate

**Validation:**

Use deterministic tests and controlled faux-provider sessions. A paid live-model benchmark is not a completion requirement for this phase.

The phase is complete when:

- a clearly matching visible skill can be loaded on demand;
- simple tasks remain direct and do not acquire procedural overhead;
- manual-only skills remain explicit;
- all five built-in tools remain compatible and better differentiated;
- no classifier turn, workflow engine, embedding system, or new provider call is introduced;
- optional capabilities remain absent from prompt and process state while disabled.

---

# Phase 3 — Optional robustness packages

## Objective

Add specialized capability without increasing the default tool surface or core maintenance burden.

Each item is a separate focused branch and pull request. None is required to complete Phase 2.

## Task 3.1 — Safe-mode extension

**Placement:** Native Pi extension package.

**Responsibilities:**

- allow, ask, or deny selected shell and file mutations;
- protect configured paths such as credentials and generated dependency directories;
- warn on destructive commands;
- preserve project trust behavior;
- provide concise blocking reasons.

**Non-goals:**

- claim OS isolation;
- replace containers or virtual machines;
- parse every possible shell language safely;
- modify the core agent loop.

## Task 3.2 — Read-only code-intelligence extension

Expose one optional namespaced tool with a small operation enum:

```text
diagnostics
definition
references
symbols
```

**Requirements:**

- use a project-installed language server where possible;
- start lazily;
- do not bundle servers initially;
- use bounded results;
- cancel and shut down cleanly;
- remain disabled by default;
- do not duplicate repository search already available through `bash`.

## Task 3.3 — External sandbox launch guidance

Improve container and sandbox launch documentation and optional wrapper scripts without embedding a cross-platform sandbox in the agent runtime.

The security documentation must continue to state that approval prompts are authorization, not isolation.

## Task 3.4 — Narrow MCP adapter guidance

Prefer an existing maintained Pi package when it satisfies the need.

Any first-party adapter must be optional and enforce:

- explicit server configuration;
- tool allowlists;
- bounded descriptions and results;
- lazy connection;
- timeout and cancellation;
- visible provenance;
- clean shutdown.

## Task 3.5 — Defer delegation until justified

Do not add a permanent agent fleet.

A future single `subtask` capability may be considered only for explicitly selected independent work. It must be bounded, isolated, structured, optional, and absent from normal sessions while disabled.

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
- compaction, resource-loading, skills, system-prompt, and tool composition files.

For each divergence, record:

- requirement it satisfies;
- why an extension, skill, theme, or coding-agent-local module is insufficient;
- compatibility effect;
- likely upstream conflict frequency;
- rollback path.

## Task 4.2 — Extract optional behavior from hot paths

Move behavior only when the new boundary is smaller and clearer. Do not refactor for line count alone.

Candidates include:

- interactive presentation models extracted from `interactive-mode.ts`;
- optional capability packages instead of default registration;
- coding-agent-local policies instead of agent-core hooks;
- shared TUI primitives only when generally reusable.

## Task 4.3 — Remove duplicated documentation and policy text

Keep the ownership model from `docs/all-for-one/README.md`:

- architecture boundaries in `architecture.md`;
- visual and interaction behavior in `ui-ux.md`;
- adaptive behavior in `adaptive-capabilities.md`;
- delivery order in this roadmap.

Historical plans remain dated evidence, not the current source of truth.

## Task 4.4 — Upstream synchronization rehearsal

Before merging each implementation phase:

1. confirm `main` reflects the intended upstream Pi revision;
2. merge `main` into the focused branch or rehearse the merge in an isolated worktree according to repository policy;
3. inspect conflicts in upstream-hot files;
4. update the branch from `allforone` without rewriting published history;
5. rerun focused validation after conflict resolution.

Do not optimize for a zero-diff downstream. Optimize for intentional, well-owned divergences.

---

# Implementation order

The recommended order is:

1. Visual baselines.
2. All-For-One dark and light themes.
3. Welcome and compact header states.
4. Responsive rail modes and section cleanup.
5. Transcript and tool presentation.
6. Built-in tool contract refinement.
7. Skill activation policy.
8. Minimal optional first-party skill package.
9. Capability observability.
10. Manual-control documentation.
11. Separate optional robustness packages.
12. Upstream-hot-file consolidation.

Do not implement Phase 2 in parallel with the first UI composition changes. Stabilize the presentation model first so adaptive capability state has one clear UI destination.

# Validation strategy

Validation is an implementation gate, not a new product subsystem.

## Documentation-only changes

- Review links, paths, internal consistency, terminology, and branch targets.
- No build or test claim is required when code did not change.

## Code changes

For each focused task:

1. Write or update the focused regression test.
2. Run that exact test and inspect full output.
3. Implement the smallest cohesive change.
4. Rerun the focused test.
5. Run related component tests.
6. Run `npm run check` after code changes, as required by repository rules.
7. Use `./test.sh` only when the risk and repository rules call for the broader non-e2e suite.
8. Perform tmux smoke checks for interactive changes.
9. Review the final diff against the task's files and non-goals.

Never claim a visual improvement solely from unit tests. Never claim correctness solely from a screenshot.

# Rollback boundaries

Each phase must remain independently reversible:

- Themes are removable JSON resources.
- Header changes are isolated to interactive presentation.
- Rail mode defaults to `auto` and can be disabled.
- Tool-contract changes preserve tool names and APIs.
- First-party skills are optional package resources.
- Safe mode, code intelligence, MCP, sandbox launchers, and delegation remain separate packages or documentation.
- No phase requires session-format migration or provider changes.

# Decision records

## DR-1 — UI/UX precedes adaptive capability work

The current harness already has substantial runtime hardening. A clearer interface improves daily usability and creates a stable destination for capability observability before adaptive behavior is expanded.

## DR-2 — Terminal controls fonts

Bundling or forcing fonts is incompatible with terminal rendering and adds distribution cost. All-For-One uses terminal-safe typography and documents optional recommendations.

## DR-3 — Preserve Native Pi themes

Branded themes are additive. Existing `dark`, `light`, user, project, CLI, and package themes remain compatible.

## DR-4 — The primary model selects capabilities

A separate classifier duplicates reasoning and adds cost and latency. Precise metadata and progressive disclosure are the preferred adaptive mechanism.

## DR-5 — Workflows are skills, not an engine

Procedures belong in concise skills over existing tools. High-cost or high-autonomy workflows remain manual-only.

## DR-6 — Preserve the compatible built-in registry

The five current tools remain available. Their responsibilities become clearer before any model-specific reduction is considered.

## DR-7 — Optional ecosystem instead of core accumulation

Specialized tools, integrations, and security policies ship through Native Pi packages and extensions. Disabled capabilities do not consume normal-session prompt or process resources.

## DR-8 — Avoid `packages/agent` changes

UI, capability policy, skills, and optional integrations belong in the coding-agent or extension layers. Agent-core changes require a proven limitation that cannot be solved at the narrower boundary.

## DR-9 — No dedicated evaluation platform

Focused tests, static checks, controlled faux-provider sessions, and interactive smoke checks are sufficient implementation gates. All-For-One does not become a benchmark framework.

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