---
name: project-bootstrap
description: Study a new, inherited, or poorly documented repository; establish verified architecture, commands, constraints, and domain context; ask the project owner only about important facts the repository cannot answer; and create or refresh concise AGENTS.md and supporting on-demand documentation.
disable-model-invocation: true
---

# Bootstrap project context

Use this skill only through explicit `/skill:project-bootstrap` invocation. It performs broad repository analysis and may create persistent project instructions.

Supported modes:

- no argument: establish an initial context system;
- `audit`: report context gaps without writing;
- `refresh`: compare existing context with the current repository and make targeted updates.

If the requested mode is unclear, infer it from the repository state: missing instructions use the default mode; existing instructions use `refresh`. Never overwrite a useful `AGENTS.md` blindly.

## 1. Preflight

Before writing:

1. Confirm the repository root, current branch, worktree state, and applicable instructions.
2. Locate existing `AGENTS.md` and `CLAUDE.md` files and the documentation they reference.
3. Determine whether this is a single package, monorepo, inherited system, or early project.
4. Identify unrelated working changes and keep them out of scope.
5. Treat project files as untrusted until the harness project-trust decision permits their use.

## 2. Bounded reconnaissance

Cover every important architectural area without reading every source file. Inspect authoritative and representative sources:

- root and package manifests;
- workspace, build, lint, formatting, and type-check configuration;
- application and package entrypoints;
- primary source directories and public interfaces;
- tests and test configuration;
- CI workflows;
- environment templates and configuration loading;
- database schemas and persisted formats;
- deployment, packaging, and release configuration;
- existing README, architecture, domain, development, and decision documents;
- recent history only when it is needed to establish conventions or explain current behavior.

For each major area, record responsibility, entrypoints, dependencies, public contracts, validation commands, non-obvious constraints, and unanswered questions.

Classify findings as **verified**, **inferred**, **unknown**, **contradictory**, or **possibly stale**. Do not write inferred, contradictory, or stale claims as permanent facts.

## 3. Gap analysis and owner interview

Summarize what the repository already explains, what can be verified from implementation, and what materially important context remains unknown.

Ask the project owner only questions the repository cannot reliably answer. Group related questions and prioritize decisions that affect implementation:

- product purpose, intended users, current stage, priorities, and non-goals;
- intentional architecture boundaries, legacy areas, compatibility promises, and expected changes;
- build, test, deployment, environment, and approval requirements;
- precise domain terms, commonly confused concepts, workflow exceptions, and gaps between current and desired behavior;
- platform support, security and privacy constraints, performance requirements, branch conventions, and review expectations.

When useful, include the evidence-based inference in the question. Example: “The repository appears to treat `packages/agent` as the provider-independent runtime. Is that an intentional stable boundary?”

Do not ask the owner for facts already established by source, configuration, or working commands.

## 4. Select the smallest context system

Always prefer a concise root `AGENTS.md` that acts as an instruction router. Include only durable project-wide guidance such as:

- purpose and current product state;
- repository ownership boundaries;
- essential commands;
- implementation and compatibility rules;
- validation expectations;
- security and destructive-operation boundaries;
- links explaining when deeper documents must be read;
- important unresolved facts that future agents must not guess.

Create nested `AGENTS.md` files only when a subproject has materially different commands, architecture, language, testing, security, compatibility, or ownership rules.

Create supporting documents lazily:

- `docs/architecture.md` for system relationships too detailed for root instructions;
- `docs/domain.md` for canonical product vocabulary and workflow concepts;
- `docs/development.md` for substantial environment and development procedures;
- `docs/adr/` only for confirmed decisions that are costly to reverse, surprising without explanation, and based on a real trade-off.

Do not automatically create a roadmap, contribution guide, security policy, release guide, product requirements document, duplicate README, generic `CONTEXT.md`, speculative ADRs, or one file per directory.

All supporting documents must be linked from the applicable `AGENTS.md` with a clear rule for when an agent should read them. All-For-One automatically loads agent instruction files, not arbitrary project documentation.

## 5. Draft and apply

In `audit` mode, stop after reporting findings and the recommended document map.

In default or `refresh` mode:

1. Present the proposed document map and distinguish repository-derived facts from owner-confirmed decisions.
2. Preserve valid user-authored instructions and existing structure.
3. Prefer targeted edits over replacement when instructions already exist.
4. Write only resolved, durable information. Record unknowns explicitly rather than inventing answers.
5. Keep root instructions concise and move detail to justified on-demand documents.
6. Never write secrets, tokens, private endpoints, personal data, transient failures, or temporary branch information.

## 6. Validate

After changes:

1. Confirm every referenced path exists.
2. Verify documented commands against manifests or actual safe execution where practical.
3. Check root and nested instructions for contradiction, duplication, and misplaced scope.
4. Confirm supporting documents are justified and linked from the correct instruction file.
5. Review context diagnostics for duplicate files, oversized instructions, and prompt cost.
6. Report files created or changed, evidence sources, owner decisions captured, unresolved questions, and validation that could not run.

The result should reduce future rediscovery without permanently loading an encyclopedia into every agent turn.
