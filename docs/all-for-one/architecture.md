# All-For-One architecture

## Purpose

All-For-One is a lightweight downstream hardening and usability layer over Native Pi. It preserves Pi's adaptive single-agent architecture, package boundaries, compatibility identifiers, sessions, extension APIs, SDK, print mode, and RPC behavior while adding focused improvements that are justified by a demonstrated problem.

The branch relationship is:

```text
upstream Pi -> main -> allforone -> focused branches
```

`main` remains the clean local mirror of upstream Pi. `allforone` is the All-For-One integration branch. Focused implementation branches start from and return to `allforone`.

## Architectural objective

Improve the primary coding agent before adding orchestration.

The preferred path remains:

```text
User
  -> Interactive, print, RPC, or SDK entry point
  -> Coding-agent session composition
  -> Relevant context, skills, and tools
  -> Native Pi agent runtime
  -> Provider/model abstraction
  -> Tool execution and repository feedback
  -> Result
```

All-For-One must not surround this path with a permanent planner, reviewer, validator, classifier, or agent hierarchy.

## P0 architecture freeze

Before broad implementation, ownership and compatibility boundaries are frozen.

The following rules are architectural requirements:

1. The canonical built-in tool registry remains `read`, `bash`, `edit`, `write`, and `apply_patch`.
2. A new package or change to `packages/agent` is permitted only when Pi's existing public extension, skill, prompt, theme, settings, SDK, or coding-agent boundaries cannot support the verified requirement cleanly.
3. Optional behavior remains isolated from the main loop and has no prompt, process, or rendering cost while disabled.
4. Existing Pi-compatible identifiers and interfaces remain stable unless a separate migration is explicitly designed and validated.
5. UI/UX is the first runtime implementation priority, but it remains inside the interactive coding-agent boundary and does not redefine the core runtime.
6. Validation is part of every phase. There is no dedicated evaluation-platform phase or permanent evaluation subsystem.

## Package and subsystem ownership

| Owner | Responsibility |
|---|---|
| `packages/ai` | Provider APIs, model metadata, streaming, usage and cost fields, and inference abstraction |
| `packages/agent` | Generic agent state, message flow, tool calling, retries, cancellation, and execution loop |
| `packages/tui` | Reusable terminal rendering and input primitives |
| `packages/coding-agent` | Coding CLI, sessions, built-in tools, project context, skills, extensions, settings, compaction composition, interactive mode, print mode, RPC mode, and SDK integration |
| Native Pi skills | Progressive-disclosure workflows and procedural guidance |
| Native Pi extensions and packages | Optional tools, integrations, policies, themes, and specialized capabilities |
| `docs/all-for-one/` | Current architecture, roadmap, design decisions, limitations, and operational guidance |

Behavior belongs in the narrowest correct owner.

### Ownership map

| Concern | Authoritative owner |
|---|---|
| Provider and model APIs | `packages/ai` |
| Agent loop and generic tool calling | `packages/agent` |
| Coding-model behavior profile | One coding-agent-local model profile module |
| Built-in tool definitions and defaults | Existing coding-agent tool registry |
| Project and path-scoped instructions | Existing resource loader and scoped-context tracker |
| Skills | Existing Native Pi skill loader and Agent Skills metadata |
| Extensions and optional tools | Existing Native Pi extension and package system |
| Session history reduction | Existing compaction subsystem |
| Explicit local preferences and corrections | Existing bounded local memory store |
| Repository decisions | ADRs and version-controlled documentation |
| Interactive presentation | `packages/coding-agent/src/modes/interactive/` |
| Reusable terminal primitives | `packages/tui` only when generally reusable |
| Validation evidence | Existing tests, diagnostics, execution-integrity state, and CI |
| Strong isolation | External container, VM, or operating-system sandbox |

No subsystem introduces a second owner for one of these responsibilities.

## Runtime boundaries

### Provider and model abstraction

Native Pi's provider and model contracts remain authoritative. All-For-One does not add another provider abstraction or model registry.

P1 centralizes model-specific coding behavior in one coding-agent-local profile. The profile may express bounded coding preferences such as:

```ts
export interface CodingModelProfile {
  existingFileMutation: "edit" | "apply_patch";
  supportsParallelTools?: boolean;
  recommendedThinkingLevel?: ThinkingLevel;
}
```

The final fields use existing Pi types where possible. The profile:

- selects between existing compatible tools rather than creating new mutation tools;
- remains outside `packages/agent` and `packages/ai` unless a generic public contract is genuinely required;
- uses existing model identity;
- provides a safe fallback for unknown models;
- remains visible in diagnostics;
- allows manual configuration to restore the complete five-tool set;
- avoids unsupported performance or reliability claims.

### Agent runtime

The default runtime remains one adaptive primary agent.

All-For-One does not require:

- a workflow engine;
- a request-classifier model;
- planner, implementer, reviewer, or validator agents;
- an agent council;
- a permanent delegation layer;
- an additional reasoning turn before normal work begins.

Future delegation may be an optional explicit capability for genuinely independent tasks. It is not part of the approved P0-P5 core plan.

### Coding-agent session

`AgentSession` remains the coding-agent composition root for:

- active tools;
- model profile resolution;
- skill and prompt metadata;
- scoped project instructions;
- extensions;
- compaction;
- execution-integrity observation;
- session persistence;
- interactive, print, RPC, and SDK behavior.

