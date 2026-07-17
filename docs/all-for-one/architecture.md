# All-For-One architecture

## Purpose

All-For-One is a lightweight downstream hardening and usability layer over Native Pi. It preserves Pi's adaptive single-agent architecture, package boundaries, compatibility identifiers, sessions, extension APIs, SDK, print mode, and RPC behavior while retaining only changes that solve a demonstrated problem with acceptable complexity and upstream cost.

The branch relationship is:

```text
upstream Pi -> main -> allforone -> focused branches
```

`main` is the clean local mirror of upstream Pi. `allforone` is the All-For-One integration branch. Focused branches start from and return to `allforone`.

## Product objective

Improve the primary coding agent before adding orchestration.

The preferred path remains:

```text
User
  -> Interactive, print, RPC, or SDK entry point
  -> Coding-agent session composition
  -> Relevant bounded context, skills, and active tools
  -> Native Pi agent runtime
  -> Provider/model abstraction
  -> Tool execution and repository feedback
  -> Focused validation when required
  -> Result
```

All-For-One must not surround this path with a permanent planner, reviewer, validator, classifier, workflow engine, or agent hierarchy.

## P0 architecture freeze

P0 begins with consolidation, not feature growth.

Before new runtime behavior is approved, every existing All-For-One divergence from `main` must be classified as one of:

- keep in generic core;
- keep in coding-agent;
- move behind an existing extension, package, theme, skill, settings, or SDK boundary;
- retain as diagnostics or tests only;
- remove as duplicate, speculative, or unused;
- propose upstream when it is generic and independently valuable.

The classification records the demonstrated problem, owner, public surface, files touched, normal-session cost, validation, rollback path, and likely upstream-conflict area.

### Non-negotiable rules

1. A new package or `packages/agent` change is permitted only when existing Pi public boundaries cannot satisfy the verified requirement cleanly.
2. Optional behavior is lazy and has no model-visible schema, filesystem discovery, background process, model request, persistent mutation, or meaningful rendering cost while disabled.
3. Existing Pi-compatible identifiers and interfaces remain stable unless a separate migration is explicitly designed and validated.
4. UI/UX is the first new product implementation after consolidation; it remains inside the interactive coding-agent boundary.
5. Validation belongs to the change that introduces or removes behavior. There is no dedicated evaluation platform.
6. Downstream-maintenance review applies to every phase and pull request, not only P5.
7. Current code is not automatically retained merely because it already exists on `allforone`.

## Package and subsystem ownership

| Owner | Responsibility |
|---|---|
| `packages/ai` | Provider APIs, model metadata, streaming, usage and cost fields, and inference abstraction |
| `packages/agent` | Generic agent state, message flow, tool calling, retries, cancellation, and execution loop |
| `packages/tui` | Reusable terminal rendering and input primitives |
| `packages/coding-agent` | Coding CLI, session composition, coding tools, project context, skills, extensions, settings, compaction composition, interactive mode, print mode, RPC mode, and SDK integration |
| Native Pi skills | Progressive-disclosure procedures followed by the same primary agent |
| Native Pi extensions and packages | Optional tools, integrations, policies, themes, and specialized capabilities |
| Version-controlled project docs | Stable terminology, architecture decisions, requirements, and operational guidance |

Behavior belongs in the narrowest correct owner. No subsystem creates a second owner for an existing responsibility.

## Runtime boundaries

### Provider and model abstraction

Native Pi's provider and model contracts remain authoritative. All-For-One does not add another provider abstraction or model registry.

P1 may add one coding-agent-local mutation preference:

```ts
export interface CodingModelProfile {
  existingFileMutation: "edit" | "apply_patch";
}
```

The initial profile contains no thinking-level, parallelism, provider-policy, or token-budget fields. Those concerns remain with existing Pi model and agent configuration unless a separately verified need justifies a new field.

The profile:

- consumes existing resolved model identity;
- stays outside `packages/agent` and `packages/ai`;
- selects between existing compatible tools rather than creating a mutation tool;
- defaults unknown and unprofiled models to `edit` initially;
- allows explicit `edit`, `apply_patch`, or full-profile override;
- is visible in diagnostics;
- gains model-specific entries only from reproducible evidence.

