# All-For-One implementation roadmap

## Goal

Evolve All-For-One into a lightweight, cost-conscious, high-quality Native Pi coding harness without creating a larger framework around Pi.

The target is:

```text
Native Pi adaptive primary agent
+ bounded relevant context
+ a small active tool profile
+ progressive-disclosure engineering skills
+ terminal-native UI improvements
+ optional capabilities with zero disabled-state cost
```

The project does not need more permanent subsystems. It needs clear ownership, fewer overlapping active capabilities, lazy optional behavior, focused validation, and lower upstream maintenance cost.

## Delivery order

```text
P0  Consolidate and freeze the architecture
    P0-A audit, simplify, remove duplication, and make optional behavior lazy
    P0-B deliver the UI/UX foundation as the first new product feature
P1  Make the active tool interface adaptive and unambiguous
P2  Add exactly five essential Native Pi skills
P3  Clarify knowledge ownership
P4  Consider optional robustness capabilities independently
P5  Complete release consolidation and upstream-maintenance review
```

P5 maintenance rules apply to every phase from P0 onward. There is no dedicated evaluation-platform phase.

## Global constraints

1. Create focused branches from `allforone` and target pull requests to `allforone`.
2. Never add All-For-One changes to `main` or merge `allforone` into `main`.
3. Preserve `pi`, `.pi`, `PI_*`, `@earendil-works/pi-*`, session formats, extension APIs, SDK exports, print mode, RPC behavior, and resource discovery.
4. Retain one adaptive primary-agent runtime as the normal path.
5. Add no classifier model, workflow engine, skill tool, semantic retrieval layer, permanent agent hierarchy, or hidden autonomous control plane.
6. Prefer Native Pi themes, skills, prompts, extensions, packages, settings, SDK hooks, and coding-agent-local modules before changing `packages/agent`.
7. Add no runtime dependency unless current Pi and Node capabilities cannot solve a verified requirement.
8. Disabled optional behavior adds no schema, prompt text, filesystem scan, process, watcher, model request, persistent mutation, or meaningful rendering cost.
9. Do not auto-install packages, auto-enable external tools, publish externally, or run discovered commands merely because they exist.
10. Make no quality, latency, token, cost, performance, reliability, or security claim without evidence.
11. Validate proportionally inside each change; do not build a separate evaluation product.
12. Review every final diff against `allforone` and `main` for duplicate ownership, upstream-hot edits, compatibility risk, and rollback.

## Current-state warning

The current `allforone` branch already contains substantial changes in upstream-sensitive runtime areas, including generic agent lifecycle behavior, `AgentSession`, compaction, execution integrity, validation discovery, memory, telemetry, and diagnostics.

These additions are not automatically permanent. P0 must determine what should be kept, simplified, moved behind optional boundaries, retained only for tests/diagnostics, proposed upstream, or removed.

No P1, P2, P3, or P4 implementation should start before P0-A is complete.

---

# P0 — Consolidate and freeze the architecture

## P0-A — Audit and simplify the existing divergence

### Objective

Reduce the current downstream surface before adding new product features.

### Step 1 — Produce a divergence manifest

Compare `main...allforone` and classify every meaningful runtime divergence as:

- keep in generic core;
- keep in coding-agent;
- move to an extension, package, theme, skill, setting, or SDK boundary;
- retain as tests or diagnostics only;
- remove as duplicate, speculative, or unused;
- candidate for an upstream Pi contribution.

For every retained divergence record:

- demonstrated problem;
- current owner and correct owner;
- affected files and public APIs;
- normal-session prompt, filesystem, process, allocation, and model-call cost;
- compatibility and security impact;
- focused validation;
- rollback path;
- likely upstream conflict area.

### Step 2 — Protect the generic agent boundary

Review changes in:

- `packages/agent/src/agent-loop.ts`;
- `packages/agent/src/agent.ts`;
- `packages/agent/src/types.ts`;
- associated exports and tests.

