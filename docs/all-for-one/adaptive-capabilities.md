# Adaptive capabilities

## Purpose

Make All-For-One select useful skills, tools, and workflows from the current task and context without introducing a second orchestrator, classifier model, workflow engine, or hidden autonomous control plane.

The primary model remains responsible for reasoning about the task. All-For-One improves that decision by exposing a small, well-described capability set through Native Pi's existing tool, skill, extension, package, and prompt boundaries.

## Current implementation findings

All-For-One already has the required foundations:

- a definition-first registry for built-in and extension tools;
- a fixed, small built-in tool inventory;
- dynamic extension tool registration and prompt refresh;
- model-visible skill metadata with bounded prompt cost;
- on-demand skill-body loading through `read`;
- manual-only skills through `disable-model-invocation`;
- explicit `/skill:<name>` invocation;
- deterministic skill precedence and duplicate handling;
- package filtering and project/global overrides;
- allowlists and denylists for active tools;
- context diagnostics that expose active and inactive tools, visible skills, manual-only skills, and prompt cost.

The correct implementation is therefore refinement, not replacement.

## Design principles

### The primary model is the selector

Do not add another LLM call to classify the request before the primary model acts. A classifier adds latency, cost, failure modes, and duplicated reasoning while losing access to the full task trajectory.

The primary model receives concise capability metadata and selects the appropriate skill or tool during its normal reasoning turn.

### Progressive disclosure

Keep names and concise descriptions in the model-visible catalog. Load full skill instructions, references, or scripts only after the skill is relevant.

Optional tool schemas are visible only when their extension or package is enabled. Disabled capabilities have no prompt-schema cost.

### Minimum sufficient capability

Use the smallest capability that can complete the task safely and correctly:

1. Answer directly when no tool or skill is required.
2. Use a built-in tool for a simple repository action.
3. Load one relevant skill when procedural guidance materially improves the task.
4. Combine skills only when their responsibilities are independent and both are necessary.
5. Use an optional workflow or extension only when the task needs its specialized behavior.

Do not activate a workflow merely because one exists.

### Explicit behavior for high-impact actions

Automation is appropriate for low-cost, reversible decisions such as selecting `read` instead of `bash` for a file or loading a debugging skill for a reproducible failure.

Manual invocation or an explicit user request remains required for behavior that materially changes cost, autonomy, workspace state, or external systems.

### Observable decisions

The interactive UI should display capabilities that were actually loaded or invoked. It must not display speculative classifications or pretend that hidden agents are working.

### Manual override always wins

Users retain direct control through explicit skill commands, package and resource filters, tool allowlists and denylists, settings, and CLI flags.

An explicit user instruction overrides automatic preference unless it violates a safety boundary or the requested capability is unavailable.

## Capability layers

## 1. Built-in tools

Retain the current compatible built-in registry:

```text
read
bash
edit
write
apply_patch
```

Do not add separate default tools for planning, testing, linting, git, repository maps, code review, or TODO management. `bash`, skills, and optional extensions already cover those operations.

### Non-overlapping tool contracts

| Tool | Primary responsibility | Do not use when |
|---|---|---|
| `read` | Inspect text or image files with bounded output and continuation support | A shell command is required or the task mutates files |
| `bash` | Run shell commands, repository searches, builds, tests, linters, and version-control inspection | A dedicated file tool expresses the operation more clearly |
| `edit` | Perform a small exact replacement in one existing file | Creating a file, replacing an entire file, or applying a multi-file patch |
| `write` | Create a file or intentionally replace its complete contents | A localized edit or patch is safer and more concise |
| `apply_patch` | Apply structured multi-hunk or multi-file mutations | A single exact replacement is sufficient |

Tool descriptions and errors should reinforce these boundaries. The registry remains compatible, but the model receives clear guidance about the narrowest correct operation.

### Tool-selection policy

The model selects tools from semantics, not from hardcoded keyword routing.

The harness may provide deterministic eligibility checks such as:

- a disabled tool is not exposed;
- a path outside the permitted workspace is rejected;
- a first mutation waits until applicable scoped instructions are active;
- a tool call with invalid schema input fails with corrective guidance;
- extension tools appear only after registration.

The harness must not inspect user text with a growing set of regular expressions to decide which tool to activate. Such routing becomes fragile, language-dependent, and difficult to maintain.

### Model-specific mutation behavior

Model-specific mutation preferences may be introduced later only as a small coding-agent policy using existing model metadata and explicit user overrides.

The initial adaptive implementation should first improve the contracts of `edit`, `write`, and `apply_patch`. It should not silently remove tools from a session based on unverified model assumptions.

