# All-For-One Hardening and Cleanup Design

## Purpose

Audit and improve the `allforone` branch as a lightweight single-agent Pi harness while preserving the vanilla relationship:

```text
upstream Pi -> main -> allforone
```

The result must be evidence-backed. Structural checks, focused tests, live evaluations, and environment-limited runs are reported separately.

## Current evidence

- The audited integration branch is `allforone`; the focused implementation branch is `fix/post-audit-hardening`, created from it.
- Local `main` is `216e672e7c9fc65682553394b74e483c0c9e47f7`.
- Local `allforone` and the current branch tip are `3258be547c5175043d9fabadace558e27c0f838a`.
- `main` is the merge base and is an ancestor of `allforone`; the local relationship is `0` behind and `42` ahead. `origin/HEAD` points to `origin/main`.
- The current worktree contains only uncommitted changes from this hardening pass and preserves the integration branch; no commit, push, merge, rebase, or tag was performed.
- The final focused matrix passed 9 coding-agent files/116 tests plus the 32-test agent-loop regression. The full workspace test command remains environment-limited; exact package counts and classifications are recorded in `docs/all-for-one/test-baseline.md`.

## Constraints and non-goals

The implementation must:

- Keep `main` and published `allforone` untouched during focused work; create focused branches from `allforone`, target pull requests back to `allforone`, and never merge `allforone` into `main`.
- Preserve the primary single-agent flow and keep execution integrity default-off.
- Avoid planner/reviewer/validator agents, workflow engines, databases, embeddings, semantic memory, mandatory sandboxing, and broad UI redesign.
- Preserve user-staged changes and unrelated worktree changes.
- Use existing dependencies and repository abstractions; add no dependency unless a current capability is insufficient.
- Avoid automatic execution of discovered repository commands.
- Make no performance, cost, latency, or correctness claim without direct measurement.
- Avoid commits unless the user explicitly requests them.

## Selected approach

Use capability-sliced migration with stable interfaces and narrow validation boundaries:

1. Establish branch, worktree, and baseline evidence.
2. Make the tool registry canonical and remove `changes` completely.
3. Replace phase-oriented diagnostics with capability-oriented commands and documentation.
4. Add dedicated `allforone` CI and the offline upstream relationship check.
5. Harden `apply_patch` and its mutation queue without claiming crash atomicity.
6. Bound scoped instruction context while preserving the first-mutation retry barrier.
7. Audit and minimally refine execution integrity, compaction telemetry, skill priority, memory limits, and session-rail isolation.
8. Run focused, package, cross-platform, upstream-rehearsal, and paired-evaluation checks; record gaps explicitly.

This approach keeps `AgentSession` as the composition root and extracts a responsibility only when the boundary is stable, independently testable, and measurably reduces upstream conflict risk.

## Architecture

### Canonical tools

The tool registry becomes the only source of built-in tool names and defaults. The default active names are exactly:

```ts
export const DEFAULT_ACTIVE_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  "apply_patch",
] as const;
```

The constant is consumed by the session runtime, CLI/SDK defaults, diagnostics, tests, and documentation. Unknown names supplied through allowlists are ignored as they are today; denylists remain deterministic. Extension and custom tools remain independent of the built-in default.

The `changes` tool is deleted rather than disabled. Its implementation, schema, renderer, factory, registry entries, public exports, extension event types, prompt/help text, tests, fixtures, diagnostics, and documentation are removed. Git inspection remains available through Bash.

### All-For-One CI

`.github/workflows/allforone-ci.yml` runs for pull requests targeting `allforone` and pushes to `allforone`. Because `main` is the repository default branch and the workflow is intentionally scoped to `allforone`, manual and scheduled triggers are not used. Third-party actions are pinned to immutable commit SHAs. Permissions are read-only by default, jobs have bounded timeouts, concurrency cancels superseded runs, and untrusted pull requests do not receive repository secrets.

The normal gate includes dependency installation, repository static checks, core tests, focused All-For-One tests, structural diagnostics, and the offline upstream relationship check. The extended job adds platform-sensitive checks on Ubuntu, macOS, and Windows and retains actionable reports only.

