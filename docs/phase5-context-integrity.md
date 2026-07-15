# Phase 5.0 context integrity baseline

Phase 5 begins with context-integrity evidence, not another context manager. P5.0 is a deterministic, offline foundation for observing how the existing Native Pi compaction and session reconstruction paths treat critical state across context boundaries.

## Boundary

P5.0 does not change production behavior. It does not change compaction prompts or cut-point policy, session-entry formats, telemetry semantics, `/context`, or the active tool/skill model. It does not add anchors, evidence-reference records, embeddings, vector search, a second summarizer, automatic memory extraction, or delegate execution.

The runner uses only in-memory fixtures and existing implementation paths:

- `prepareCompaction()` for native cut-point and previous-summary preparation;
- `buildSessionContext()` and `estimateContextTokens()` for the post-boundary view;
- `serializeConversation()` for the existing bounded tool-result representation; and
- `ToolOutputTelemetryStore` for truncation, saved-output follow-up, and repeated-read observations.

No provider, network, extension, database, or fixture file is used.

## Running the baseline

```bash
npm run baseline:phase5 -- --help
npm run baseline:phase5 -- --json
npm run baseline:phase5 -- --json --cwd /tmp
```

`--json` emits the complete schema-version-1 report. `--cwd` controls the telemetry path root used by the in-memory observation; the runner does not create that path or write output. Without `--json`, the command prints a compact scenario summary.

## Scenarios

| Scenario | Structural observation |
| --- | --- |
| `constraint-survival` | A critical constraint is in the summarized range while the newest follow-up remains exact. |
| `superseded-decision` | An older decision is summarized while a correction remains in the retained exact suffix. |
| `repeated-compaction` | Two native compaction preparations exercise iterative use of the previous summary. |
| `split-turn` | An assistant-boundary cut records the native split-turn path and retains the suffix. |
| `large-evidence` | A tool result exceeds the existing serialization bound, then exercises saved-output follow-up and repeated-read telemetry. |

Each scenario reports compaction count, before/after token samples where applicable, previous-summary use, split-turn detection, critical-marker disposition, tool-call count, and explicit limitations. The evidence scenario also reports raw versus serialized characters, tail-marker retention, truncations, follow-up retrievals, and repeated reads.

## Interpretation

The report is structural fixture evidence. A `summarized` marker means the fixture placed the marker in the native summarized range and included it in the deterministic summary string. A `recent-exact` marker means it remained in the exact retained suffix. `not-retained` means the marker was outside the serialized/retained representation. These dispositions do not establish that a model would follow, reconcile, or correctly use the content.

P5.0 also does not measure task correctness, model answer quality, latency, cost, provider token accounting, cache behavior, or compaction-induced regressions. The deterministic summaries are test inputs, not new production summary prompts.

## P5.1-P5.2 retention contract and prompt hardening

The next Phase 5 slice now defines six deterministic retention classes in the native compaction package: `invariant`, `session-anchor`, `summary-state`, `recent-exact`, `external-evidence`, and `ephemeral`. The contract is a prompt/documentation boundary, not a per-message classifier or a new persistence layer.

Initial and iterative native summaries now explicitly instruct the summarizer to:

- preserve active user constraints and corrections;
- keep goal, progress, decisions, blockers, and validation state as continuation state;
- record exact validation commands, status, and error strings when available;
- preserve exact paths, symbols, commands, identifiers, and evidence references;
- treat the previous summary as authoritative continuation state; and
- mark superseded decisions as superseded instead of leaving stale and active decisions ambiguous.

Invariant project and path-scoped instructions remain outside the summary and are not duplicated as session anchors.

Native compactions are structurally validated before they are appended to the session. The validator requires the six existing top-level sections, a non-empty goal, a bounded summary size, a valid non-compaction `firstKeptEntryId`, finite token metadata, string file-operation arrays, valid retained-user entry IDs, and well-formed evidence references. A malformed native result aborts the compaction before session state is written. Extension-provided summaries remain under the extension contract and are not forced into the native summary schema.

## P5.3 bounded exact user-message retention

The native compaction settings support an opt-in bounded experiment:

```json
{
  "compaction": {
    "retainRecentUserMessages": 3,
    "retainRecentUserMessageChars": 6000
  }
}
```

The default count is `0`, so existing sessions keep the prior behavior until a workload evaluation enables the experiment. When enabled, the selector walks the summarized range from newest to oldest, keeps only complete user-authored messages, enforces both the count and character caps, and omits a message rather than truncating it. The resulting exact text is appended under `## Retained User Context`; `CompactionDetails` records the source entry IDs for diagnostics.

This is bounded exact retention, not automatic semantic anchoring. It does not classify every message, persist a new memory store, or retain assistant/tool history outside the native recent suffix.

## P5.4 lightweight evidence references

When a tool result or bash execution already carries an explicit `fullOutputPath`, compaction serialization preserves that path as an evidence reference. Native compaction carries deduplicated references into the summary under `## Evidence References` and records them in `CompactionDetails.evidenceRefs`. Repeated compactions inherit prior native references. No new output file or evidence database is created by this feature.

The reference is only a pointer to an existing saved output. It does not claim that the file still exists or that the model has retrieved it; the existing tool-output telemetry remains the source for follow-up and repeated-read measurements.

## P5.5 telemetry-driven tool-output lifecycle

No automatic tool-output compression or eviction policy is enabled in this slice. Native truncation, saved full-output paths, and Phase 4 telemetry remain the measurement boundary. A future policy should be enabled only after paired workloads show that older large outputs cause meaningful context pressure without making the model spend more turns rediscovering omitted information.

## P5.6 compaction health in `/context`

`AgentSession.getContextInfo()` now reports a local compaction-health snapshot for the current session path, and `/context` renders it when requested. The snapshot includes compaction count, latest tokens before/after, reduction percentage, summary size, retained user-message count, and evidence-reference count. The post-boundary token estimate uses the repository’s existing estimator and is not provider-token accounting.

## Next gate

Before enabling exact user-message retention by default or expanding correction/evidence policy, run paired baseline-versus-Phase-5 workloads with the same model, task inputs, and context-window conditions. Include short and long sessions, corrections, split turns, large outputs, and interrupted continuation. Record correctness, constraint/correction retention, rediscovery, turns, prompt and cumulative tokens, truncation/retrieval behavior, latency, cost, cache behavior, and regressions.

That live gate determines whether a bounded retention contract or additional evidence references are justified. P5.0 intentionally leaves those policy changes deferred.

## Validation

Focused P5.0 coverage:

```bash
cd packages/coding-agent
node node_modules/vitest/dist/cli.js --run test/phase5-baseline.test.ts
```

The Phase 4 structural gates remain complementary:

```bash
npm run doctor:phase4 -- --json
npm run baseline:phase4 -- --json
```

Focused retention-contract coverage:

```bash
cd packages/coding-agent
node node_modules/vitest/dist/cli.js --run test/compaction-retention.test.ts
node node_modules/vitest/dist/cli.js --run test/compaction-validation.test.ts test/compaction-serialization.test.ts test/compaction-health.test.ts
node node_modules/vitest/dist/cli.js --run test/settings-manager.test.ts
```
