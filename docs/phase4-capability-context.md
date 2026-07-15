# Phase 4 capability and context enablement

Phase 4 extends the Phase 3 Native Pi runtime incrementally. The primary path remains one adaptive agent using the existing tool registry, progressive skill loader, session state, and validation loop. No mandatory multi-agent hierarchy, vector database, embeddings pipeline, or automatic memory extraction was added.

## Evidence boundary

The P4.0 baseline measured the current workspace with two visible skills: 1,895 metadata characters (approximately 474 repository-estimated tokens). A synthetic 500-skill collection measured 102,868 characters (approximately 25,717 estimated tokens). These measurements justify bounded metadata and diagnostics, but they do not establish an optimal budget.

The baseline report also defines nine representative live-evaluation categories: small bug fix, multi-file feature, refactor, test failure, unfamiliar repository exploration, large command output, long session, documentation task, and high-risk architecture change. Live model execution remains explicitly deferred; the report records the metrics to collect rather than fabricating task outcomes.

The documented Codex behavior of reserving approximately 2% of context for skill metadata is an external comparison only ([Codex issue #19679](https://github.com/openai/codex/issues/19679)). All-For-One uses a provisional 8,000-character default, supports explicit configuration, and reports what was omitted. The implementation does not claim that 2% is optimal for Native Pi.

The Handoff Debt study reports lower rediscovery cost for context-bearing handoffs in its evaluated scenarios ([arXiv:2606.02875](https://arxiv.org/abs/2606.02875)). This supports concise structured continuation state; it does not support a claim that more agents are inherently better.

## Metric status

| Metric | Current source | Status |
| --- | --- | --- |
| Resource sizes, approximate tokens, active tools, tool schemas, and prompt composition | P4.0 baseline | Measured offline and reproducibly. |
| Runtime context usage and persistent-context diagnostics | `AgentSession.getContextInfo()` and `/context` | Available during a session. |
| Raw/returned tool-output sizes, truncation, repeated reads, and saved-output follow-up retrieval | `AgentSession` telemetry and `/context` | Instrumented during a session; no quality or cost claim is inferred. |
| Task completion, correctness, regressions, turns, provider token accounting, latency, cost, and cache behavior | Controlled model workload evaluation | Deferred; the repository-only baseline does not execute model tasks. |

The deferred measurements are intentionally not represented as Phase 4 improvements. They require repeatable task fixtures, selected models, and a controlled evaluation environment.

## Research decision record

| Feature | Source and implementation inspected | All-For-One finding | Recommendation | Validation |
| --- | --- | --- | --- | --- |
| Progressive skills | Native Pi [`skills.ts`](/Users/smpayawal/Downloads/Projects/all-for-one/packages/coding-agent/src/core/skills.ts) | Progressive discovery and manual-only semantics already exist. | Adapt minimally; do not build a second loader. | Skill loader and budget tests. |
| Skill metadata budget | [Codex issue #19679](https://github.com/openai/codex/issues/19679) plus the P4.0 baseline | Large synthetic collections can exceed small context windows; Codex's 2% behavior is a comparison, not All-For-One evidence. | Use a configurable provisional cap and report omissions. | Baseline across collection/context sizes and deterministic budget tests. |
| Tool-output hygiene | Native Pi [`truncate.ts`](/Users/smpayawal/Downloads/Projects/all-for-one/packages/coding-agent/src/core/tools/truncate.ts) and current tool details | Truncation and saved full-output paths already exist; a new compression subsystem is not justified by current evidence. | Instrument the existing result boundary only. | Session telemetry tests and `/context`. |
| Structured continuation | [Handoff Debt study](https://arxiv.org/abs/2606.02875) and Native Pi session primitives | Context-bearing handoffs may reduce rediscovery, but no All-For-One delegate-quality result exists yet. | Keep a small optional handoff contract; defer delegate execution. | Contract validation and same-ID continuation tests. |

## Capability surface

P4.1 keeps the definition-first registry as the source of truth. The registry distinguishes all known tools from the active set, preserves the existing allowlist/denylist controls, and exposes source and active-state information through `AgentSession.getContextInfo()` and `/context`. Optional tools are not made active merely because they exist.

The existing allowlist/denylist regressions remain the policy tests ([#5109](/Users/smpayawal/Downloads/Projects/all-for-one/packages/coding-agent/test/suite/regressions/5109-exclude-tools.test.ts), [#2835](/Users/smpayawal/Downloads/Projects/all-for-one/packages/coding-agent/test/suite/regressions/2835-tools-allowlist-filters-extension-tools.test.ts)).

## Skill metadata budgeting

The existing progressive loader still discovers skill metadata without loading every `SKILL.md` body. Model-visible skills are now:

- sorted deterministically by name and canonical path;
- deduplicated by model-visible name and canonical path;
- filtered so `disable-model-invocation` skills remain manual-only;
- rendered under a character budget with a compact name/location fallback;
- reported through `SkillMetadataDiagnostics`.

Configure the budget in settings:

```json
{
  "skillMetadataBudget": {
    "maxChars": 8000
  }
}
```

`maxChars` takes precedence. `maxContextPercent` can be used when the active model exposes a context window; unknown context falls back to the fixed default. Diagnostics include discovered, visible, manual-only, rendered, omitted, duplicate, truncation, budget, and byte counts. Full skill instructions are still read only when a skill is intentionally selected.

When a budget omits entries, diagnostics retain the omitted skill names and `/context` shows a bounded preview. Existing `/skill:name` commands and autocomplete remain the intentional manual discovery path for entries that are not model-visible.

## Scoped project context and observability

Startup context remains limited to the global instruction file and the ancestor chain of the current working directory. Nested repository instruction files are resolved on demand for path-bearing `read`, `edit`, `write`, `grep`, `find`, `ls`, and `apply_patch` calls. The lookup is bounded to the project root and does not recursively preload unrelated directories.

Context files are canonicalized and exact-content hashes are used to remove duplicates. Diagnostics report active/discovered counts, bytes, duplicate paths/content, and deterministic warnings for oversized files. `/context` shows the active files, approximate prompt usage, skills, active/inactive tools, prompt snippets, tool-schema size, and warnings.

The active instruction set is a session snapshot: a changed or deleted instruction file takes effect after the normal resource/session reload boundary, rather than mutating an in-flight prompt invisibly. Newly relevant nested files are loaded during the path preflight for the current session.

Bash working-directory changes are not inferred because arbitrary shell control flow cannot be resolved safely; explicit path-bearing tool calls are the supported trigger for scoped instruction activation.

## Tool-output telemetry

The session records output telemetry after the existing tool-result boundary. Per-tool diagnostics include calls, successes/failures, raw versus returned bytes/lines, truncation counts and causes, full-output availability, follow-up reads of saved full output, and repeated reads. This instruments the current behavior before any output-compression policy is changed. No latency, cost, or quality improvement is claimed from telemetry alone.

## Explicit local memory

Project memory is opt-in and stored outside the repository at the agent-scoped path:

```text
<agentDir>/projects/<project-id>/memory.jsonl
```

The small JSONL store supports show/inspect, plain-text search, add, ID-based edit, and forget/delete. Entries are advisory evidence, are not injected wholesale into prompts, and are never written automatically by the runtime. Secret-pattern scanning runs before persistence and is intentionally described as practical protection rather than complete secret detection. Malformed entries remain visible as warnings instead of becoming authoritative.

Interactive commands:

```text
/memory show
/memory search <query>
/memory add <fact>
/memory edit <id> <fact>
/memory forget <id>
```

## Optional handoff contract

P4.6 adds a small exported structured handoff contract with `complete`, `partial`, and `blocked` statuses, goal/summary, completed and remaining work, evidence, validation, and same-ID continuation through `previousId`. It does not add a mandatory delegate executor. A future bounded read-only delegate remains experimental until a real evaluation demonstrates lower context use, lower cost/latency, better defect detection, better handoff efficiency, or higher correctness without unacceptable reliability loss.

## Doctor and validation

Run the deterministic structural gate with:

```bash
npm run doctor:phase4 -- --json
```

The doctor checks tool registry integrity, default capability exposure, bounded skill metadata and deterministic ordering, unsupported-budget fallback, malformed/colliding skill metadata, a bounded-versus-P4.0 baseline comparison, context hash deduplication, oversized-context warnings, memory location and secret scanning, the structured handoff contract, outside-root rejection, and path-scoped context behavior. It runs offline and does not execute extensions.

The P4.0 baseline and the Phase 4 doctor are complementary. The baseline measures prompt/resource composition; the doctor checks structural invariants. Neither currently proves live task correctness, latency, cost, compaction/retry impact, or model-quality improvement. Those require representative workload evaluations across context-window sizes and models.

Focused tests and the repository gate are:

```bash
cd packages/coding-agent
node node_modules/vitest/dist/cli.js --run test/skills.test.ts test/system-prompt.test.ts test/resource-loader.test.ts test/agent-session-dynamic-tools.test.ts test/memory.test.ts test/handoff.test.ts test/phase4-doctor.test.ts
cd ../..
npm run check
```
