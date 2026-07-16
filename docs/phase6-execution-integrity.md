# Phase 6 execution integrity

Phase 6 adds a small, deterministic execution-integrity boundary around the existing Native Pi single-agent loop. It gives the agent bounded evidence about whether a known file mutation has a fresh matching validation result before a would-be completion is allowed to settle.

## 1. Goal and problem statement

The goal is to make completion decisions more observable and proportionate after known built-in path mutations. The primary agent still chooses whether and how to validate. Phase 6 records final tool results at the completed-turn boundary, compares bash commands only with validation commands already discovered from repository files, and may provide one bounded hidden continuation request when enforcement is explicitly enabled.

A passing command is evidence that the recorded command completed successfully for the current known mutation version; it is evidence, not proof of complete correctness or acceptance of every task criterion.

## Current remediation status

The Phase 6 audit remediation is implemented on the dedicated Phase 6 branch. Enforcement remains opt-in and default-off. Focused lifecycle, validation, runtime-event, retry, baseline, and evaluator tests pass, as does the repository `npm run check` gate. The required workspace `npm test` command was also run; its remaining coding-agent failures reproduce on the clean audit-base commit and are outside this Phase 6 diff (environment-scoped skill discovery, CLI/model-runtime fixtures, stale interactive-mode mocks, and the existing lax-message-content case). No live model evaluation or default-enablement claim is made.

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

The runtime creates one bounded discovery snapshot and shares it with the tracker and bash prompt. Discovery is refreshed on runtime reload and after a completed turn when a successful built-in `edit`, `write`, or `apply_patch` mutation targets a validation-defining repository file. A deterministic fingerprint identifies the snapshot: changed discovery marks earlier evidence stale, while an unchanged refresh records a configuration-sensitive limitation. Discovery is not re-run on every turn.

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

`matchValidationCommand()` accepts only commands grounded in `discoverValidationCommands()` output. It normalizes surrounding and repeated whitespace. An exact discovered command is the only scope that can become fresh completion evidence. A simple targeted suffix for a discovered test command is retained as `targeted-unverified` diagnostic evidence, never as fresh blocking evidence, such as:

```text
npm test -- test/example.test.ts
cargo test specific_test
python -m pytest tests/example.py
```

It does not parse a shell and rejects compound commands, pipelines, redirection, and newline-separated commands containing `&&`, `||`, `;`, `|`, `>`, or `<`. It does not classify arbitrary commands by words such as `test`, `lint`, or `build`, and it never executes a command.

No-op or inspection-only invocations such as `npm test -- --help`, `cargo test -- --list`, and `python -m pytest --collect-only` are rejected. Backticks and `$()` substitutions are rejected as well. Detected commands are repository-provided suggestions, not safety approval; the existing command policy still applies.

## 7. Fresh, stale, failed, and concurrent evidence

Evidence is fresh only when it matches a discovered command, is associated with the current mutation version, is not in the same completed tool batch as a known mutation, and is the newest result for that normalized command.

Current-status precedence uses the newest result per command:

1. a fresh failed result means current validation is failed;
2. otherwise, a fresh pass means fresh evidence exists;
3. otherwise, an older mutation-version result is stale; and
4. otherwise, evidence is missing.

When mutation and validation observations arrive in one completed tool batch, Phase 6 records `concurrent-with-mutation` because Native Pi may execute tool calls in parallel and the order is not reliable evidence that validation covered the final files. A later-turn validation may be fresh.

User-run interactive `!` bash commands use the existing command, exit, cancellation, and full-output fields when they pass through `AgentSession.executeBash()`. A cancelled command or a non-zero/unknown exit does not count as a pass. If the command starts while the agent is streaming, while a mutation tool is pending, or while the mutation version changes before it completes, the result is recorded as `concurrent-with-mutation` and cannot be fresh evidence. Extensions that execute bash outside this path remain a known limitation.

## 8. Observe versus enforce behavior

At a would-be stop, the deterministic decision function first allows `off` mode, read-only work with no known mutation, and projects with no discovered validation command. A fresh pass allows completion. Missing, stale, failed, or concurrent evidence is reported without blocking in `observe` mode.

In `enforce` mode, the tracker queues a continuation only when no tool loop is required, no tool results remain for the turn, the assistant response is not an error or abort, and no steering or follow-up message is already queued. A real queued user message takes precedence. The implementation uses the existing follow-up queue; it does not call `prompt()` recursively, create a visible fake user message, or start another agent.

## 9. Bounded hidden continuation

Continuation feedback is a `CustomMessage` with `customType: "execution-integrity-feedback"` and `display: false`. It is visible to the model through the existing message conversion path but is not rendered as a user transcript entry. Its content is capped at 2,000 characters and always offers an accurate alternative to running validation: validation may be prohibited, unsupported, unavailable, or disproportionately expensive, in which case the agent should report what remains unverified.

