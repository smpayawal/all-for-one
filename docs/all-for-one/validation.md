# Validation policy and current evidence

Validation starts with the smallest relevant checks, then expands according to risk. Every result is classified as passed, failed, skipped, or environment-limited. An environment limitation is never converted into a pass.

## Evidence rules

- Evidence applies only to the exact commit that ran the check.
- A moving branch name is not a validation identity.
- Local checks do not replace the required GitHub Actions platform matrix.
- A pull-request head must contain the current `allforone` base.
- The merge result must run the push workflow again.
- Generated files and the final worktree must remain clean.
- Live-provider quality, latency, token, and cost claims require paired controlled runs.

## Runtime hardening history

The original runtime-release-hardening implementation was committed as `2f7295f8e7135f01da4fdd07fc678b73cdcd89d3` directly to `allforone`. Its recorded local checks included build, repository checks, full workspace tests, focused process tests, safe-mode and profile tests, offline diagnostics, and non-publishing package smoke checks.

Those results are historical evidence for that commit only. They do not validate the later `fix/runtime-hardening-followup` changes.

## Required pull-request gate

The exact follow-up head must pass:

1. checked-out SHA verification;
2. current `allforone` base ancestry;
3. dependency installation with lifecycle scripts disabled;
4. build;
5. generated-output verification;
6. `npm run check`;
7. focused All-For-One and coding-agent tests;
8. full workspace tests;
9. offline doctors, baselines, and evaluator availability;
10. upstream relationship verification;
11. clean-worktree verification;
12. Ubuntu, macOS, and Windows platform-focused jobs.

The process-focused suites must cover:

- normal completion and nonzero exit;
- independent output bounds;
- timeout and abort classification;
- descendants that ignore graceful termination;
- root-exits-first behavior;
- unavailable Windows discovery and `taskkill` helpers;
- bounded incomplete-cleanup reporting;
- no indefinite wait for an unkillable or unverifiable process tree.

## Explicit repository-grounded validation

The hidden built-in validation extension exposes:

```text
/validate
/validate list
/validate check
/validate typecheck
/validate lint
/validate test
/validate build
/validate run <number>
/validate last
```

Discovery reuses the existing repository validation module. Each result includes the human-readable command, structured executable and arguments, category, source, and `verified` or `inferred` confidence. Node commands come from declared package scripts and an unambiguous package manager. Python, Rust, and Go commands are labeled inferred when configuration indicates the conventional command. Make targets are used only when explicitly declared.

Execution is user-initiated and does not add a model-callable tool. `/validate run` and unambiguous category commands require a trusted project, a dialog-capable UI, and confirmation showing the exact program, argument array, working directory, source, and confidence. The process is spawned directly without a shell, with bounded stdout and stderr capture and a two-minute timeout. Inferred commands receive a stronger warning. Ambiguous categories display choices instead of selecting silently.

Non-interactive modes are discovery-only and fail closed for execution. The command does not install dependencies, accept arbitrary command strings, append shell suffixes, or run multiple checks automatically. `/validate last` shows the most recent bounded result without rerunning it.

This command is a trusted user-initiated extension action. Safe mode continues to authorize model-initiated Bash tool calls; it is not an operating-system sandbox and cannot constrain trusted extension code. The validation command therefore maintains its own narrow boundary: repository-grounded fixed argv, project trust, exact user confirmation, timeout, bounded capture, and no shell.

## Offline session-efficiency report

Run the privacy-safe report against an existing Pi-compatible session JSONL file:

```text
npm run report:session -- <session.jsonl>
npm run report:session -- <session.jsonl> --json
```

The report reads the file offline and does not modify the session. It reports only recorded evidence such as model and thinking configuration, token counts when present, assistant turns, tool success and failure counts, repeated reads, mutation and validation calls, truncation, compaction, cancellation, timeout, and trustworthy timestamp duration.

The report deliberately excludes prompt text, assistant text, file contents, tool-output contents, secrets, environment values, and monetary cost estimates. Missing evidence remains `null` or is described as not recorded; it is never inferred as a successful or zero-cost result.

Use this report for controlled paired comparisons where repository revision, prompt, model, thinking level, permissions, tool profile, and initial state are held constant. A report is measurement evidence, not proof that one configuration is better.

## Packaging and runtime smoke

Before a release, run the non-publishing local release flow and exercise the generated Node and Bun entry points where supported:

- `--version`;
- `--help`;
- offline model listing;
- print startup;
- JSON startup;
- RPC startup;
- interactive startup;
- extension loading;
- session creation and resume;
- Pi-compatible configuration paths.

Automated smoke checks must not consume paid provider access. A missing-provider-key result is an expected limitation, not a successful model prompt.

## Security boundary

Safe mode is authorization-oriented and is not a sandbox. Bash and extension code retain host permissions. Untrusted repositories require an external container, VM, restricted account, or other operating-system isolation boundary.

Process cleanup is best-effort. The runtime must return a bounded, explicit incomplete-cleanup result when the host refuses or cannot verify termination; it must not hang indefinitely or claim successful cleanup without evidence.

## Evaluation boundary

The offline baselines and scenario inventory validate schemas and measurement readiness only. Paired runs with the same repository, prompt, model, context, permissions, and initial state are required before publishing comparative quality, reliability, latency, token, or cost claims.
