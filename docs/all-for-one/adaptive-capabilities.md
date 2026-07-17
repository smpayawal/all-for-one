# Adaptive capabilities

## Purpose

Make All-For-One expose the smallest useful capability set for the current coding task without adding a request-classifier model, workflow engine, skill tool, hidden router, permanent subagent hierarchy, or extra reasoning turn.

The primary model remains the semantic selector. The harness provides clear tool profiles, bounded skill metadata, deterministic availability rules, and explicit manual control.

## Design principles

### One primary agent

The primary model already receives the request, project instructions, session state, tool definitions, and skill descriptions. A separate classifier would duplicate reasoning while adding latency, token cost, coordination risk, and a new failure mode.

### Minimum sufficient capability

Use the least complex path that can complete the task safely:

1. answer directly when tools are unnecessary;
2. use the smallest active tool profile;
3. load one clearly matching skill when procedural guidance materially helps;
4. combine skills only when responsibilities are distinct;
5. use an optional extension only when explicitly enabled and relevant;
6. stop when the task's evidence requirement is satisfied.

### Progressive disclosure

Keep only concise names and trigger descriptions in normal context. Load full skill bodies and references only after selection. Optional tool schemas appear only when their extension is enabled.

### Manual control remains authoritative

Users, projects, CLI callers, and SDK callers retain control through:

- active-tool configuration, allowlists, and denylists;
- mutation-profile override;
- `/skill:<name>`;
- `disable-model-invocation`;
- `--no-skills` and explicit skill paths;
- package and resource filters;
- extension enable/disable settings;
- project instructions.

Explicit configuration wins unless it violates an existing trust or safety boundary or names an unavailable capability.

## Tool inventory and active profiles

### Compatible inventory

The compatible built-in inventory remains:

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

This inventory protects existing Pi CLI, SDK, extension, read-only, allowlist, denylist, and custom-runtime behavior. It is not the same as the normal active coding profile.

### Supported coding profiles

```text
edit profile:
read + bash + edit + write

patch profile:
read + bash + apply_patch + write

full profile:
read + bash + edit + write + apply_patch

read-only profile:
read + grep + find + ls
```

The recommended initial normal profile is the edit profile. The patch profile is available when structured multi-file mutation is preferred. The full profile remains an explicit compatibility and troubleshooting option.

### Tool responsibilities

| Tool | Primary responsibility | Exclusion |
|---|---|---|
| `read` | Bounded text or image inspection with continuation guidance | Do not use when a shell operation or mutation is required |
| `bash` | Shell commands, search, repository operations, builds, tests, and lint | Prefer a dedicated file tool for mutations it expresses more safely |
| `edit` | Exact localized replacement in one existing file | Do not create files, replace whole files, or coordinate multi-file patches |
| `write` | Create a file or intentionally replace its complete contents | Do not use when a localized edit is sufficient |
| `apply_patch` | Coherent structured multi-hunk or multi-file mutation | Do not use for a single simple exact replacement |
| `grep`, `find`, `ls` | Compatible read-only discovery utilities | Not part of the recommended normal coding profile |

Tool descriptions must remain correct when any compatible profile is selected.

## P1 — Minimal coding-model profile

### Owner

Create one coding-agent-local module, for example:

```text
packages/coding-agent/src/core/coding-model-profile.ts
```

It consumes existing resolved Pi model identity and does not create another model registry.

### Initial contract

```ts
export interface CodingModelProfile {
  existingFileMutation: "edit" | "apply_patch";
}
```

No thinking-level, parallelism, retry, provider-policy, context-window, or token-budget field is included initially. Those concerns already have owners and require separate evidence before being added.

### Resolution rules

- `auto` resolves to `edit` initially.
- Unknown or unprofiled models resolve to `edit`.
- Explicit configuration may select `edit`, `apply_patch`, or the full profile.
- Explicitly configured tools are not silently removed.
- The effective profile is visible through `/context` or equivalent diagnostics.
- Model-specific exceptions require a reproducible failure or controlled comparison.
- No profile is described as faster, cheaper, or more accurate without evidence.
- No provider-specific branch is added to `packages/agent`.

A minimal settings-facing shape may be:

```ts
export type MutationProfile = "auto" | "edit" | "apply_patch" | "full";
```

The public tool names and schemas remain unchanged.

## Tool-interface quality standard

Every active built-in tool should provide:

- a concise single responsibility;
- bounded output;
- explicit truncation and continuation guidance;
- actionable schema and precondition errors;
- consistent cancellation behavior;
- shell exit status and relevant stderr where available;
- concise changed-path or operation summaries;
- deterministic source and active-state diagnostics;
- no repeated policy text in both tool descriptions and the system prompt.

The harness may enforce deterministic eligibility, schema, workspace, trust, and scoped-instruction rules. It must not use expanding keyword or regular-expression routing to infer which tool or skill the user intended.

## P2 — Essential Native Pi skill package

Implement exactly:

1. `repository-orientation`
2. `systematic-debugging`
3. `plan-complex-change`
4. `verify-before-completion`
5. `review-diff`

Use Native Pi's existing skill loader and Agent Skills format. Do not add a `skill` tool, universal router skill, workflow runtime, scheduler, agent team, or mandatory pipeline.

### Trigger contract

| Skill | Automatic trigger | Important exclusions |
|---|---|---|
| `repository-orientation` | Unfamiliar repository, broad architecture task, cross-package change, or execution-path tracing | Trivial isolated edit with sufficient context |
| `systematic-debugging` | Failing test, crash, regression, unexpected behavior, or performance fault | New feature design without a failure to diagnose |
| `plan-complex-change` | Multi-module feature, migration, architecture change, compatibility-sensitive refactor, or staged implementation | Small obvious edit |
| `verify-before-completion` | Before claiming implemented work is fixed, passing, secure, compatible, or complete | Pure explanation or planning with no implementation claim |
| `review-diff` | Requested review, broad or high-risk mutation, or final scope/regression inspection | Read-only explanation without a change set |