The tracker increments its continuation counter before queuing feedback. Once the configured limit is reached, it returns `allow` with `continuation-limit-reached`; it cannot loop indefinitely.

## 10. `/context` diagnostics

`AgentSession.getContextInfo()` exposes the bounded snapshot to RPC and SDK consumers. `/context` renders a compact execution-integrity section with mode, known mutations, mutation version, modified-path count, validation state, recorded validation count, unverified targeted-validation count, continuation attempts, bounded limitations, discovery fingerprints, and references to existing full-output files. It does not render complete validation logs or send telemetry externally.

## 11. Known limitations

- Arbitrary bash mutations are not completely classified.
- Same-batch mutation and validation is conservatively ambiguous; Phase 6 does not add a shell parser or execution-order claim.
- Discovery is grounded in existing repository files and does not invent a command for an unknown project.
- Repository-discovered commands are suggestions only; discovery is not a safety policy or permission grant.
- Validation output is not interpreted as proof of task correctness.
- Interactive user-run validation is integrated only through the existing `executeBash()` path; broader extension-owned bash flows are deferred.
- No live model evaluation has been run for Phase 6 in this implementation.
- The Phase 5 empirical exit gate remains outstanding. Phase 5 improvements are not claimed as proven without controlled live results.

## 12. Phase 5 dependency and outstanding empirical gate

Phase 6 reuses Phase 5’s bounded evidence-reference and evaluation discipline. It does not claim that Phase 5 retention or context-integrity changes improve live quality. Any broader Phase 6 enablement depends on controlled evidence for both phases and must keep treatment-only settings separate from shared pair identity.

## 13. Phase 6 live evaluation plan

Compare baseline `executionIntegrity.mode = "off"` with treatment `executionIntegrity.mode = "enforce"` while keeping provider/model, reasoning setting, tools, task input, initial repository state, context window, project instructions, retries, and compaction settings constant except for the explicit treatment setting. Every recorded run must include a `variant`, a `trialId`, and the approved `treatmentConfig.executionIntegrity` fields; baseline runs use `mode: "off"`, Phase 6 runs use `mode: "enforce"`, and `maxContinuationAttempts` may be the only additional treatment field. Pair runs by `workloadId + trialId` so repeated trials do not collapse. Repeat runs where practical because model behavior is nondeterministic.

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

## Native Pi low-level runtime hardening

Phase 6 hardens Native Pi's existing single-agent execution path. It does not add a workflow engine, durable tool journal, automatic tool retry, generic timeout wrapper, or secondary agent runtime.

The execution path remains:

```text
User request -> Agent -> provider turn -> tools -> validation/result -> next turn or terminal event
```

## Goals

A started agent run should:

- settle its promise or event stream;
- emit one terminal `agent_end` event;
- preserve one tool result for every requested tool call;
- stop starting new work after cancellation;
- enforce configured count limits at deterministic boundaries;
- isolate lifecycle-listener failures so one observer cannot strand or corrupt the run;
- preserve completed tool results across provider retries;
- return to an idle state with no pending tool-call identifiers.

## Terminal reasons

`agent_end` may include an optional structured termination reason:

```ts
export type AgentRunTermination =
  | { reason: "completed" }
  | { reason: "aborted"; message?: string }
  | { reason: "error"; message?: string }
  | { reason: "limit"; limit: "turns" | "acceptedToolCalls"; max: number };
```

The field is optional for backward compatibility. `Agent` infers a result for older or custom emitters that do not provide it.

Low-level `agentLoop()` and `agentLoopContinue()` streams now convert unexpected rejected callbacks into the normal failure lifecycle rather than leaving the stream unsettled.

## Listener failure isolation

`Agent.subscribe()` listeners are awaited in registration order. By default they are observational and isolated; the internal `AgentSession` lifecycle handler is registered explicitly as a fatal execution participant because persistence and extension post-hooks are part of the run’s integrity boundary.

If an observational listener rejects:

1. the failure is recorded in bounded latest-run diagnostics;
2. remaining healthy listeners still receive the current event;
3. the failed listener is skipped for the remainder of that run;
4. model and tool execution continue through the normal lifecycle;
5. tool-result pairing and transcript ordering are preserved.

A listener rejection does not change an otherwise successful run into an execution error. The bounded `Agent.lastRunDiagnostics.listenerErrors` list records observer failures; `Agent.state.errorMessage` remains reserved for assistant/provider execution failures and is not populated by an isolated observer error.

If a listener rejects while handling `agent_end`, the failure is recorded but terminalization is not entered again. This prevents duplicate terminal events. Listener isolation is per run, so a listener is eligible again on the next run.

