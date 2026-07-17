# All-For-One implementation roadmap

## Goal

Evolve All-For-One into a lightweight, cost-conscious, high-quality Native Pi coding harness without creating a larger framework around Pi.

The target path is:

```text
User
-> one adaptive primary agent
-> bounded relevant context
-> a small active tool profile
-> only necessary progressive-disclosure skills
-> focused verification and passive evidence
-> result
```

Stable architecture rules live in [architecture.md](architecture.md). P1 and P2 behavior lives in [adaptive-capabilities.md](adaptive-capabilities.md). Interactive presentation lives in [ui-ux.md](ui-ux.md). This document owns delivery order, implementation scope, and completion gates.

## Delivery order

```text
P0  Consolidate and freeze the architecture
    P0-A audit, simplify, remove duplication, and make optional behavior lazy
    P0-B deliver the terminal UI/UX foundation as the first new product feature
P1  Make the active tool interface adaptive and unambiguous
P2  Add exactly five essential Native Pi skills
P3  Clarify knowledge ownership
P4  Consider optional robustness capabilities independently
P5  Complete release consolidation and upstream-maintenance review
```

P1-P4 implementation does not begin until P0-A is complete. P5 maintenance rules apply continuously from P0 onward.

## Global gates

Every implementation pull request must:

1. start from and target `allforone`;
2. preserve Pi-compatible identifiers and public behavior unless a separate migration is designed and tested;
3. prefer Pi skills, extensions, themes, prompts, settings, packages, SDK hooks, and coding-agent-local modules before `packages/agent` changes;
4. add no classifier model, workflow engine, skill tool, semantic retrieval layer, permanent agent hierarchy, or evaluation platform;
5. add no dependency or package without a demonstrated requirement;
6. keep disabled optional behavior free of schemas, discovery, processes, model requests, and persistent mutation;
7. compare the final diff with both `allforone` and `main`;
8. document ownership, compatibility impact, validation, rollback, and upstream-conflict risk;
9. make no quality, latency, token, cost, reliability, performance, or security claim without evidence.

## Current-state warning

`allforone` already contains substantial runtime divergence in generic agent lifecycle behavior, `AgentSession`, compaction, execution integrity, validation discovery, memory, telemetry, and diagnostics.

Existing code is not automatically retained. P0-A decides what is kept, moved, made lazy, retained only for diagnostics/tests, proposed upstream, or removed.

---

# P0 — Consolidate and freeze the architecture

## P0-A — Audit and simplify current divergence

### Deliverable 1 — Divergence manifest

Compare `main...allforone` and classify every meaningful runtime divergence as:

- keep in generic core;
- keep in coding-agent;
- move behind an existing Pi boundary;
- retain as diagnostics or tests only;
- remove;
- candidate for upstream contribution.

Each retained item records:

- demonstrated problem;
- authoritative owner;
- files and public surfaces;
- normal-session prompt, filesystem, process, allocation, and model-call cost;
- compatibility and security impact;
- validation and rollback;
- likely upstream conflict area.

### Deliverable 2 — Generic agent boundary review

Inspect `packages/agent` changes and retain only behavior that is generic outside a coding harness.

Move or remove coding-specific model policy, repository validation policy, completion enforcement, project context/memory policy, UI state, and orchestration concepts.

### Deliverable 3 — `AgentSession` responsibility review

Treat `AgentSession` as a composition root, not the permanent owner of every feature.

Audit execution integrity, validation discovery, memory, tool-output telemetry, compaction telemetry, handoff utilities, and interactive diagnostics for:

- duplicated ownership;
- eager work during startup;
- better extension or module boundaries;
- passive evidence instead of policy;
- unused or speculative exports.

Extract only stable boundaries that reduce coupling and upstream conflict. Do not split code merely to reduce file length.

### Deliverable 4 — Lazy optional behavior

Verify that disabled or unused optional behavior performs:

```text
no prompt injection
no filesystem discovery
no background process or watcher
no extra model request
no persistent mutation
minimal object allocation
```

At minimum:

- validation discovery is conditional;
- local memory initializes on explicit use;
- detailed telemetry is conditional;
- interactive-only state is absent from print, RPC, and SDK modes;
- disabled extensions register no schemas;
- optional services start lazily and clean up.

### Deliverable 5 — Lightweight execution evidence

Prefer passive evidence in the normal core:

- modified files;
- commands run;
- exit status;
- bounded output or full-output reference;
- whether validation followed the latest mutation.

