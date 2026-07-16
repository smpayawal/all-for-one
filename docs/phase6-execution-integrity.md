# Phase 6 execution integrity

Phase 6 adds a small, deterministic execution-integrity boundary around the existing Native Pi single-agent loop. It gives the agent bounded evidence about whether a known file mutation has a fresh matching validation result before a would-be completion is allowed to settle.

## 1. Goal and problem statement

The goal is to make completion decisions more observable and proportionate after known built-in path mutations. The primary agent still chooses whether and how to validate. Phase 6 records final tool results at the completed-turn boundary, compares bash commands only with validation commands already discovered from repository files, and may provide one bounded hidden continuation request when enforcement is explicitly enabled.

A passing command is evidence that the recorded command completed successfully for the current known mutation version; it is evidence, not proof of complete correctness or acceptance of every task criterion.

## 2. Non-goals

Phase 6 does not add a permanent planner, orchestrator, reviewer, auditor, validator agent, task graph, workflow engine, second execution runtime, LLM completion judge, LLM task-risk classifier, validation database, automatic memory extraction, or automatic full-test execution. It does not infer correctness from test output, run every available validation command, or change the Native Pi loop and queue semantics.

No validation command is executed automatically by the runtime. The primary agent chooses whether and how to validate after receiving bounded feedback.

## 3. Existing primitives reused

The implementation reuses:

- `discoverValidationCommands()` and its existing `ValidationCommandDiscovery` output;
- bash prompt guidance based on that discovery;
- `isMutatingPathTool()` and `getPathScopedToolPaths()` for `edit`, `write`, and `apply_patch`;
- final `turn_end` tool results after extension post-hooks;
- `AgentSession` lifecycle and `prepareNextTurnWithContext` refresh wrapper;
- Native Pi `Agent.hasQueuedMessages()` and `Agent.followUp()` queues;
- `CustomMessage` with `display: false` for model-visible, hidden feedback;
- existing full-output references when a bash result already provides one; and
- `AgentSession.getContextInfo()` for programmatic diagnostics and `/context` rendering.

Discovery is refreshed when the runtime is built or reloaded, not on every turn.

## 4. Execution-integrity settings

The settings are JSON-configurable and off by default:

```json
{
  "executionIntegrity": {
    "mode": "observe",
    "maxContinuationAttempts": 1
  }
}
```

`mode` is one of `off`, `observe`, or `enforce`. `maxContinuationAttempts` is normalized to the inclusive range `0..2`; the default is `1`.

- `off`: no run-local tracking, diagnostics, or continuation.
- `observe`: records bounded evidence and exposes diagnostics, but never queues another model turn.
- `enforce`: records evidence and may queue a hidden continuation when evidence is missing, stale, failed, or concurrent, subject to the configured bound.

Enforcement remains opt-in during Phase 6. It is not enabled by default.

## 5. Mutation evidence boundary

The tracker counts only successful built-in path mutations. A final tool result must identify `edit`, `write`, or `apply_patch` and must not be an error. Each successful mutation increments the mutation version and count and records bounded target paths. Earlier validation records become stale when the version advances.

The tracker does not inspect the whole workspace, run `git status`, or attempt to classify arbitrary shell commands as read-only. Arbitrary bash commands may mutate the workspace and are not fully classified by Phase 6.

Modified paths are bounded to 128 entries, validation records to 16 entries, and continuation attempts to 2 even if a configuration or run asks for more.

## 6. Validation-command matching

`matchValidationCommand()` accepts only commands grounded in `discoverValidationCommands()` output. It normalizes surrounding and repeated whitespace, accepts an exact discovered command, and accepts a simple targeted suffix for discovered test commands, such as:

```text
npm test -- test/example.test.ts
cargo test specific_test
python -m pytest tests/example.py
```

It does not parse a shell and rejects compound commands, pipelines, redirection, and newline-separated commands containing `&&`, `||`, `;`, `|`, `>`, or `<`. It does not classify arbitrary commands by words such as `test`, `lint`, or `build`, and it never executes a command.

## 7. Fresh, stale, failed, and concurrent evidence

Evidence is fresh only when it matches a discovered command, is associated with the current mutation version, is not in the same completed tool batch as a known mutation, and is the newest result for that normalized command.

Current-status precedence uses the newest result per command:

1. a fresh failed result means current validation is failed;
2. otherwise, a fresh pass means fresh evidence exists;
3. otherwise, an older mutation-version result is stale; and
4. otherwise, evidence is missing.

When mutation and validation observations arrive in one completed tool batch, Phase 6 records `concurrent-with-mutation` because Native Pi may execute tool calls in parallel and the order is not reliable evidence that validation covered the final files. A later-turn validation may be fresh.

User-run interactive `!` bash commands use the existing command, exit, cancellation, and full-output fields when they pass through `AgentSession.executeBash()`. A cancelled command or a non-zero/unknown exit does not count as a pass. Extensions that execute bash outside this path remain a known limitation.

## 8. Observe versus enforce behavior