If a later model profile is justified, it must:

- choose among existing compatible tools;
- live in one coding-agent-local module;
- fall back to Native Pi behavior for unknown models;
- avoid provider-specific logic in the core agent loop;
- remain visible in context diagnostics;
- be overridable through configuration.

## 2. Skills

Skills are the primary mechanism for adaptive engineering behavior.

### Automatic skills

A skill may be model-invoked when all of the following are true:

- its description identifies a specific task or failure mode;
- using it is low-cost and reversible;
- its workflow does not require separate agents or external publication;
- it materially improves correctness, clarity, or safety;
- it does not duplicate another visible skill.

Recommended automatic first-party skills:

- `repository-orientation` — unfamiliar repositories, broad architecture questions, or tasks requiring execution-path tracing;
- `systematic-debugging` — bugs, failing tests, crashes, regressions, or unexplained behavior;
- `verify-before-completion` — before claiming a code change is complete, fixed, or passing.

### Manual-only skills

Set `disable-model-invocation: true` when a skill introduces substantial process, cost, autonomy, or external effects.

Recommended manual-only first-party skills:

- `plan-complex-change` — architecture and implementation planning for multi-module work;
- `review-diff` — an explicit independent review of a selected change range;
- future subtask delegation workflows;
- deep research workflows;
- release or publication workflows;
- destructive cleanup workflows;
- sandbox or worktree management workflows.

Users invoke these with `/skill:<name>` or by explicitly requesting the workflow.

### Skill-description contract

Descriptions determine adaptive selection and must state:

1. what the skill does;
2. the concrete situations that should trigger it;
3. important exclusions when confusion is likely.

Good example:

```yaml
description: Trace and diagnose reproducible bugs, failing tests, crashes, and performance regressions before proposing a fix. Do not use for feature planning or general code review.
```

Avoid descriptions such as `Helps with engineering` or a universal router that claims every task.

### Skill-body constraints

- Keep the main `SKILL.md` concise and procedural.
- Put detailed references one level below the skill.
- Include scripts only when deterministic execution is repeatedly useful.
- Do not repeat the base system prompt or repository instructions.
- Do not require another skill merely to understand the current skill.
- Do not force planning or test-driven development for trivial documentation and configuration edits.
- Do not instruct the model to launch subagents unless the user explicitly selected such a workflow and the capability is installed.

### Collision and precedence

Retain the existing precedence order:

1. explicit temporary invocation;
2. project-local skill;
3. user-global skill;
4. package-provided skill;
5. remaining sources.

A lower-priority duplicate is omitted and reported through diagnostics. Do not merge skill bodies automatically.

## 3. Optional tools and extensions

Optional capabilities belong in Native Pi extensions or packages.

Examples include:

- language-server code intelligence;
- workspace permission policy;
- MCP adapters;
- browser or external-service integrations;
- sandbox launchers;
- subtask delegation.

### Activation rules

- Never install a package automatically because a task might benefit from it.
- Never expose every installed external tool by default.
- Respect project trust and package filters.
- Register tools only when the owning extension is enabled.
- Prefer one namespaced tool with a small operation enum over many overlapping tools.
- Defer processes, sockets, watchers, and language servers until the capability is invoked.
- Dispose session-owned resources on shutdown.
- Keep description and schema size bounded.

### Suggested optional capability policy

| Capability | Default state | Activation |
|---|---|---|
| Native built-in tools | Enabled | Session configuration and existing allow/deny controls |
| First-party low-cost skills | Discoverable | Primary model loads when clearly relevant |
| Planning and review skills | Manual-only | Explicit command or user request |
| Safe-mode extension | Optional | User or project package configuration |
| Code-intelligence extension | Optional | Enabled package; tool starts service lazily |
| MCP adapter | Optional | Explicit server and tool allowlist |
| Subtask delegation | Deferred and optional | Explicit workflow only |
| External sandbox | Optional launcher | User-selected execution environment |

## 4. Workflows

A workflow is a skill-guided sequence over existing tools. It is not a new runtime engine.

### Automatic workflow threshold

The primary model may follow an automatic skill workflow when:

- the task clearly matches the skill description;
- the workflow is contained in the current agent session;
- steps are necessary rather than ceremonial;
- no external publication or destructive operation occurs;
- no additional model is required;
- the workflow can stop as soon as sufficient evidence exists.

Examples:

- reproduce a failing test, inspect the execution path, form one hypothesis, apply the smallest fix, and rerun the focused test;
- inspect repository instructions and architecture before changing an unfamiliar module;
- run the command that directly proves a completion claim.

### Manual workflow threshold

