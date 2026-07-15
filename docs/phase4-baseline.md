# Phase 4.0 baseline

The baseline command measures the current All-For-One resource and prompt composition without changing Native Pi runtime behavior.

Run it from the repository root:

```bash
npm run baseline:phase4
```

For machine-readable output:

```bash
npm run baseline:phase4 -- --json
```

The command runs in source mode through the existing `tsx` dependency and the repository's `tsconfig.json` source aliases. Resource discovery is offline and read-only: installed resources may be read, but missing package sources are not installed, network update checks are disabled, and extensions are not executed.

## Measurements

The report includes:

- discovered, visible, and manual-only skill counts;
- skill metadata character, byte, and approximate token sizes;
- skill diagnostics by type;
- project instruction file counts and sizes, without printing file contents;
- registered and active built-in tool names;
- active built-in tool schema and prompt-snippet sizes;
- built system-prompt size and source classification;
- synthetic skill collections for representative collection sizes;
- comparison with representative context windows.

## Representative workload plan

The report carries a small workload plan for later live evaluation:

- small bug fix;
- multi-file feature;
- refactor;
- test failure;
- unfamiliar repository exploration;
- large command output;
- long session;
- documentation task;
- high-risk architecture change.

The current command deliberately does not execute model tasks. Each category records the metrics that should be collected when a controlled model/evaluation environment is available.

Default synthetic collections are `0, 2, 10, 50, 100, 500` skills. The synthetic and baseline prompt measurements explicitly disable the production metadata cap so P4.0 remains a pre-policy comparison. Default context windows are `8192, 16384, 32768, 128000, 1000000` tokens. Override them with repeatable options:

```bash
npm run baseline:phase4 -- \
  --context-window 8192 \
  --context-window 32768 \
  --skill-count 2 \
  --skill-count 50
```

Use `--cwd`, `--agent-dir`, and repeatable `--skill-path` to measure another resource setup. `--no-skills` and `--no-context-files` isolate the remaining prompt sources.

## Interpretation boundaries

The 2% value is reported only as an external comparison based on [Codex issue #19679](https://github.com/openai/codex/issues/19679). This command does not enforce a budget, truncate metadata, or claim that 2% is optimal for All-For-One. `omittedSkills` remains empty because no budget policy exists in P4.0.

Token counts use the repository's four-characters-per-token estimate, not provider tokenization. The baseline command does not execute a live session, so it does not measure task correctness, latency, cost, compaction/retry outcomes, tool-result byte telemetry, repeated reads, or follow-up retrieval. Those remain outside the P4.0 command's scope, not inferred results.
