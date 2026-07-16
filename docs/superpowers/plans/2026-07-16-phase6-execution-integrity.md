# Phase 6 Execution Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Native Pi's existing single-agent execution lifecycle so failures, limits, cancellation, and provider retries terminate coherently without adding a second runtime, durable journal, or workflow engine.

**Architecture:** Keep the current `Agent -> agent-loop -> tools -> session listeners` path. Add small optional execution-limit metadata, one terminal-reason contract, listener-failure isolation inside `Agent`, and deterministic cancellation handling for unstarted tool calls. Preserve existing defaults and extension behavior.

**Tech Stack:** TypeScript, Node.js `AbortSignal`, Vitest, existing Pi `EventStream`, no new dependencies.

## Global Constraints

- Preserve the single adaptive Native Pi agent path.
- Do not add a workflow engine, durable tool journal, automatic tool retry, or generic timeout wrapper.
- Existing behavior remains the default; execution limits are opt-in.
- Completed tool results must remain in source order and must never be replayed automatically.
- Every production-code change must be preceded by a failing regression test.
- Keep public API additions optional and backward compatible.
- Validate with focused `packages/agent` tests, monorepo `npm run check`, and `npm test`.

---

### Task 1: Failure-injection baseline and direct stream settlement

**Files:**
- Create: `packages/agent/test/execution-integrity.test.ts`
- Modify: `packages/agent/src/agent-loop.ts`

**Interfaces:**
- Consumes: existing `agentLoop()`, `Agent`, `AgentEvent`, and `EventStream`.
- Produces: a shared low-level failure lifecycle that settles direct `agentLoop()` streams with one `agent_end` event.

- [ ] **Step 1: Write failing direct-stream test**

```ts
it("settles the low-level event stream when context conversion rejects", async () => {
  const stream = agentLoop([createUserMessage("hello")], createContext(), {
    model: createModel(),
    convertToLlm: async () => {
      throw new Error("conversion exploded");
    },
  });

  const events = await collectEvents(stream);
  expect(events.filter((event) => event.type === "agent_end")).toHaveLength(1);
  await expect(stream.result()).resolves.toHaveLength(1);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
cd packages/agent
npx vitest --run test/execution-integrity.test.ts -t "settles the low-level event stream"
```

Expected: FAIL because the stream never reaches a terminal result when `runAgentLoop()` rejects.

- [ ] **Step 3: Add minimal failure-lifecycle helper**

Implement a small helper in `agent-loop.ts` that creates one synthetic assistant failure message, emits `message_start`, `message_end`, `turn_end`, and `agent_end`, and ends the returned `EventStream`.

- [ ] **Step 4: Run focused test and verify GREEN**

Run the same Vitest command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/test/execution-integrity.test.ts packages/agent/src/agent-loop.ts
git commit -m "fix(agent): settle low-level loop failures"
```

---

### Task 2: Terminal reason contract and listener failure isolation

**Files:**
- Modify: `packages/agent/src/types.ts`
- Modify: `packages/agent/src/agent.ts`
- Test: `packages/agent/test/execution-integrity.test.ts`

**Interfaces:**
- Produces: `AgentRunTermination`, optional `AgentEvent.agent_end.termination`, and `Agent.lastRunDiagnostics`.

- [ ] **Step 1: Write failing listener tests**

Add tests proving:

```ts
it("emits one terminal event when a non-terminal listener rejects", async () => {
  // one listener throws on the first assistant message_start
  // a healthy listener must still observe exactly one agent_end
  // the run must settle and the agent must become idle
});

it("does not re-enter terminalization when an agent_end listener rejects", async () => {
  // one listener throws only on agent_end
  // a healthy listener sees exactly one agent_end
  // the normal assistant result remains the final transcript message
});
```

- [ ] **Step 2: Verify RED**

Expected: current listener rejection can interrupt lifecycle processing or cause a second failure path.

- [ ] **Step 3: Add optional terminal metadata**

```ts
export type AgentRunTermination =
  | { reason: "completed" }
  | { reason: "aborted"; message?: string }
  | { reason: "error"; message?: string }
  | { reason: "limit"; limit: "turns" | "toolCalls"; max: number };