Retain only generic correctness, cancellation, lifecycle, and tool-execution behavior that is independently useful outside the coding harness.

Move or remove coding-specific:

- model-profile policy;
- project validation policy;
- repository completion enforcement;
- UI state;
- project memory or skill policy;
- workflow or orchestration behavior.

A retained generic change should be suitable for eventual upstream contribution or have a documented reason why upstream Pi cannot currently absorb it.

### Step 3 — Reduce `AgentSession` responsibility

Audit `packages/coding-agent/src/core/agent-session.ts` as a composition root.

Identify whether current responsibilities can be:

- delegated to focused existing modules;
- initialized lazily;
- represented through an extension hook;
- reduced to passive read-only state;
- removed because a skill, test, CI, or existing Pi capability already owns the requirement.

Do not split code merely to reduce file length. Extract only stable ownership boundaries that reduce coupling and upstream conflicts.

### Step 4 — Make optional behavior genuinely lazy

Verify and change as necessary:

- validation-command discovery runs only when its owning enabled feature needs it;
- local memory initializes only when `/memory`, an explicit API, or enabled memory behavior requires it;
- detailed tool-output, compaction, and execution telemetry is collected only for an enabled diagnostic or feature;
- interactive-only objects and subscriptions are absent from print, RPC, and SDK modes;
- disabled extensions register no model-visible schemas;
- disabled language servers, MCP servers, sockets, watchers, or helper processes do not start;
- optional state performs no persistent write during ordinary startup.

### Step 5 — Simplify execution integrity

The default lightweight core should record evidence rather than act as a validator agent.

Preferred passive evidence:

- files modified;
- commands run;
- exit status;
- bounded output or reference to full output;
- whether validation occurred after the latest mutation.

Audit and justify separately:

- automatic continuation attempts;
- broad validation-command discovery;
- completion enforcement;
- inferred correctness decisions;
- execution-specific runtime APIs.

Move stronger policy to an optional mode or extension when it is not required for the normal session. Preserve honest limitations: a passing command does not prove correctness, and arbitrary Bash cannot be completely classified.

### Step 6 — Audit evaluation and diagnostic machinery

Keep only what supports real development or release decisions at acceptable cost.

Keep:

- focused unit and integration tests;
- one concise All-For-One doctor command;
- prompt and schema-size diagnostics;
- clean-worktree and upstream relationship checks;
- optional ad hoc comparison scripts tied to a concrete decision.

Remove, archive, or stop expanding when unused:

- general treatment/report schemas;
- reusable context or execution evaluation engines;
- workload registries;
- evaluator-agent concepts;
- evaluation-specific runtime APIs;
- mandatory live-model comparisons.

### Step 7 — Remove speculative and unused abstractions

Search for implementations and exports with no meaningful production caller, including structured handoff or duplicate telemetry helpers.

For each:

- retain only if a current product path uses it;
- move to test/support code if it exists only for validation;
- remove it when it represents planned architecture rather than required behavior.

### Step 8 — Clarify tool inventory and profiles

Preserve the compatible inventory:

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

Preserve the full compatible coding profile:

```text
read
bash
edit
write
apply_patch
```

Do not call the five-tool coding profile the complete built-in registry. P1 will introduce smaller active profiles without deleting compatible tools.

### Step 9 — Adopt continuous maintenance gates

For every implementation PR from this point:

- compare with `main` and `allforone`;
- avoid upstream-hot edits when native hooks suffice;
- identify owner, compatibility impact, and rollback;
- remove superseded helpers and repeated policy text;
- report checks run and checks not run;
- rehearse a merge from current `main` when conflict risk is material.

### P0-A validation

Run the smallest checks justified by each cleanup, then broader checks based on risk:

1. focused tests for removed, moved, or lazily initialized behavior;
2. `npm run check` for runtime and checked configuration changes;
3. affected CLI, SDK, print, RPC, extension, and session compatibility tests;
4. startup assertions proving disabled features perform no discovery, process startup, model request, or persistent mutation;
5. `main...branch` and `allforone...branch` review;
6. upstream merge rehearsal for generic agent or session changes.

