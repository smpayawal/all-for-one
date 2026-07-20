---
name: project-context-maintenance
description: Use when current work reveals durable project knowledge that is missing, stale, contradictory, or misplaced in AGENTS.md or linked project documentation. Verify the knowledge against code, configuration, tests, or confirmed owner statements, then make the smallest targeted context update or report that no persistent update is justified. Do not record one-off debugging details, speculative plans, secrets, or obvious code.
---

# Maintain project context

Keep durable project guidance accurate without turning documentation into a session log.

## Persistence gate

Write project context only when the information is all of the following:

1. **Durable** — likely to affect future work.
2. **Verified** — supported by code, configuration, tests, a working command, or an explicit project-owner statement.
3. **Non-obvious** — not reliably recoverable from a quick local inspection.
4. **Stable** — not a temporary incident, branch detail, experiment, or unapproved plan.
5. **Correctly scoped** — there is a clear root, package, or supporting-document destination.

If any condition fails, make no persistent change. Leave project files unchanged and state the no-op decision briefly.

## Update workflow

1. Respect the current task mode. For analysis or review-only work, report the proposed context correction without editing files.
2. Read the complete target instruction file and any document it references.
3. Identify the smallest addition, correction, relocation, or deletion that resolves the verified gap.
4. Preserve owner-authored intent and existing structure. Do not replace a whole file when a targeted edit is sufficient.
5. Put cross-project rules in root `AGENTS.md`; put materially different package rules in the nearest nested `AGENTS.md`; keep detailed architecture, domain, or setup material in linked on-demand documentation.
6. Verify referenced paths and commands where practical, check for contradiction or duplication, and report the evidence for each change.

Never persist secrets, credentials, private data, transient logs, exact drifting line numbers, speculative reasoning, session summaries, or facts already obvious from the source.