### Generic agent runtime

The default runtime remains one adaptive primary agent.

Generic correctness fixes may belong in `packages/agent`, but coding-specific policy does not. The generic layer must not acquire:

- model-name branches for coding behavior;
- project validation-command discovery;
- repository-specific completion policy;
- UI presentation state;
- skills or project-memory policy;
- permanent orchestration roles.

### Coding-agent composition

`AgentSession` remains the composition root, not the permanent implementation owner for every concern.

It may coordinate active tools, model selection, context, skills, extensions, compaction, persistence, and mode-specific behavior. New responsibilities should instead live in focused modules when they have a clear owner and stable interface.

During P0, audit whether current execution-integrity, validation discovery, memory, telemetry, handoff, and compaction additions are:

- required in the normal session path;
- lazy or currently eager;
- duplicated by skills, tests, CI, or existing Pi behavior;
- better expressed as passive evidence, an optional extension, or diagnostics-only code.

## Tool architecture

### Compatible inventory

The compatible built-in inventory includes the existing Pi tool identifiers:

```text
read
bash
edit
write
grep
find
ls
apply_patch
```

Preserving this inventory protects CLI, SDK, extension, allowlist, denylist, and read-only-profile compatibility.

### Coding profiles

The full compatible coding profile is:

```text
read
bash
edit
write
apply_patch
```

P1 introduces smaller active profiles without deleting the compatible inventory:

```text
Default edit profile:
read + bash + edit + write

Patch profile:
read + bash + apply_patch + write

Full compatibility profile:
read + bash + edit + write + apply_patch

Read-only profile:
read + grep + find + ls
```

The initial automatic fallback is the edit profile. `apply_patch` remains available through the patch or full profile and may become a model-specific preference only after reproducible evidence.

### Tool contracts

- `read`: bounded file inspection with continuation guidance;
- `bash`: shell commands, search, repository operations, build, test, and lint;
- `edit`: exact localized replacement in one existing file;
- `write`: file creation or intentional complete replacement;
- `apply_patch`: coherent structured multi-hunk or multi-file mutation;
- `grep`, `find`, and `ls`: compatible read-only utilities where that profile is selected.

Tool descriptions, errors, truncation, cancellation, exit information, and source metadata reinforce these boundaries. No new default tool is added for planning, testing, linting, git, TODOs, repository maps, review, skills, or validation.

## Cost and laziness boundary

Disabled or unused optional behavior must mean:

```text
no prompt tokens
no filesystem scan
no background process or watcher
no additional model request
no persistent state mutation
minimal object allocation
```

P0 specifically verifies that:

- validation-command discovery does not run when its owning feature is off;
- local memory storage initializes only when memory is used or explicitly requested;
- detailed telemetry is collected only when required by an enabled diagnostic or feature;
- interactive-only state is absent from print, RPC, and SDK modes;
- optional extensions register no schemas and start no services while disabled;
- language servers, MCP servers, sockets, watchers, and helper processes start lazily and clean up on shutdown.

## Execution and validation evidence

The lightweight core should record facts, not act as a second validator agent.

The preferred passive evidence surface is:

- files modified;
- commands run;
- exit status;
- relevant bounded output or a reference to full output;
- whether validation occurred after the latest mutation.

Automatic completion enforcement, broad command-discovery policy, or continuation loops require separate justification and should become optional if they are retained. A passing command does not prove task correctness.

The `verify-before-completion` skill guides the primary agent to run proportionate checks. The harness records observed evidence and prevents unsupported success claims; it does not invent correctness.

## Skill and workflow architecture

P2 uses Native Pi's Agent Skills support and progressive disclosure.

The approved package contains only:

- `repository-orientation`;
- `systematic-debugging`;
- `plan-complex-change`;
- `verify-before-completion`;
- `review-diff`.

Names and concise trigger descriptions are model-visible within the existing metadata budget. Full bodies load only after selection. `/skill:<name>`, manual-only metadata, package filters, and project-local precedence remain available.

A workflow is a procedure described by a skill and followed by the same primary agent. It is not a scheduler, persisted graph, subagent team, or second planning runtime.