### P0-A completion criteria

- Every current runtime divergence has an owner and retain/move/remove decision.
- No speculative or unused subsystem remains publicly exported without justification.
- Optional behavior is lazy.
- Generic agent changes contain no coding-specific policy.
- Normal startup performs no optional filesystem discovery or persistent mutation.
- Evaluation tooling is proportionate and does not resemble a product platform.
- Compatible tool inventory and active profiles are documented accurately.
- The implementation is ready for new feature work without increasing current architectural debt.

## P0-B — UI/UX foundation

### Objective

Deliver the first new product feature only after P0-A consolidation is complete.

The UI remains inside Native Pi's interactive architecture and adds no model call, repository scan, background service, desktop shell, web UI, or font dependency.

### Scope

Implement only:

- `all-for-one-dark` and `all-for-one-light` using the existing theme schema;
- terminal-background-based selection only for a new installation with no saved explicit theme;
- compact welcome and working header states;
- responsive optional session rail;
- concise tool, error, cancellation, exit-status, and truncation presentation;
- a cleaner footer and status hierarchy;
- text and symbol distinctions in addition to color;
- terminal-controlled fonts with no distributed font files or required private-use glyphs.

### Session rail

Use one setting:

```ts
export type SessionRailMode = "auto" | "on" | "off";
```

Sections:

- `STATUS` — lifecycle and progress;
- `ACTIVITY` — active and recent tool outcomes;
- `CONTEXT` — active instruction resources and warnings;
- `CAPABILITIES` — actually loaded skills and enabled relevant optional tools.

The rail uses existing events only. It performs no task classification, repository scan, or model request.

### Non-goals

Do not add:

- tabs or a page router;
- another command palette;
- animation or a background loader;
- a dashboard-style permanent pane;
- more session lifecycle policy in interactive rendering code;
- implicit interactive state in print, RPC, or SDK modes.

### P0-B validation

- focused theme, header, rail, status, tool-rendering, and settings tests;
- `npm run check`;
- controlled tmux smoke states at narrow, medium, and wide sizes;
- text-only and image-capable terminals;
- dark, light, truecolor, and 256-color fallback;
- extension header, widget, overlay, footer, editor, and command compatibility;
- diff review against `main` and `allforone`.

### P0-B completion criteria

- The transcript is clearer without permanently consuming more terminal space.
- Existing explicit themes remain untouched.
- The rail is responsive and optional.
- Successful tools are concise; failures remain actionable; diagnostics remain available.
- No dependency, model call, repository scan, agent-loop change, or background service is added for presentation.

---

# P1 — Make the active tool interface adaptive and unambiguous

## Objective

Reduce normal active tool overlap while preserving Pi-compatible inventory and manual control.

## P1.1 — Add one minimal mutation profile

Create one coding-agent-local owner, for example:

```text
packages/coding-agent/src/core/coding-model-profile.ts
```

Initial contract:

```ts
export interface CodingModelProfile {
  existingFileMutation: "edit" | "apply_patch";
}

export type MutationProfile = "auto" | "edit" | "apply_patch" | "full";
```

Rules:

- `auto` initially resolves to `edit`;
- unknown models resolve to `edit`;
- no thinking-level, parallelism, retry, provider-policy, or token-budget fields;
- no provider-specific checks in `packages/agent`;
- model-specific exceptions require reproducible evidence;
- effective profile is visible in diagnostics;
- explicit configuration is never silently removed.

## P1.2 — Active profiles

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

`write` remains creation or intentional full replacement. The compatible inventory and public schemas remain unchanged.

## P1.3 — Rewrite tool contracts narrowly

Standardize descriptions and output for:

- bounded inspection;
- commands and repository operations;
- exact localized edit;
- creation/full replacement;
- structured multi-file patch;
- truncation and continuation;
- schema and precondition errors;
- cancellation;
- shell exit status and relevant stderr;
- concise path/operation summaries.

