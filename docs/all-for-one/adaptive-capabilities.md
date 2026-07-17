# Adaptive capabilities

## Purpose

Make All-For-One select the smallest useful skill, tool, or workflow from the current task and context without introducing a second orchestrator, request-classifier model, workflow engine, skill tool, or hidden autonomous control plane.

The primary model remains responsible for task reasoning. All-For-One improves that decision through:

- one centralized coding-model profile;
- precise and non-overlapping built-in tool contracts;
- Native Pi's model-visible skill metadata and progressive disclosure;
- existing extension and package registration;
- deterministic safety, trust, and eligibility boundaries;
- explicit manual overrides.

## Current foundations

All-For-One already has the required primitives:

- a small canonical built-in tool registry;
- dynamic extension tool registration;
- active-tool allowlists and denylists;
- bounded model-visible skill metadata;
- on-demand skill-body loading with `read`;
- `/skill:<name>` manual invocation;
- `disable-model-invocation` for manual-only project or user policy;
- deterministic skill precedence and duplicate handling;
- package filtering and project/global overrides;
- context diagnostics for active and inactive tools, visible skills, manual-only skills, origins, and prompt cost.

The implementation should refine these capabilities rather than replace them.

## Selection principles

### Primary model as selector

Do not add another LLM call before the main agent turn. The primary model already has the request, active project instructions, conversation state, tool definitions, and skill descriptions.

A separate classifier would add latency, cost, duplicated reasoning, and new failure modes while seeing less context than the primary agent.

### Minimum sufficient capability

Use the least complex capability that can complete the task safely and correctly:

1. Answer directly when no repository interaction is needed.
2. Use the narrowest relevant built-in tool.
3. Load one clearly matching essential skill when procedural guidance materially improves the task.
4. Combine skills only when their responsibilities are distinct and both are required.
5. Use an optional extension tool only when it is installed, enabled, and relevant.
6. Stop the workflow when the task's success condition is satisfied.

Do not activate a skill or workflow merely because it exists.

### Progressive disclosure

Keep only concise names and descriptions in the normal model context. Load full skill instructions, references, or helper scripts only after a skill is selected.

Optional tool schemas are exposed only when their owning extension or package is enabled.

### Manual override remains authoritative

Automatic selection is a default convenience, not a removal of control.

Users and projects retain control through:

- `/skill:<name>`;
- `disable-model-invocation`;
- `--no-skills` and explicit `--skill` paths;
- package and resource filters;
- extension enable and disable settings;
- tool allowlists and denylists;
- CLI and SDK active-tool configuration;
- coding-model profile overrides;
- project instructions.

An explicit user choice wins unless it violates an existing safety or trust boundary or the capability is unavailable.

## P1 — Centralized coding-model profile

### Purpose

Different coding models may perform more reliably with different existing mutation interfaces. This behavior must be centralized instead of being scattered across tool descriptions, provider adapters, prompts, or model-name checks.

### Ownership

Create one coding-agent-local profile module, for example:

```text
packages/coding-agent/src/core/coding-model-profile.ts
```

The exact filename may follow repository conventions, but there must be one owner.

The profile must not create a second model registry. It consumes Native Pi's existing resolved model identity.

### Minimum profile

The initial profile should remain small:

```ts
export interface CodingModelProfile {
  existingFileMutation: "edit" | "apply_patch";
  supportsParallelTools?: boolean;
  recommendedThinkingLevel?: ThinkingLevel;
}
```

Only fields supported by a verified use case should be added. The profile is not a general provider configuration object.

### Mutation selection

For normal automatic operation:

- select either `edit` or `apply_patch` as the primary existing-file mutation interface;
- keep `write` for file creation and intentional complete replacement;
- keep `read` for inspection;
- keep `bash` for shell, repository, search, build, test, and lint operations;
- preserve manual configuration for all five tools;
- retain a safe fallback for unknown or unprofiled models.

The profile may influence default exposure, ordering, and prompt guidance. It must not rename tools or change their public schemas.

### Profile rules

- No provider-specific conditionals in `packages/agent`.
- No model-name checks duplicated across tool files.
- Unknown models fall back to documented Native Pi-compatible behavior.
- A user override may select `edit`, `apply_patch`, or the complete five-tool set.
- The selected profile is visible in `/context` or equivalent diagnostics.
- Profiles are not marketed as quality improvements until measured.
- Adding a profile entry requires a reproducible reason and focused compatibility tests.

## P1 — Built-in tool contracts

The canonical registry remains:

```text
read
bash
edit
write
apply_patch
```

### Non-overlapping responsibilities

