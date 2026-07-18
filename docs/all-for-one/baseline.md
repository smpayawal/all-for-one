# All-For-One offline baseline

The baseline measures resource and prompt composition without running a model, loading extensions, or changing the workspace.

```bash
npm run baseline:allforone -- --json
```

It reports discovered/visible/manual-only skills, metadata characters/bytes/estimated tokens, project instruction sizes, registered and active built-in tools, active tool-schema and prompt-snippet sizes, system-prompt size, and synthetic skill collections. Token values use the repository estimate, not provider tokenization. The 2% comparison in the report is an external reference only; it is not an All-For-One target.

The baseline deliberately leaves the production skill budget disabled so the pre-policy collection can be measured. Runtime budget behavior is covered by the structural doctor and skill tests.

The baseline is not a live quality, latency, cost, or token-savings benchmark. Those measurements require paired model runs with identical task inputs and controlled environment state.

## Lightweight real-use evaluation

The baseline report contains a deferred evaluation plan; it does not run provider tasks. For an optional manual evaluation, use the same provider/model, context window, task input, initial session state, and controlled configuration for paired baseline and All-For-One runs. Record human-assessed correctness and the evidence below. `scripts/context-evaluation.ts` and `scripts/execution-evaluation.ts` validate paired records; they do not invoke a provider.

| Scenario | Minimum evidence |
| --- | --- |
| Repository orientation | completion, relevant files, validation, turns, tool calls |
| Small localized bug fix | regression validation, incorrect edits, turns, tool calls |
| Multi-file refactor | correctness, regressions, validation, context occupancy |
| Failing-test diagnosis | root cause, validation, repeated reads, turns |
| Tool-profile switching | active tools, profile transitions, prompt boundary |
| Large tool output | raw/injected bytes, truncation, follow-up retrieval |
| Context compaction | compaction, context occupancy, resumed correctness |
| Safe-mode denial | blocked action, approval path, unsafe operation count |
| Interrupted command | termination classification, descendant cleanup, recovery |
| Provider/tool failure recovery | failure classification, recovery, unresolved errors |
| Resume existing session | restore success, context continuity, validation |
| Unprofiled-model fallback | fallback profile, active tools, prompt boundary |

Record each trial with this minimal template:

```text
scenario:
trial_id:
date:
commit:
provider_model:
context_window:
task_input_hash:
initial_context_hash:
controlled_config_hash:
outcome: pass | fail | unknown
validation_commands_and_results:
incorrect_edits:
unnecessary_tool_calls:
model_turns:
approximate_tokens:
elapsed_ms:
cancellation_or_recovery:
unresolved_errors:
human_quality_notes:
limitations:
```

Do not infer quality, cost, latency, or reliability improvement from a single run or from the offline baseline. Publish a comparison only after the paired records share the required controls and their limitations are stated.
