---
name: systematic-debugging
description: Reproduce a bug, trace the earliest incorrect boundary, and verify the smallest root-cause fix.
---

# Systematic debugging

1. Reproduce the reported behavior at the narrowest available boundary.
2. Trace inputs and state through the failing path until the first incorrect value or decision is identified.
3. State a testable hypothesis and inspect the closest implementation, instructions, and regression tests.
4. Make the smallest fix that addresses the cause, then rerun the reproduction and the focused regression check.
5. Report evidence, remaining uncertainty, and any validation that could not run.