Avoid repeating the same guidance in tool descriptions and the system prompt.

## P1 validation

- profile resolution and unknown-model fallback;
- explicit `edit`, `apply_patch`, and `full` override;
- default four-tool active profile;
- complete five-tool manual compatibility;
- read-only compatibility;
- CLI and SDK allowlist/denylist behavior;
- unchanged public tool schemas;
- prompt and schema-size diagnostics;
- existing patch-safety and mutation-queue tests;
- controlled faux-provider sessions;
- comparison with `main` and `allforone`.

## P1 completion criteria

- Normal active coding tools are `read`, `bash`, `edit`, and `write`.
- Patch and full profiles remain explicit options.
- One coding-agent-local field owns mutation preference.
- Tool descriptions and outputs are concise and non-overlapping.
- No new mutation tool, model registry, provider abstraction, agent-loop branch, or evaluation platform exists.

---

# P2 — Add the essential Native Pi skill package

## Objective

Add only the procedural guidance that meaningfully improves engineering work while preserving progressive disclosure and the single-agent runtime.

## Scope

Create exactly:

```text
repository-orientation
systematic-debugging
plan-complex-change
verify-before-completion
review-diff
```

Use Native Pi skill discovery and Agent Skills format. Prefer a data-only package or existing conventional skills directory. Add no runtime, model SDK, database, vector store, workflow engine, or orchestration dependency.

## Requirements

- All five are discoverable by default through precise trigger and exclusion descriptions.
- Full bodies remain outside normal prompt context until selected.
- `/skill:<name>`, manual-only metadata, package filters, and project-local overrides remain supported.
- Simple work does not require a skill.
- Normally load one skill; compose only distinct necessary procedures.
- Do not launch subagents or force planning, TDD, review, or broad validation on trivial tasks.
- Do not copy third-party skill libraries wholesale.
- Preserve attribution and license notices for reused material.

## P2 validation

- package or directory discovery through Native Pi;
- model-visible bounded metadata;
- explicit invocation of every skill;
- manual-only and disabled filtering;
- project-local duplicate precedence;
- full body absent before invocation;
- controlled faux-provider selection for matching and non-matching tasks;
- no new tool schema or workflow runtime;
- no required skill for a trivial edit.

## P2 completion criteria

- Exactly five first-party skills exist.
- Descriptions are specific and non-overlapping.
- Skills load progressively.
- Manual control remains intact.
- The primary agent follows procedures without a fixed pipeline or extra model.

---

# P3 — Clarify knowledge ownership

## Objective

Make knowledge durable and discoverable without duplicating source, scoped instructions, compaction, or memory.

## Scope

### Optional `CONTEXT.md`

Use for stable terminology, domain facts, external-system names, and durable boundaries not better represented in code, tests, ADRs, or `AGENTS.md`.

Do not include secrets, generated inventories, transient task notes, full architecture duplication, or behavioral instructions already owned by `AGENTS.md`.

### ADR discovery

Document supported version-controlled ADR locations and naming. Read only decisions relevant to the task through existing context or the repository-orientation skill. Do not automatically inject every ADR or build an index.

### Local memory

Restrict to explicit user preferences, corrections, stable non-repository conventions, and recurring environment/tool quirks. Initialize lazily. Do not automatically extract conversations or store repository architecture, full code summaries, secrets, or transient progress.

### Compaction continuity

Retain goal, constraints, decisions, changed files, blockers, commands, observed evidence, and next validation. Do not add another persistence or retrieval layer.

## P3 validation

- focused context, memory, and compaction tests;
- lazy memory initialization;
- bounded metadata and prompt diagnostics;
- session persistence and restoration compatibility;
- no duplicate instruction injection;
- examples for `CONTEXT.md` and ADRs.

## P3 completion criteria

- Every knowledge type has one owner.
- Optional context and ADR guidance is bounded.
- Memory is explicit and lazy.
- Compaction supports continuation without becoming a knowledge base.

