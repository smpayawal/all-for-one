# Context integrity diagnostics

Context integrity is implemented as bounded diagnostics around Native Pi's existing context, compaction, and tool-result paths. It does not add a second context manager, embeddings, vector retrieval, automatic memory extraction, or a delegate runtime.

Run the deterministic fixture report with:

```bash
npm run baseline:context -- --json
npm run evaluate:context -- --help
```

The fixture scenarios cover constraint survival, superseded decisions, repeated compaction, split turns, large evidence, and interrupted continuation. They report marker disposition, compaction boundaries, serialized evidence size, truncation, saved-output retrieval, repeated reads, and explicit limitations. They do not prove that a model will follow or reconcile the retained text.

The runtime preserves exact user-message retention disabled by default, bounded evidence references, structural compaction validation, one repair attempt, and the existing Native Pi session format. See [compaction.md](compaction.md) for compaction telemetry and [known-limitations.md](known-limitations.md) for unmeasured live behavior.

Recorded evaluator inputs use schema version 3 with `evaluationType: "context-integrity"`. The parser migrates the prior version-2 `phase: "context-live-evaluation"` field to the current capability field without invoking a provider.