```

Extend `agent_end` with optional `termination` for compatibility.

- [ ] **Step 4: Isolate failing listeners per active run**

Track listeners that fail during the current run. Notify all healthy listeners, skip a failed listener for subsequent events in that run, and never launch a second failure lifecycle after `agent_end` has already been emitted.

- [ ] **Step 5: Add bounded latest-run diagnostics**

Expose a read-only getter containing termination, turn count, tool-call count, tool-error count, terminal-event count, and listener-error messages. Keep it in memory only.

- [ ] **Step 6: Verify GREEN and commit**

```bash
git add packages/agent/src/types.ts packages/agent/src/agent.ts packages/agent/test/execution-integrity.test.ts
git commit -m "fix(agent): isolate lifecycle listener failures"
```

---

### Task 3: Optional turn and tool-call limits

**Files:**
- Modify: `packages/agent/src/types.ts`
- Modify: `packages/agent/src/agent.ts`
- Modify: `packages/agent/src/agent-loop.ts`
- Test: `packages/agent/test/execution-integrity.test.ts`

**Interfaces:**
- Produces: `ExecutionLimits { maxTurns?: number; maxToolCalls?: number }` on `AgentOptions` and `AgentLoopConfig`.

- [ ] **Step 1: Write failing max-turn test**

```ts
it("stops before another provider request when maxTurns is reached", async () => {
  // first provider response requests a tool
  // tool completes
  // maxTurns: 1 prevents the second provider request
  // agent_end termination is { reason: "limit", limit: "turns", max: 1 }
});
```

- [ ] **Step 2: Write failing max-tool-call test**

```ts
it("rejects an oversized tool batch without partially executing it", async () => {
  // assistant requests two tools with maxToolCalls: 1
  // neither tool executes
  // both calls receive error tool results
  // termination reports the toolCalls limit
});
```

- [ ] **Step 3: Verify RED**

Expected: both tests fail because limits are not implemented.

- [ ] **Step 4: Implement validated opt-in limits**

Require positive integers when provided. Check `maxTurns` before each provider request. Treat a tool-call batch atomically: if executing the whole batch would exceed `maxToolCalls`, execute none of it and return paired error tool results.

- [ ] **Step 5: Verify GREEN and commit**

```bash
git add packages/agent/src/types.ts packages/agent/src/agent.ts packages/agent/src/agent-loop.ts packages/agent/test/execution-integrity.test.ts
git commit -m "feat(agent): add optional execution limits"
```

---

### Task 4: Cancellation pairing for unstarted tool calls

**Files:**
- Modify: `packages/agent/src/agent-loop.ts`
- Test: `packages/agent/test/execution-integrity.test.ts`

**Interfaces:**
- Preserves: one tool result for every assistant tool call, including calls skipped after cancellation.

- [ ] **Step 1: Write failing sequential-cancellation test**

```ts
it("does not execute later sequential tools after cancellation and still pairs their results", async () => {
  // first tool aborts the active signal and completes
  // second tool must not execute
  // second call receives an aborted error result
  // termination reason is aborted
});
```

- [ ] **Step 2: Verify RED**

Expected: current sequential execution may stop without producing results for remaining tool calls.

- [ ] **Step 3: Implement deterministic skipped-call failures**

Before each sequential tool and during parallel preflight, check the signal. For every unstarted call after cancellation, emit a normal start/end lifecycle with an aborted error result. Preserve source ordering.

- [ ] **Step 4: Verify GREEN and commit**

```bash
git add packages/agent/src/agent-loop.ts packages/agent/test/execution-integrity.test.ts
git commit -m "fix(agent): preserve tool-result pairing on abort"
```

---

### Task 5: Provider retry regression and Phase 6 documentation

**Files:**
- Modify or create focused retry test under `packages/coding-agent/test/`
- Create: `docs/phase6-execution-integrity.md`
- Modify: `package.json` only if a deterministic Phase 6 doctor script is justified by implemented checks.

**Interfaces:**
- Documents and tests the existing rule: provider retries continue from persisted tool results and never re-execute completed tools.

- [ ] **Step 1: Add regression test**

Create a session scenario where a tool succeeds, the following provider response fails retryably, and the retry succeeds. Assert the tool execute counter remains one.

- [ ] **Step 2: Verify the test against existing behavior**

If the test already passes, retain it as a regression contract and do not change retry production code.

- [ ] **Step 3: Write Phase 6 documentation**

Document scope, invariants, settings/API, diagnostics, cancellation limitations, explicit non-goals, and validation commands. State clearly that timeouts cannot undo remote side effects and that no tool retry framework was added.

- [ ] **Step 4: Run final verification**

```bash
cd packages/agent
npx vitest --run test/execution-integrity.test.ts test/agent-loop.test.ts test/agent.test.ts
cd ../..
npm run check
npm test
```

Expected: all commands pass with no warnings.

- [ ] **Step 5: Review the branch diff**

Confirm there are no new dependencies, no duplicate runtime, no session schema migration, and no unrelated refactor.