| Tool | Primary responsibility | Do not use when |
|---|---|---|
| `read` | Inspect text or image files with bounded output and continuation support | A shell command or file mutation is required |
| `bash` | Run shell commands, repository search, builds, tests, linters, and version-control inspection | A dedicated file tool expresses the operation more safely and clearly |
| `edit` | Perform an exact localized replacement in one existing file | Creating a file, replacing a complete file, or applying a multi-file patch |
| `write` | Create a file or intentionally replace its complete contents | A localized edit or structured patch is sufficient |
| `apply_patch` | Apply structured multi-hunk or multi-file mutations | One exact localized replacement is sufficient |

The model profile determines the primary existing-file mutation tool. Tool descriptions still remain correct when users expose the complete set manually.

### Tool interface standard

All built-in tools should follow the same interface quality rules:

- concise names and descriptions;
- one clearly stated responsibility;
- bounded output;
- explicit truncation and continuation guidance;
- actionable schema and precondition errors;
- consistent cancellation behavior;
- shell exit information when available;
- deterministic source and active-state diagnostics;
- no duplicate prompt guidance.

### No hidden router

The harness may enforce deterministic conditions such as disabled tools, invalid schemas, workspace boundaries, project trust, and scoped-instruction preflight.

It must not parse user prompts with an expanding set of keyword or regular-expression rules to choose tools. Selection remains semantic reasoning by the primary model.

## P2 — Essential adaptive skill package

### Approved scope

Implement only these five first-party skills:

1. `repository-orientation`
2. `systematic-debugging`
3. `plan-complex-change`
4. `verify-before-completion`
5. `review-diff`

Use Native Pi's skill loader and the Agent Skills format. Do not add a `skill` tool, router skill, workflow runtime, scheduler, or agent hierarchy.

### Default invocation policy

All five skills are model-visible by default with precise descriptions and exclusions. The agent decides when they improve the current task.

Manual invocation remains available for every skill. A project or user may set a skill to manual-only through existing `disable-model-invocation` metadata or resource filtering.

| Skill | Automatic trigger | Important exclusions |
|---|---|---|
| `repository-orientation` | Unfamiliar repository, broad architecture task, cross-package change, or execution-path tracing | Trivial single-file edit with sufficient existing context |
| `systematic-debugging` | Reproducible bug, failing test, crash, regression, unexpected behavior, or performance fault | New feature planning without a failure to diagnose |
| `plan-complex-change` | Multi-module feature, architectural change, migration, compatibility-sensitive refactor, or work needing staged implementation | Small isolated edit with an obvious implementation path |
| `verify-before-completion` | Before claiming a change is fixed, complete, passing, secure, or compatible | Pure explanation or brainstorming with no implementation claim |
| `review-diff` | Requested code review, high-risk change, broad mutation, or final scope and regression review | Ordinary read-only explanation without a change set |

### Description contract

Each skill description must state:

1. what the skill does;
2. the concrete situations that should trigger it;
3. when not to use it.

Example:

```yaml
description: Trace reproducible bugs, failing tests, crashes, regressions, and unexplained behavior before proposing the smallest fix. Do not use for feature planning without a failure to diagnose.
```

Avoid generic descriptions such as `Helps with engineering` or universal claims that cause every task to load the skill.

### Skill-body constraints

- Keep `SKILL.md` concise and procedural.
- Put detailed references one level below the skill only when needed.
- Include helper scripts only for repeated deterministic operations.
- Do not repeat the base system prompt, repository instructions, or another skill.
- Do not require one skill merely to understand another.
- Do not launch subagents.
- Do not force planning, TDD, review, or broad validation on trivial tasks.
- Stop once sufficient evidence exists.

### Skill composition

The agent may combine skills when their responsibilities are distinct. Examples:

- `repository-orientation` followed by `plan-complex-change` for an unfamiliar multi-package refactor;
- `systematic-debugging` followed by `verify-before-completion` for a bug fix;
- `plan-complex-change` followed by `review-diff` for a compatibility-sensitive implementation.

The harness does not create a fixed pipeline. The primary model loads only what the task requires.

### Collision and precedence

Retain the existing precedence order:

1. explicit temporary invocation;
2. project-local skill;
3. user-global skill;
4. package-provided skill;
5. remaining sources.

A lower-priority duplicate is omitted and reported through diagnostics. Skill bodies are never merged automatically.

## Workflow interpretation

A workflow is a procedure described by a skill and carried out by the same primary agent using existing tools.

It is not:

- a new execution engine;
- a persisted workflow graph;
- a subagent team;
- a mandatory sequence for every task;
- a second task planner.