## Knowledge ownership

- `AGENTS.md` and scoped instruction files: repository behavior and working rules;
- optional `CONTEXT.md`: stable terminology, domain facts, and durable boundaries not better represented elsewhere;
- ADRs: architectural decisions and trade-offs;
- source and tests: executable truth;
- local memory: explicit user preferences, corrections, conventions, and environment/tool quirks;
- compaction: bounded current-session continuity;
- current session messages: transient task state.

Do not duplicate repository architecture into local memory. Do not automatically inject every ADR. Do not add embeddings or semantic retrieval.

Compaction should preserve the active goal, constraints, decisions, changed files, blockers, commands, observed evidence, and next validation without becoming another knowledge base. Existing structural repair should not create repeated model calls beyond a tightly bounded fallback.

## Interactive UI architecture

Interactive presentation remains isolated to `packages/coding-agent/src/modes/interactive/` and reusable primitives from `packages/tui`.

After P0 consolidation, the first new product feature is the UI/UX foundation:

```text
Welcome or compact header
Transcript and tool activity
Transient status
Editor and autocomplete
Footer
Optional responsive session rail
Extension widgets and overlays
```

The UI uses existing events, adds no model request or repository scan, distributes no font files, preserves extension UI contracts, remains responsive, and introduces no implicit state into print, RPC, or SDK modes.

See [UI/UX design](ui-ux.md).

## Optional robustness boundary

P4 considers capabilities independently rather than assuming all must be built:

1. external sandbox/container templates;
2. optional safe-mode authorization extension;
3. optional read-only code-intelligence extension;
4. documented MCP configuration or a maintained existing Pi package.

Every optional capability must have zero disabled-state prompt and process cost, fail without breaking the base session, expose bounded schemas and output, clean up resources, and state clearly whether it provides convenience, authorization, or actual isolation.

## Evaluation boundary

Focused validation is required; an evaluation platform is not.

Keep:

- unit and integration tests;
- controlled faux-provider tests where deterministic model interaction matters;
- concise doctor and prompt/schema-size diagnostics;
- upstream relationship checks;
- optional ad hoc comparison scripts tied to a concrete decision.

Do not grow:

- a permanent workload registry;
- treatment and report infrastructure unrelated to release gates;
- an evaluator agent;
- a database or dashboard;
- mandatory live-model comparisons;
- evaluation-specific runtime APIs.

Existing evaluator and baseline machinery must be audited in P0 and retained only when it supports a real release or architecture decision at acceptable maintenance cost.

## Continuous downstream maintenance

Every pull request must:

- compare its diff with `allforone` and `main`;
- avoid upstream-hot files when native hooks suffice;
- identify ownership, compatibility impact, and rollback;
- remove superseded helpers and repeated policy text;
- preserve public Pi-compatible behavior;
- state checks run and checks not run;
- rehearse an upstream merge when conflict risk is material.

P5 is the final release consolidation pass, not the first time these rules apply.

## Prohibited duplication

Do not add another:

- provider abstraction or model registry;
- generic agent loop;
- session manager;
- context manager;
- skill loader or skill tool;
- extension or package system;
- mutation engine;
- validation or review agent;
- compaction system;
- persistent or semantic memory layer;
- theme loader;
- workflow engine;
- tool registry;
- evaluation platform.

Extend, simplify, or compose the existing Native Pi owner instead.

## Compatibility contract

All-For-One preserves unless a separate intentional migration is designed and tested:

- the `pi` CLI and `.pi` configuration;
- `PI_*` environment variables;
- `@earendil-works/pi-*` package identities;
- session formats;
- extension events and APIs;
- SDK exports;
- RPC and print behavior;
- package, skill, prompt, theme, and tool discovery;
- explicit tool allowlists, denylists, and custom runtime configuration.

User-facing branding uses All-For-One. Technical identifiers remain Pi-compatible.

## Security boundary

All-For-One runs with the permissions of its local process. Approval or safe-mode prompts authorize actions but do not provide filesystem or process isolation.

Strong isolation belongs in a container, virtual machine, or operating-system sandbox. Optional policy extensions must not be represented as security isolation.