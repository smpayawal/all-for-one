# All-For-One offline baseline

The baseline measures resource and prompt composition without running a model, loading extensions, or changing the workspace.

```bash
npm run baseline:allforone -- --json
```

It reports discovered/visible/manual-only skills, metadata characters/bytes/estimated tokens, project instruction sizes, registered and active built-in tools, active tool-schema and prompt-snippet sizes, system-prompt size, and synthetic skill collections. Token values use the repository estimate, not provider tokenization. The 2% comparison in the report is an external reference only; it is not an All-For-One target.

The baseline deliberately leaves the production skill budget disabled so the pre-policy collection can be measured. Runtime budget behavior is covered by the structural doctor and skill tests.

The baseline is not a live quality, latency, cost, or token-savings benchmark. Those measurements require paired model runs with identical task inputs and controlled environment state.
