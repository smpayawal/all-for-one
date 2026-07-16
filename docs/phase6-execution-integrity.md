# Phase 6 execution integrity

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
  | { reason: "limit"; limit: "turns" | "toolCalls"; max: number };
```

The field is optional for backward compatibility. `Agent` infers a result for older or custom emitters that do not provide it.

Low-level `agentLoop()` and `agentLoopContinue()` streams now convert unexpected rejected callbacks into the normal failure lifecycle rather than leaving the stream unsettled.

## Listener failure isolation

`Agent.subscribe()` listeners are awaited in registration order, but they are observers rather than execution-control hooks.

If a listener rejects:

1. the failure is recorded in bounded latest-run diagnostics;
2. remaining healthy listeners still receive the current event;
3. the failed listener is skipped for the remainder of that run;
4. model and tool execution continue through the normal lifecycle;
5. tool-result pairing and transcript ordering are preserved.

A listener rejection does not change an otherwise successful run into an execution error. `Agent.state.errorMessage` surfaces the latest observer failure for compatibility and diagnostics, while `Agent.lastRunDiagnostics.termination` continues to describe the actual runtime outcome.

If a listener rejects while handling `agent_end`, the failure is recorded but terminalization is not entered again. This prevents duplicate terminal events. Listener isolation is per run, so a listener is eligible again on the next run.

Callbacks that participate in execution are not treated as passive listeners. Provider/context failures still terminate the run, tool preflight failures still block execution, and tool-result transformation failures remain structured tool errors.

## Optional execution limits

Limits are opt-in and preserve existing behavior when omitted:

```ts
const agent = new Agent({
  executionLimits: {
    maxTurns: 20,
    maxToolCalls: 50,
  },
});
```

Both values must be positive integers.

### Turn limit

`maxTurns` is checked before another provider request starts. The current completed turn and its tool results remain in the transcript.

### Tool-call limit

Tool-call batches are atomic with respect to the configured limit. If accepting the entire assistant-requested batch would exceed `maxToolCalls`, none of the calls in that batch execute. Each call still receives a paired error tool result, and the run terminates with a `toolCalls` limit reason.

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
npx vitest --run test/execution-integrity.test.ts test/agent-loop.test.ts test/agent.test.ts

cd ../coding-agent
npx vitest --run test/agent-session-retry-integrity.test.ts
```

Repository validation:

```bash
cd ../..
npm run check
npm test
```

The focused tests cover low-level stream settlement, one-terminal-event behavior, observer isolation at assistant and tool-result boundaries, opt-in turn limits, atomic tool-call limits, cancellation pairing, and provider retry without tool replay.

No correctness, latency, or cost improvement should be claimed until these commands pass and representative live coding workloads are evaluated.
