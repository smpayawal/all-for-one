---
name: review-diff
description: Perform a focused final review of a change for regressions, scope drift, and missing evidence.
disable-model-invocation: true
---

# Review a diff

Use this skill manually before handing off a meaningful change.

1. Read the complete diff and check that every changed file is in scope.
2. Check behavior, edge cases, compatibility, security, and error handling at the changed boundary.
3. Confirm tests cover the new behavior and that documentation matches the implementation.
4. Compare reported validation with the commands actually run.
5. Record only actionable findings and state any residual risk.
