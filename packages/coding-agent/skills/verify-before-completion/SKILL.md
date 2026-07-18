---
name: verify-before-completion
description: Run proportionate validation and report only checks that actually ran.
disable-model-invocation: true
---

# Verify before completion

1. Choose the smallest relevant check for the changed boundary.
2. Run it from the repository's documented working directory and read the complete result.
3. Run broader validation when the change affects shared or public behavior.
4. Distinguish focused tests, repository checks, full suites, builds, and manual smoke tests.
5. Report exact commands and outcomes. Never claim an unrun check passed.