A responsibility is extracted only when the new module has one clear purpose, a stable interface, focused tests, and lower upstream conflict risk.

## Canonical tool architecture

The built-in tool registry is frozen as:

```text
read
bash
edit
write
apply_patch
```

The complete set remains available through manual configuration for compatibility and troubleshooting.

Automatic/default tool exposure may use the P1 centralized coding-model profile:

- one of `edit` or `apply_patch` is the primary existing-file mutation tool;
- `write` remains file creation and intentional complete replacement;
- `read` remains inspection;
- `bash` remains shell, search, repository, build, test, and lint operations;
- the non-primary mutation tool may remain available as a configured fallback without being presented as an equal default choice.

Tool descriptions, errors, outputs, truncation, cancellation, and exit information reinforce these non-overlapping responsibilities.

No new default tool is added for planning, testing, linting, git, TODOs, repository maps, code review, or skills.

## Skill and workflow architecture

P2 uses Native Pi's Agent Skills support and progressive disclosure.

- Names and concise descriptions are model-visible within the existing metadata budget.
- Full skill bodies load only when relevant.
- The primary model selects relevant skills during its normal reasoning turn.
- `/skill:<name>` remains the manual override.
- `disable-model-invocation` remains supported for users or projects that require manual-only behavior.
- Duplicate handling and source precedence remain deterministic.

The approved essential skill package contains only:

- `repository-orientation`;
- `systematic-debugging`;
- `plan-complex-change`;
- `verify-before-completion`;
- `review-diff`.

All five are adaptively discoverable by default through specific, non-overlapping descriptions. Projects may make any skill manual-only through existing Native Pi metadata or resource filtering.

A workflow is a skill-guided sequence over existing tools. It is not a scheduler, state machine, or new runtime engine.

## Knowledge ownership

P3 separates project knowledge deliberately:

- `AGENTS.md` and applicable scoped instruction files: repository behavior and working rules;
- optional `CONTEXT.md`: stable shared terminology, domain constraints, and project facts not better represented in source;
- ADRs: durable architectural decisions and trade-offs;
- source and tests: executable truth;
- local memory: explicit user preferences, corrections, conventions, and tool quirks that do not belong in the repository;
- compaction: bounded active-session continuity;
- current session messages: temporary task state.

Local memory does not become an automatic semantic knowledge base. Repository architecture is not duplicated into opaque memory.

Compaction retains the information needed to continue work:

- active goal and constraints;
- decisions and rationale;
- files inspected or modified;
- unresolved blockers and risks;
- commands run and evidence observed;
- next required validation.

It does this through the existing compaction owner rather than adding another memory layer.

## Interactive UI architecture

Interactive presentation remains isolated to `packages/coding-agent/src/modes/interactive/` and reusable primitives from `packages/tui`.

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

UI/UX is the first runtime workstream in P0 because it improves daily usability without changing the agent loop.

The UI:

- uses existing session and extension events;
- adds no model calls, repository scans, or background services;
- retains terminal-owned fonts and accessibility settings;
- preserves Native Pi theme discovery and extension UI contracts;
- remains responsive at narrow, medium, and wide terminal sizes;
- keeps print, RPC, and SDK behavior free of implicit interactive state.

See [UI/UX design](ui-ux.md).

## Optional robustness boundary

P4 delivers the following outside the default core as optional packages, extensions, templates, or documentation:

- safe-mode authorization policy;
- read-only language-server code intelligence;
- external sandbox and container launch templates;
- MCP adapter configuration.

Each optional capability:

- uses Native Pi's extension and package system;
- registers no schemas while disabled;
- starts no processes while disabled;
- avoids modifying the generic agent loop;
- remains removable without session or configuration migration;
- states clearly whether it provides authorization, convenience, or actual isolation.

## Downstream maintenance boundary

P5 reviews every retained divergence against `main`, moves optional behavior out of upstream-hot files where native hooks permit, removes duplicated helpers and policy text, preserves public compatibility, and documents the justification and rollback path for each retained difference.

## Current All-For-One additions

The current `allforone` branch includes or records:

- the canonical five-tool registry;
- bounded path-scoped context and skill metadata diagnostics;
- preflighted `apply_patch` mutations with concurrent-change detection and best-effort rollback;
- opt-in repository-grounded execution-integrity observation;
- explicit bounded local memory outside the repository;
- in-memory compaction telemetry;
- offline baselines, doctor, evaluator commands, and upstream relationship checks;
- a branded interactive header and responsive session rail;
- focused branch CI and validation documentation.

These are existing capabilities to refine, not reasons to create duplicate systems.

## Prohibited duplication

Do not add another:

- provider abstraction;
- model registry;
- agent loop;
- session manager;
- context manager;
- skill loader or skill tool;
- plugin or package system;
- mutation engine;
- validation agent;
- compaction system;
- persistent or semantic memory layer;
- theme loader;
- command palette;
- workflow engine;
- tool registry;
- evaluation platform.

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

All-For-One runs with the permissions of its local process. Approval or safe-mode prompts authorize actions but do not provide filesystem or process isolation.

Strong isolation belongs in a container, virtual machine, or operating-system sandbox. Optional safe-mode extensions must not be represented as a security sandbox.