The primary model may follow a skill workflow automatically when:

- the description clearly matches;
- the workflow stays in the current agent session;
- steps are necessary rather than ceremonial;
- no external publication, credential change, or destructive operation occurs without the existing control boundary;
- no additional model is required;
- the workflow can terminate as soon as sufficient evidence exists.

Explicit user confirmation remains required where existing repository or product policy requires it, including publication, releases, credentials, destructive operations, and material scope expansion.

## P3 — Knowledge-aware capability use

Adaptive selection may use current project instructions, optional `CONTEXT.md`, ADR summaries, session state, and bounded skill descriptions.

It must not add embeddings, semantic retrieval, automatic memory extraction, or a second context manager.

Knowledge ownership remains:

- scoped project instructions for behavior;
- `CONTEXT.md` for stable shared terminology and domain facts;
- ADRs for architectural decisions;
- source and tests for executable truth;
- local memory for explicit preferences, corrections, and tool quirks;
- compaction for current-session continuity.

## P4 — Optional tools and extensions

Optional capabilities remain outside the default core:

- safe-mode extension;
- read-only code-intelligence extension;
- external sandbox or container launch templates;
- documented MCP adapter configuration.

### Activation rules

- Never install an optional package automatically.
- Never expose every installed external tool by default.
- Respect project trust and package filters.
- Register tools only when the owning extension is enabled.
- Prefer one namespaced tool with a small operation enum over many overlapping tools.
- Start language servers, sockets, watchers, or helper processes only when invoked.
- Dispose session-owned resources on shutdown.
- Keep descriptions, schemas, and output bounded.
- Add no prompt or process cost while disabled.

### Capability policy

| Capability | Default | Activation |
|---|---|---|
| Canonical built-in tools | Enabled according to model profile and manual configuration | Session, CLI, and SDK configuration |
| Essential skill package | Discoverable | Primary model or `/skill:<name>` |
| Safe mode | Disabled optional extension | User or project package configuration |
| Read-only code intelligence | Disabled optional extension | Enabled package; service starts lazily |
| Sandbox/container templates | Documentation and templates | User-selected launch environment |
| MCP adapter | Disabled optional configuration | Explicit server and tool allowlist |

## Observable adaptive state

The system may expose a small coding-agent-local read model for capability use:

```ts
interface ActiveCapabilityState {
  codingModelProfile: string;
  primaryMutationTool: "edit" | "apply_patch";
  loadedSkills: readonly string[];
  explicitSkills: readonly string[];
  optionalTools: readonly string[];
}
```

The exact type should follow repository conventions.

Requirements:

- report actual loaded or invoked skills, not every discovered skill;
- distinguish explicit invocation only where useful;
- derive optional tools from registered non-built-in definitions;
- do not persist a hidden task classification;
- reuse existing session events and diagnostics;
- do not create another telemetry store;
- keep the rail concise and `/context` detailed.

## Failure and fallback behavior

- Missing or invalid skill content produces a bounded diagnostic and normal model fallback.
- Ambiguous skill descriptions should cause no automatic skill selection rather than several speculative loads.
- An unknown model uses the documented default coding profile.
- If the primary mutation tool cannot express a valid operation, the model may use an explicitly available fallback or provide corrective guidance.
- Disabled optional capabilities are not represented as available.
- A failed optional service must not break the base five-tool coding session.

## Validation strategy

There is no dedicated evaluation-platform phase.

Each implementation phase validates its own claims through:

- focused unit and integration tests;
- faux-provider sessions where model behavior must be controlled;
- prompt and schema size diagnostics;
- tmux interactive smoke checks where UI state is involved;
- existing repository checks and CI;
- optional recorded live-provider comparisons only when credentials and a concrete decision justify them.

No quality, latency, token, cost, or model-reliability claim is made without recorded evidence.

## Acceptance criteria

Adaptive capability work is complete when:

1. One centralized coding-model profile owns mutation preference.
2. `edit` and `apply_patch` no longer compete as equal automatic defaults for a profiled model.
3. The complete five-tool set remains manually available and Pi-compatible.
4. Tool descriptions and outputs have strict, non-overlapping contracts.
5. The five approved skills use Native Pi's skill system and are adaptively discoverable by default.
6. Manual skill invocation and manual-only project policy remain supported.
7. Simple tasks do not load unnecessary skills or workflows.
8. Optional tools add no prompt or process cost while disabled.
9. Actual capability use is observable without invented agents or task classifications.
10. No classifier model, skill tool, workflow engine, semantic retrieval layer, or evaluation platform is added.
