# Execution integrity

Execution integrity is an opt-in boundary around known built-in path mutations and repository-grounded validation evidence. It does not execute discovered commands automatically and does not claim that a passing command proves task correctness.

```json
{
  "executionIntegrity": {
    "mode": "observe",
    "maxContinuationAttempts": 1
  }
}
```

Modes are `off`, `observe`, and `enforce`; the default is `off`. Observe records bounded evidence without blocking completion. Enforce may queue at most the normalized continuation bound when a known mutation lacks fresh acceptable evidence. The existing agent queue is used; no recursive prompt or visible fake user message is created.

The tracker observes successful built-in `edit`, `write`, and `apply_patch` mutations, caps modified paths at 128 and validation records at 16, and matches only commands discovered from repository files. Compound shell syntax, pipelines, redirection, substitutions, inspection-only test flags, unknown commands, transformed/custom/remote execution, and cwd mismatches cannot become fresh local validation evidence. Same-batch mutation and validation is recorded as concurrent and remains unverified.

Bash prompt guidance follows the mode: off shows no validation guidance, observe shows one bounded advisory command, and enforce shows at most four grounded commands within an 800-character bound. Guidance is advisory and does not grant command permission.

`/context` reports the mode, mutations, validation state, bounded records, continuation attempts, provenance references, and limitations. No live paired evaluation has established a quality, latency, token, or cost benefit; enforcement remains opt-in.