---

# P4 — Consider optional robustness capabilities independently

## Objective

Add optional robustness only when a demonstrated problem justifies its complexity and maintenance cost.

P4 is not a commitment to build every candidate.

## Priority order

1. external sandbox/container launch templates;
2. optional safe-mode authorization extension;
3. optional read-only code-intelligence extension;
4. documented MCP configuration or an existing maintained Pi package.

Each candidate gets its own go/no-go assessment, branch, and pull request.

## Shared requirements

- zero disabled-state prompt and process cost;
- no generic agent-loop modification;
- explicit enablement and bounded schema;
- lazy process or service startup;
- timeouts, cancellation, cleanup, and concise failure behavior;
- removal leaves base sessions compatible;
- failure cannot break the normal coding session;
- security limitations are explicit;
- approval policy is never presented as isolation.

## Capability-specific boundaries

### Sandbox templates

Remain external to the agent loop. Document workspace, network, credentials, process, and cleanup behavior. Claim platform support only where tested.

### Safe mode

Use existing extension trust and tool interception. Protect configured paths and obvious dangerous actions without pretending to parse every shell construct.

### Read-only code intelligence

Prefer project-installed language servers. Start lazily. Initially expose only bounded `diagnostics`, `definition`, and `references` operations. Do not bundle language-server ecosystems.

### MCP

Prefer documentation or a maintained Pi package. If new code is necessary, require explicit server and tool allowlists, lazy startup, provenance, timeouts, bounded schemas, and cleanup.

## P4 completion criteria

A capability ships only when its value exceeds implementation, runtime, security, and upstream-maintenance cost. Candidates may remain deferred indefinitely.

---

# P5 — Final release consolidation

## Objective

Perform a final release-oriented review of the maintenance rules already enforced throughout P0-P4.

## Work

- compare current `main...allforone`;
- remove obsolete changes and compatibility shims;
- move remaining optional behavior out of upstream-hot files where native hooks suffice;
- remove repeated tool lists, profile rules, skill policies, diagnostics, and stale historical guidance;
- verify package exports, CLI flags, settings, extension APIs, SDK, RPC, print mode, sessions, and discovery;
- document every retained divergence with purpose, owner, evidence, compatibility, security, rollback, and conflict risk;
- rehearse merging current `main` into a disposable focused branch or worktree;
- ensure no generated or package metadata drift.

## P5 completion criteria

- Upstream-hot changes are minimized and justified.
- Public Pi-compatible behavior remains stable.
- Duplicate helpers and policy text are removed.
- Every retained divergence has an owner, evidence, and rollback.
- Upstream merge rehearsal is documented.

---

# Validation and CI policy

There is no dedicated evaluation-platform phase.

Use risk-based validation:

### Documentation-only changes

- Markdown and link consistency;
- architecture/roadmap terminology consistency;
- upstream relationship where relevant;
- no package build unless generated or checked assets are affected.

### Normal runtime pull requests

- Linux install/build/check;
- affected focused tests;
- clean-worktree assertion;
- compatibility checks for touched surfaces.

### Platform-sensitive pull requests

- focused Windows, macOS, and Linux matrix only for path, shell, process, permissions, line-ending, symlink, or terminal-sensitive behavior.

### Integration and release

- complete build and tests;
- full platform matrix;
- packaging/install smoke tests;
- upstream merge rehearsal;
- generated-file and clean-worktree checks.

Avoid running the full test suite and repeating the same focused tests on every documentation or isolated change.

# Pull request strategy

Use focused pull requests:

1. P0-A divergence audit and consolidation, split further when changes are independently reviewable.
2. P0-B UI/UX foundation.
3. P1 mutation profile and tool-interface refinement.
4. P2 five-skill package.
5. P3 knowledge ownership and lazy memory/context refinements.
6. One PR for each approved P4 capability.
7. P5 release consolidation.

Do not combine unrelated cleanup, UI, tool-profile, skill, context, and optional-capability changes into one implementation pull request.