At a would-be stop, the deterministic decision function first allows `off` mode, read-only work with no known mutation, and projects with no discovered validation command. A fresh pass allows completion. Missing, stale, failed, or concurrent evidence is reported without blocking in `observe` mode.

In `enforce` mode, the tracker queues a continuation only when no tool loop is required, no tool results remain for the turn, the assistant response is not an error or abort, and no steering or follow-up message is already queued. A real queued user message takes precedence. The implementation uses the existing follow-up queue; it does not call `prompt()` recursively, create a visible fake user message, or start another agent.

## 9. Bounded hidden continuation

Continuation feedback is a `CustomMessage` with `customType: "execution-integrity-feedback"` and `display: false`. It is visible to the model through the existing message conversion path but is not rendered as a user transcript entry. Its content is capped at 2,000 characters and always offers an accurate alternative to running validation: validation may be prohibited, unsupported, unavailable, or disproportionately expensive, in which case the agent should report what remains unverified.

The tracker increments its continuation counter before queuing feedback. Once the configured limit is reached, it returns `allow` with `continuation-limit-reached`; it cannot loop indefinitely.

## 10. `/context` diagnostics

`AgentSession.getContextInfo()` exposes the bounded snapshot to RPC and SDK consumers. `/context` renders a compact execution-integrity section with mode, known mutations, mutation version, modified-path count, validation state, recorded validation count, continuation attempts, bounded limitations, and references to existing full-output files. It does not render complete validation logs or send telemetry externally.

## 11. Known limitations

- Arbitrary bash mutations are not completely classified.
- Same-batch mutation and validation is conservatively ambiguous; Phase 6 does not add a shell parser or execution-order claim.
- Discovery is grounded in existing repository files and does not invent a command for an unknown project.
- Validation output is not interpreted as proof of task correctness.
- Interactive user-run validation is integrated only through the existing `executeBash()` path; broader extension-owned bash flows are deferred.
- No live model evaluation has been run for Phase 6 in this implementation.
- The Phase 5 empirical exit gate remains outstanding. Phase 5 improvements are not claimed as proven without controlled live results.

## 12. Phase 5 dependency and outstanding empirical gate

Phase 6 reuses Phase 5’s bounded evidence-reference and evaluation discipline. It does not claim that Phase 5 retention or context-integrity changes improve live quality. Any broader Phase 6 enablement depends on controlled evidence for both phases and must keep treatment-only settings separate from shared pair identity.

## 13. Phase 6 live evaluation plan

Compare baseline `executionIntegrity.mode = "off"` with treatment `executionIntegrity.mode = "enforce"` while keeping provider/model, reasoning setting, tools, task input, initial repository state, context window, project instructions, retries, and compaction settings constant except for the explicit treatment setting. Repeat runs where practical because model behavior is nondeterministic.

Use these workloads:

1. a small localized bug fix with a nearby focused test;
2. a multi-file feature;
3. an existing failing test;
4. a documentation-only edit;
5. a build or configuration change;
6. validation followed by another code edit;
7. a pre-existing unrelated test failure;
8. a user request not to run tests;
9. a repository with no credible validation command;
10. a long session crossing a Phase 5 compaction boundary;
11. mutation and validation requested in one parallel tool batch; and
12. a task whose tests pass while broader acceptance criteria remain unmet.

Record correctness and critical instruction failures with human or external annotation. Also record premature completions, unsupported success claims, user correction turns, relevant and unnecessary validation, stale and failed validation, continuation count, false completion blocks, turns, tool calls, prompt/cumulative tokens, cache tokens, latency, and cost when available. Missing quality annotations stay missing; they are not fabricated from session logs.

## 14. Exit criteria

Broader default enablement may be considered only after controlled results show no correctness or critical-instruction regression, reduced premature-completion or unsupported-success incidents, acceptable false-block and correction-turn rates, acceptable model-turn/latency/token/cost overhead, no infinite continuation, no steering/follow-up or extension-hook regression, and no compaction-boundary regression. If evidence is inconclusive, keep enforcement opt-in.

The Phase 6 evaluator retains `efficiencyClaim: "not-established"` unless suitable evidence supports a stronger conclusion.

## 15. Exact validation commands

Focused tests:

```bash
cd packages/coding-agent
node node_modules/vitest/dist/cli.js --run \
  test/validation-commands.test.ts \
  test/execution-integrity.test.ts

node node_modules/vitest/dist/cli.js --run \
  test/settings-manager.test.ts \
  test/agent-session-runtime-events.test.ts

node node_modules/vitest/dist/cli.js --run \
  test/phase6-baseline.test.ts \
  test/phase6-evaluation.test.ts
```

Deterministic tools and complementary gates:

```bash
cd ../..
npm run baseline:phase6 -- --help
npm run baseline:phase6 -- --json
npm run evaluate:phase6 -- --help
npm run baseline:phase5 -- --json
npm run evaluate:phase5 -- --help
npm run doctor:phase4 -- --json
npm run check
```

No reviewer agent was added, no LLM completion judge was added, enforcement is off by default, and the runtime does not automatically execute validation commands.