Audit automatic continuation, broad validation discovery, completion enforcement, and inferred correctness. Retain stronger policy only when separately justified, preferably behind an optional mode or extension.

### Deliverable 6 — Diagnostic and evaluation cleanup

Keep focused tests, a concise doctor command, prompt/schema-size reporting, clean-worktree checks, upstream relationship checks, and decision-specific comparison scripts.

Remove, archive, or stop expanding unused workload registries, treatment/report frameworks, general evaluation engines, evaluator-agent concepts, evaluation-specific runtime APIs, and mandatory live-model comparisons.

### Deliverable 7 — Tool terminology correction

Document accurately:

- compatible inventory: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, `apply_patch`;
- full coding profile: `read`, `bash`, `edit`, `write`, `apply_patch`;
- read-only profile: `read`, `grep`, `find`, `ls`.

P1 introduces smaller normal active profiles without deleting compatible tools.

### Validation

Use focused tests for every moved, removed, or lazy subsystem, followed by broader checks according to risk.

Required evidence includes:

- no optional startup discovery or persistent mutation;
- affected CLI, SDK, print, RPC, extension, session, and platform compatibility;
- `npm run check` for runtime or checked configuration changes;
- `main...branch` and `allforone...branch` diff review;
- upstream merge rehearsal for material generic-agent or session changes.

### Completion gate

P0-A is complete when:

- every current runtime divergence has an owner and disposition;
- no speculative or unused public abstraction remains without justification;
- optional behavior is lazy;
- generic agent code contains no coding-specific policy;
- evaluator machinery is proportionate rather than a product subsystem;
- compatible inventory and active profiles are documented correctly;
- the project can accept new feature work without increasing existing architecture debt.

## P0-B — UI/UX foundation

Implement the approved design in [ui-ux.md](ui-ux.md) after P0-A.

### Scope

- two native-schema All-For-One themes;
- compact welcome and working header states;
- responsive optional session rail;
- concise tool, error, cancellation, exit-status, and truncation presentation;
- cleaner footer and status hierarchy;
- terminal-owned fonts and accessible text/symbol fallbacks.

### Boundaries

- no model request, repository scan, background service, desktop shell, web UI, font file, TUI framework, tabs, page router, or second command palette;
- no implicit interactive state in print, RPC, or SDK modes;
- no new generic agent-loop behavior.

### Validation

- focused component, theme, settings, and lifecycle tests;
- `npm run check`;
- controlled tmux states at narrow, medium, and wide sizes;
- text-only, image-capable, dark, light, truecolor, and 256-color paths;
- extension header, widget, overlay, footer, editor, and command compatibility;
- diff review against `main` and `allforone`.

### Completion gate

The transcript is clearer without permanent extra space or runtime cost, explicit themes remain untouched, the rail is optional and responsive, and non-interactive modes remain unaffected.

---

# P1 — Adaptive and unambiguous active tools

Implement the design in [adaptive-capabilities.md](adaptive-capabilities.md).

## Scope

Add one coding-agent-local mutation preference:

```ts
export interface CodingModelProfile {
  existingFileMutation: "edit" | "apply_patch";
}

export type MutationProfile = "auto" | "edit" | "apply_patch" | "full";
```

Initial profiles:

```text
edit:        read + bash + edit + write
apply_patch: read + bash + apply_patch + write
full:        read + bash + edit + write + apply_patch
read-only:   read + grep + find + ls
```

`auto` and unknown models initially resolve to `edit`. Model-specific exceptions require reproducible evidence.

Rewrite tool descriptions and output only as necessary to enforce clear responsibilities, bounded output, continuation, actionable errors, cancellation, exit status, and concise path summaries.

## Validation

- profile resolution and unknown fallback;
- explicit edit, patch, and full overrides;
- default four-tool profile;
- full coding and read-only compatibility;
- unchanged public schemas;
- CLI, SDK, allowlist, denylist, and extension behavior;
- prompt/schema-size diagnostics;
- existing patch and mutation safety tests;
- controlled faux-provider sessions.

## Completion gate

Normal coding exposes `read`, `bash`, `edit`, and `write`; patch and full profiles remain explicit; one field owns mutation preference; no provider abstraction, agent-loop branch, or new mutation tool is introduced.

---

# P2 — Essential Native Pi skills

## Scope

Add exactly:

```text
repository-orientation
systematic-debugging
plan-complex-change
verify-before-completion
review-diff
```

