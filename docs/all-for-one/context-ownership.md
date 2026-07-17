# Context ownership and change boundaries

All-For-One keeps context deliberately layered. Each layer has one owner and one purpose.

| Layer | Owner | Use it for | Do not use it for |
|-------|-------|------------|-------------------|
| Repository instructions | `AGENTS.md` and package-local instructions | Required workflow, safety, style, and validation rules | User preferences or session history |
| Repository architecture | `docs/`, ADRs, manifests, source, and tests | Architecture, API contracts, conventions, domain behavior, and executable truth | Temporary task state |
| Coding-agent profile | `packages/coding-agent/src/core/coding-model-profile.ts`, settings, CLI, SDK | Tool profile and tool-execution resolution | Provider-specific prompts or a second tool registry |
| Native package resources | `packages/coding-agent/skills/` and the `pi` manifest | On-demand first-party guidance | Automatically loading full skill bodies into every prompt |
| Local memory | Explicit project memory under the agent directory | Preferences, repeated corrections, local tool quirks, and temporary reminders | Duplicating repository architecture or policy |
| Session context | The current conversation and compacted handoff | Goal, decisions, modified files, command outcomes, blockers, and next action | Permanent project documentation |

## Read order

For a non-trivial coding task, start at the applicable instruction boundary, then read the package manifest and entrypoint, the relevant implementation, nearby tests, architecture documentation, and only the dependencies needed to resolve an uncertainty. Path-scoped instructions are loaded for the files being inspected or changed; unrelated repository instructions are not broad-injected.

## Change ownership

The Native Pi agent loop and `AgentSession` lifecycle remain the runtime boundary. Coding-agent-specific profile resolution belongs in the coding-agent package and is passed into the existing session construction path. The five canonical built-in tools remain registered once; a profile only selects active built-ins. Execution-integrity observation, bounded memory, compaction, and extension/package loading remain their existing optional or bounded mechanisms.

## Compaction handoff

When context is compacted, retain the active goal, decisions and assumptions, files modified, commands and outcomes, blockers, and the next action. Do not replace source-controlled instructions or tests with a generated summary.