Require explicit selection when the workflow:

- creates or switches worktrees;
- dispatches subagents;
- performs a deep multi-source research pass;
- creates issues, pull requests, releases, or external messages;
- performs broad refactoring or cleanup;
- changes credentials, dependencies, or environment isolation;
- materially increases model calls or token use.

## Adaptive turn behavior

For each user turn, the intended behavior is:

1. Read the request and already-active project instructions.
2. Determine whether the request can be answered without a capability.
3. If repository interaction is required, choose the narrowest built-in tool.
4. If a visible skill clearly matches, load its `SKILL.md` with `read` before following its procedure.
5. Use additional skills only when they provide distinct necessary responsibilities.
6. Use optional tools only when already enabled and clearly relevant.
7. Stop procedural work when the task's success condition is satisfied.
8. Before a completion claim, run the smallest decisive verification required by the repository and task.

This remains normal model reasoning. It does not introduce a pre-routing turn.

## Manual override surfaces

Users can control behavior through:

- `/skill:<name>` for explicit skill invocation;
- `disable-model-invocation` for manual-only skills;
- `--no-skills` and explicit `--skill` paths;
- package resource filters;
- extension enable and disable configuration;
- tool allowlists and denylists;
- CLI and SDK active-tool options;
- project-specific instructions in `AGENTS.md` or equivalent context files.

The UI should identify whether a capability was selected automatically or explicitly when that distinction is useful, but it must not add verbose transcript messages for ordinary selections.

## Failure and fallback behavior

### No matching skill

Continue with the primary model and built-in tools. Lack of a specialized skill is not an error.

### Ambiguous skill match

Prefer no skill over loading several generic candidates. The model may ask one high-value clarification when the missing information materially affects the result.

### Skill cannot be read

Report the path and error concisely, then continue without the skill when safe. Do not silently claim the workflow was followed.

### Optional tool unavailable

Use an existing built-in alternative when it can satisfy the task. Otherwise report the missing capability and the exact manual enablement path; do not install it automatically.

### Workflow becomes disproportionate

Stop the workflow and return to the simplest viable path. Skills are guidance, not an obligation to execute irrelevant steps.

### Manual override conflict

Follow the explicit user selection unless a security policy, workspace boundary, or unavailable capability prevents it. Explain the blocking boundary directly.

## Observability

Use existing runtime data rather than a new telemetry subsystem.

Interactive mode may show:

- the current skill loaded for the task;
- active optional capabilities;
- active and recent tool calls;
- warnings for omitted or duplicate skill metadata;
- a manual or automatic indicator only when it helps diagnose behavior.

`/context` remains the detailed diagnostic surface for:

- visible and manual-only skills;
- active and inactive tools;
- tool origins;
- metadata and schema cost;
- context scopes and warnings.

Do not persist private task classifications or create a behavior-profile database.

## Architecture placement

- Skill discovery, validation, metadata budgeting, and precedence: existing `packages/coding-agent/src/core/skills.ts`
- Tool definitions and descriptions: `packages/coding-agent/src/core/tools/`
- Session composition and active-tool state: existing `AgentSession`
- Prompt assembly: existing coding-agent system-prompt boundary
- Optional behavior: Pi extensions and packages
- Interactive observability: session rail and `/context`
- Provider/model abstraction: unchanged in `packages/ai`
- Agent execution loop: unchanged in `packages/agent` unless a proven Native Pi limitation cannot be solved above it

## Non-goals

- Router or classifier model
- Keyword-based workflow engine
- Mandatory planning mode
- Permanent multi-agent hierarchy
- Automatic subagent dispatch
- Automatic package installation
- Semantic skill search or embeddings
- Vector database
- Hidden replacement of user-selected tools
- A second plugin, hook, or package system
- Automatic external publication
- Automatic command execution merely because a validation command was discovered

## Acceptance criteria

Adaptive capability selection is ready when:

1. The primary model can discover and load relevant skills from bounded metadata without another model call.
2. Manual-only skills remain absent from the model-visible catalog and available through explicit commands.
3. Built-in tool descriptions have clear, non-overlapping responsibilities.
4. Optional tools have no prompt or process cost while their extension is disabled.
5. The model does not load workflows for simple tasks without material benefit.
6. Explicit user selections and existing allow/deny controls remain authoritative.
7. `/context` accurately reports visible skills, manual-only skills, active tools, origins, and prompt cost.
8. Interactive UI shows actual capability use without inventing hidden agents or classifications.
9. No classifier model, workflow engine, embedding system, or new runtime dependency is introduced.
10. Print, RPC, SDK, extensions, packages, and session behavior remain Pi-compatible.