Use Native Pi skill discovery and Agent Skills format. Prefer a data-only package or conventional skills directory with no runtime, model SDK, database, vector store, workflow, or orchestration dependency.

## Requirements

- precise trigger and exclusion descriptions;
- full bodies outside normal prompt context until selected;
- manual invocation and manual-only policy preserved;
- project-local precedence and resource filtering preserved;
- no subagents or fixed pipeline;
- no forced planning, TDD, review, or broad validation for trivial work;
- no wholesale copying of third-party skill libraries.

## Validation

- discovery and metadata budget;
- explicit invocation of every skill;
- manual-only, disabled, and duplicate precedence behavior;
- body absent before invocation;
- controlled matching and non-matching faux-provider tasks;
- no new tool schema or workflow runtime;
- trivial tasks remain direct.

## Completion gate

Exactly five concise progressive-disclosure skills exist and the same primary agent follows them only when relevant.

---

# P3 — Knowledge ownership

## Scope

- optional `CONTEXT.md` for stable terminology and domain facts;
- version-controlled ADR conventions and bounded discovery;
- explicit, lazy local memory for preferences, corrections, and environment/tool quirks;
- existing scoped context and compaction for current work.

Do not automatically inject every ADR, extract every conversation, store repository architecture in local memory, add embeddings, or create another context manager.

## Validation

- focused context, memory, compaction, persistence, and restoration tests;
- lazy memory initialization;
- bounded metadata and prompt diagnostics;
- no duplicate instruction injection;
- examples for `CONTEXT.md` and ADRs.

## Completion gate

Every knowledge type has one owner; memory remains explicit and lazy; compaction supports continuation without becoming a knowledge base.

---

# P4 — Optional robustness decisions

P4 is not a commitment to build every candidate. Evaluate independently in this order:

1. external sandbox/container templates;
2. optional safe-mode authorization extension;
3. optional read-only code intelligence;
4. documented MCP configuration or a maintained existing Pi package.

Each candidate receives a separate go/no-go assessment and pull request.

Shared gate:

- demonstrated value exceeds implementation, runtime, security, and upstream-maintenance cost;
- zero disabled-state prompt and process cost;
- explicit enablement, bounded schema/output, timeout, cancellation, and cleanup;
- no generic agent-loop modification;
- failure does not break the base session;
- authorization is not described as isolation.

Candidates may remain deferred indefinitely.

---

# P5 — Final release consolidation

Perform the final release review of rules already enforced throughout P0-P4:

- compare current `main...allforone`;
- remove obsolete changes and compatibility shims;
- move remaining optional behavior out of upstream-hot files where native hooks suffice;
- remove repeated tool lists, profile rules, skill policies, diagnostics, and stale historical guidance;
- verify package exports, CLI flags, settings, extension APIs, SDK, RPC, print mode, sessions, and resource discovery;
- document every retained divergence with purpose, owner, evidence, compatibility, security, rollback, and conflict risk;
- rehearse merging current `main` into a disposable focused branch or worktree;
- verify generated and package metadata consistency.

P5 is complete when public compatibility is stable, upstream-hot changes are minimized and justified, duplicate policy and helpers are removed, and merge rehearsal is recorded.

---

# Validation and CI policy

There is no dedicated evaluation-platform phase.

Use risk-based CI:

### Documentation-only

- Markdown/link and terminology consistency;
- upstream relationship when relevant;
- no package build unless checked/generated assets are affected.

### Normal runtime

- Linux install/build/check;
- affected focused tests;
- clean-worktree assertion;
- compatibility checks for touched surfaces.

### Platform-sensitive

Run focused Windows, macOS, and Linux jobs only for path, shell, process, permissions, line-ending, symlink, or terminal-sensitive behavior.

### Integration and release

- complete build and tests;
- full platform matrix;
- packaging/install smoke tests;
- upstream merge rehearsal;
- generated-file and clean-worktree checks.

Avoid running a full suite and then repeating the same focused tests for documentation or isolated changes.

# Pull request strategy

1. P0-A divergence audit and consolidation, split into independently reviewable cleanup PRs.
2. P0-B UI/UX foundation.
3. P1 mutation profile and tool-interface refinement.
4. P2 five-skill package.
5. P3 knowledge ownership and lazy memory/context refinements.
6. One PR for each approved P4 capability.
7. P5 release consolidation.

Do not combine unrelated cleanup, UI, tool, skill, context, or optional-capability changes.