### Apply-patch safety

Preflight records each target's existence, content fingerprint, and file mode where supported. Before replacing an existing file, commit verifies that the observed state still matches preflight. Temporary files are created in the target directory, flushed and closed before replacement, and replaced with a verified rename strategy. Updates preserve mode; rollback restores content and mode on a best-effort basis. Errors clean temporary files, cancellation remains effective before commit, duplicate/collision/symlink/workspace checks remain intact, and multi-file patches remain explicitly non-transactional under process crashes.

### Scoped context

The tracker records nested instruction scopes by canonical directory chain. Each target retains its applicable parent-to-child chain; unrelated siblings replace stale scopes. A bounded temporary union is permitted for one multi-sibling tool call. Active scope count and total characters are bounded, ordering is deterministic, and diagnostics report active, replaced, omitted, oversized, and conflicting sibling scopes. The implementation does not infer shell `cd` behavior or perform semantic conflict resolution. The existing project-root policy and first-mutation retry barrier remain intact.

### Execution integrity, compaction, skills, memory, and rail

Execution integrity continues to support `off`, `observe`, and `enforce`, with `off` adding no validation guidance. Discovered commands are evidence only; they are never automatically executed or treated as correctness proof. Diagnostics remain bounded and distinguish passed validation from task correctness.

Compaction retains structural validation, one repair attempt, invalid-result rejection, zero exact-user retention by default, and bounded evidence references; telemetry is in-memory or existing diagnostics only. Skill metadata retains its budget and manual/on-demand behavior while using deterministic source priority and tie-breakers. Local memory remains explicit, external to the model prompt, bounded, best-effort for secret detection, and atomically updated. The session rail remains optional and isolated from print, RPC, and SDK modes; Native Pi interaction behavior is unchanged when it is absent or disabled.

## Documentation and command surface

Useful current information is consolidated under `docs/all-for-one/`:

- `architecture.md`
- `upstream-sync.md`
- `release-policy.md`
- `validation.md`
- `context-and-capabilities.md`
- `compaction.md`
- `execution-integrity.md`
- `security.md`
- `test-baseline.md`
- `known-limitations.md`
- `hardening-report.md`

Capability-oriented scripts and commands replace obsolete phase names where the script remains useful. Files are removed only after their useful content is migrated and no published compatibility surface requires them. Historical claims that are not reproducible are retained only as dated evidence with explicit limitations, not as current guarantees.

## Validation and evidence

Validation is layered:

1. Focused regression tests for each changed subsystem.
2. Package tests and the requested workspace test command.
3. Repository static checks, including generated lock/shrinkwrap checks.
4. Offline baseline, doctor, evaluator-help, and upstream-relationship commands.
5. Cross-platform focused tests in CI.
6. A non-provider paired evaluation harness with identical task inputs and controlled configuration where live provider access is available.

Prompt/schema diagnostics report characters, bytes, and approximate tokens for representative configurations without exact snapshots of environment-dependent paths. Paired evaluations report only recorded metrics and mark missing provider or model measurements as unavailable.

The final report includes exact commands, exit codes, changed files, branch relationship, test classifications, prompt/schema deltas, security limitations, CI results, upstream merge conflicts, evaluation results, and remaining risks.

## Error handling and rollback

Existing functionality is preserved unless the requirement explicitly removes it. Runtime errors are bounded and sanitized where the current in-progress work already establishes that contract. Apply-patch rollback is best-effort and documented as such. Validation failures remain visible; retries are bounded and are not used to hide deterministic defects. Environment-limited failures are reproduced or isolated before classification.

## Completion criteria

Completion requires current evidence for every explicit artifact and invariant in the requirements: dedicated CI, complete `changes` removal, canonical defaults, generic diagnostics, apply-patch concurrency protection, bounded scoped context, execution-integrity prompt behavior, required tests, branch relationship, cross-platform checks where available, documentation, and truthful limitations. Structural success alone is insufficient for claims about live quality, performance, latency, or cost.
