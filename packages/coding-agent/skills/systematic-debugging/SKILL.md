---
name: systematic-debugging
description: Use when behavior is broken, failing, flaky, unexpectedly slow, or has regressed. Establish a reproducible feedback loop, trace the earliest incorrect boundary, test falsifiable hypotheses, implement the smallest root-cause fix, and rerun focused validation. Do not use for ordinary feature development.
---

# Systematic debugging

Use this workflow for defects and regressions, not for ordinary implementation work.

1. Reproduce the behavior at the narrowest reliable boundary. Record the exact input, command, environment, and observed result.
2. Trace data, state, and lifecycle transitions until the earliest incorrect value, decision, or side effect is found. Treat later failures as symptoms until proven otherwise.
3. State one falsifiable hypothesis. Inspect or instrument only the closest boundary needed to confirm or reject it.
4. Compare the failing path with the nearest working path, relevant tests, and applicable project instructions.
5. Add a focused regression test when a stable behavioral seam exists. Avoid tests that only mirror the implementation.
6. Make the smallest cohesive change that fixes the identified cause. Do not include speculative cleanup or unrelated refactoring.
7. Rerun the reproduction and the smallest decisive validation, then broaden checks according to the affected boundary.
8. Remove temporary instrumentation and report the evidence, remaining uncertainty, and validation that could not run.

Do not guess at causes, stack multiple untested fixes, or call a symptom workaround a root-cause correction.