If a fatal listener rejects, the active run is aborted with a marked critical error. The lifecycle terminalizes once with `reason: "error"`, preserves completed messages and tool results, and starts no new provider request or tool batch. A fallback session `agent_end` carries that termination when the internal handler itself failed. Provider/context failures still terminate the run, tool preflight failures still block execution, and tool-result transformation failures remain structured tool errors.

## Optional execution limits

Limits are opt-in and preserve existing behavior when omitted:

```ts
const agent = new Agent({
  executionLimits: {
    maxTurns: 20,
    maxAcceptedToolCalls: 50,
  },
});
```

Both values must be positive integers.

### Turn limit

`maxTurns` is checked before another provider request starts. The current completed turn and its tool results remain in the transcript.

### Tool-call limit

Tool-call batches are atomic with respect to the configured limit. If accepting the entire assistant-requested batch would exceed `maxAcceptedToolCalls`, none of the calls in that batch execute. Each call still receives a paired error tool result, and the run terminates with an `acceptedToolCalls` limit reason.

The limit controls accepted tool calls, not external side effects. It cannot undo a tool that already completed.

## Cancellation

The existing `AbortSignal` remains the cancellation mechanism. `Agent.abort(reason?)` now preserves an optional cancellation reason.

For sequential batches, calls that have not started after cancellation are not executed. They receive paired aborted tool results so provider transcript invariants remain intact.

For parallel batches, already-started tools receive the abort signal. A cooperative tool should stop and release resources. An uncooperative tool or remote service may continue after the harness stops progressing. Phase 6 does not claim that cancellation rolls back or reverses external side effects.

The built-in bash tool retains its existing process-tree termination and explicit per-call timeout behavior.

Relevant platform guidance:

- Node.js `AbortController`, `AbortSignal.reason`, `AbortSignal.timeout()`, and `AbortSignal.any()`: https://nodejs.org/api/globals.html
- Model Context Protocol cancellation and completion-race guidance: https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation

Phase 6 intentionally does not introduce a default generic tool timeout. A timeout can stop waiting, but it cannot prove that an arbitrary remote mutation stopped.

## Provider retry boundary

Provider retry and tool retry remain separate concerns.

The coding-agent retry path removes only the retryable assistant error from active agent state, waits using the existing bounded retry policy, and continues from the already-persisted tool-result boundary. Completed tools are not replayed automatically.

A regression test covers:

```text
provider turn -> tool succeeds -> next provider response fails transiently
-> provider retry continues from tool result -> tool execution count remains one
```

Automatic replay of mutating or ambiguously completed tools was not added. This follows the general idempotency principle that a timed-out mutation is unsafe to retry unless the operation has an explicit idempotency contract:

- AWS Builders' Library, Making retries safe with idempotent APIs: https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/

## Latest-run diagnostics

`Agent.lastRunDiagnostics` exposes one bounded in-memory snapshot:

```ts
interface AgentRunDiagnostics {
  termination: AgentRunTermination;
  turns: number;
  toolCalls: number;
  toolErrors: number;
  terminalEvents: number;
  listenerErrors: string[];
  startedAt: number;
  endedAt: number;
  durationMs: number;
}
```

Diagnostics are not persisted and do not change the session schema. Listener errors are bounded by count and message length.

## Explicit non-goals

Phase 6 does not add:

- a planner, reviewer, or validator agent chain;
- durable orchestration or resumable jobs;
- a tool-call database or journal;
- universal idempotency metadata;
- automatic tool retries;
- rollback for arbitrary shell or remote operations;
- default run-duration or tool-duration limits;
- sandboxing;
- model routing, cost budgets, or token budgets;
- another context or memory subsystem.

## Validation

Focused validation:

```bash
cd packages/agent
node node_modules/vitest/dist/cli.js --run \
  test/execution-integrity.test.ts \
  test/agent-loop.test.ts \
  test/agent.test.ts

cd ../coding-agent
node node_modules/vitest/dist/cli.js --run \
  test/validation-commands.test.ts \
  test/execution-integrity.test.ts \
  test/settings-manager.test.ts \
  test/agent-session-runtime-events.test.ts \
  test/agent-session-retry-integrity.test.ts \
  test/phase6-baseline.test.ts \
  test/phase6-evaluation.test.ts
```

Repository validation:

```bash
cd ../..
npm run check
npm test
```

The focused tests cover low-level stream settlement, post-turn failure lifecycle retention, one-terminal-event behavior, fatal internal versus isolated observer failures, opt-in turn limits, atomic accepted-tool-call limits, cancellation pairing, provider retry without tool replay, exact-only validation evidence, discovery refresh/staleness, user-bash overlap, runtime diagnostics, and evaluator pair identity.

No correctness, latency, or cost improvement should be claimed until these commands pass and representative live coding workloads are evaluated.
