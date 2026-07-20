---
name: design-complex-change
description: Use when a requested change crosses packages, alters public APIs or persisted formats, changes lifecycle or concurrency behavior, introduces a migration, or requires architectural trade-offs. Map current ownership and compatibility boundaries, compare viable designs, select the smallest cohesive approach, and define validation and rollback.
---

# Design a complex change

Use this skill only when the change is architecture-sensitive. Localized edits should follow the repository's normal implementation workflow without loading this skill.

## Establish the current system

1. Confirm the objective, non-goals, repository state, and applicable project instructions.
2. Trace the real execution and data flow through the relevant entrypoints, packages, tests, configuration, and documentation.
3. Identify the narrowest layer that owns the behavior and the public contracts that must remain compatible.
4. Record verified facts, inferences, assumptions, unknowns, and upstream conflict points separately.

## Compare designs

For each viable design, evaluate:

- correctness and failure behavior;
- implementation and maintenance complexity;
- latency, model turns, tool calls, prompt size, and resource cost;
- security and trust boundaries;
- cross-platform and backward compatibility;
- migration and rollback requirements;
- testability and impact on frequently changed upstream files.

Prefer existing boundaries and composition. Add an abstraction only when the verified requirement cannot be expressed cleanly through the current architecture.

## Select and plan

Choose the smallest cohesive design that solves the demonstrated problem. State why rejected alternatives are not worth their cost. Define dependent implementation steps, a decisive validation gate for each step, migration behavior, rollback points, and unresolved decisions.

Do not turn the result into a broad rewrite, speculative framework, or permanent orchestration layer.