Each description states what the skill does, when it should trigger, and when it should not trigger. Avoid universal language that causes every task to load the skill.

### Skill-body rules

- Keep each `SKILL.md` concise and procedural.
- Put detailed references one level below only when necessary.
- Include helper scripts only for repeated deterministic operations.
- Do not repeat the base prompt, repository instructions, or another skill.
- Do not require one skill to understand another.
- Do not launch subagents.
- Do not force planning, TDD, review, or broad validation on trivial work.
- Stop once sufficient evidence exists.

### Composition

Skills may compose when responsibilities are distinct, for example:

```text
repository-orientation -> plan-complex-change
systematic-debugging -> verify-before-completion
plan-complex-change -> review-diff
```

This is not a fixed pipeline. Normally one skill is sufficient.

### Precedence and manual override

Retain current deterministic precedence:

1. explicit temporary invocation;
2. project-local skill;
3. user-global skill;
4. package-provided skill;
5. remaining sources.

Lower-priority duplicates are omitted and reported. Skill bodies are never merged automatically. `/skill:<name>`, manual-only metadata, package filters, and `--no-skills` remain supported.

## Workflow interpretation

A workflow is a procedure described by a skill and executed by the same primary agent using existing tools.

It is not:

- a persisted graph;
- a scheduler;
- a second task planner;
- an agent team;
- a mandatory sequence for every request.

The primary model may follow a skill procedure automatically when the description matches, all steps are necessary, no extra model is required, existing approval boundaries are respected, and the workflow can stop as soon as evidence is sufficient.

## Knowledge-aware selection

Adaptive selection may use active project instructions, optional `CONTEXT.md`, relevant ADR references, current session state, and bounded skill descriptions.

It must not add embeddings, semantic retrieval, automatic memory extraction, repository-wide summaries, or another context manager.

Knowledge ownership remains:

- scoped project instructions for behavior;
- `CONTEXT.md` for stable terminology and domain facts;
- ADRs for architectural decisions;
- source and tests for executable truth;
- explicit local memory for preferences, corrections, and tool/environment quirks;
- compaction for active-session continuity.

## Optional capability activation

Optional capabilities remain outside the default profile:

- safe-mode policy extension;
- read-only code intelligence;
- external sandbox or container launch templates;
- explicit MCP configuration.

Rules:

- never auto-install a package;
- never expose every installed external tool by default;
- register schemas only when enabled;
- start language servers, MCP servers, sockets, watchers, or helpers only when invoked;
- dispose session-owned resources on shutdown;
- keep schemas, descriptions, timeouts, and output bounded;
- fail without breaking the base coding session;
- add no disabled-state prompt or process cost.

## Passive evidence, not a validator agent

The default core may record:

- modified files;
- commands run;
- exit status;
- bounded output or a full-output reference;
- whether the evidence followed the latest mutation.

The `verify-before-completion` skill decides which focused checks are appropriate. The harness does not claim that a passing command proves correctness and should not automatically continue the agent merely to satisfy a broad validation policy unless an explicit optional mode is enabled.

## Observable state

Diagnostics may report:

```ts
interface ActiveCapabilityState {
  mutationProfile: "edit" | "apply_patch" | "full";
  activeTools: readonly string[];
  loadedSkills: readonly string[];
  explicitSkills: readonly string[];
  enabledOptionalTools: readonly string[];
}
```

Requirements:

- report actual active or invoked capabilities, not inferred task labels;
- reuse existing diagnostics and events;
- do not create another telemetry store;
- keep interactive summaries concise and `/context` detailed;
- persist no hidden classification.

## Failure and fallback

- Invalid or unavailable skill content produces a bounded diagnostic and normal-model fallback.
- Ambiguous skill descriptions should result in no speculative skill load rather than several loads.
- Unknown models use the edit profile.
- If the active mutation tool cannot express the operation, the model may use an explicitly available fallback or explain the required profile change.
- Disabled optional capabilities are not represented as available.
- Optional-service failure cannot terminate the base coding session unless the user explicitly made that service required.

## Validation strategy

There is no dedicated evaluation platform.

Validate each change through the smallest decisive evidence:

- focused unit and integration tests;
- controlled faux-provider sessions for profile or skill behavior;
- prompt and schema size diagnostics;
- CLI, SDK, extension, print, and RPC compatibility checks where affected;
- optional recorded live-provider comparisons only for a concrete profile decision;
- comparison with both `allforone` and `main`.

Do not grow a workload registry, treatment framework, evaluator agent, database, dashboard, or mandatory live-model suite.

## Acceptance criteria

Adaptive capability work is complete when:

1. Compatible tool inventory is preserved while normal active profiles are smaller and explicit.
2. The initial normal profile exposes `read`, `bash`, `edit`, and `write`.
3. The patch and full profiles remain explicitly available.
4. One coding-agent-local field owns mutation preference.
5. Tool contracts and output behavior are concise and non-overlapping.
6. Exactly five approved skills use Native Pi progressive disclosure.
7. Manual skill and tool controls remain compatible.
8. Simple tasks do not load unnecessary skills or optional capabilities.
9. Disabled optional features perform no discovery, process startup, model request, or persistent mutation.
10. No classifier model, workflow engine, skill tool, semantic retrieval layer, permanent agent hierarchy, or evaluation platform is added.