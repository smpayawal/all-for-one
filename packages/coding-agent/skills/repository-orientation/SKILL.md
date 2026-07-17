---
name: repository-orientation
description: Build a bounded repository map before making a non-trivial change.
---

# Repository orientation

Use this skill before a broad or unfamiliar change.

1. Read the applicable `AGENTS.md` files from the repository boundary inward.
2. Read the relevant package manifest, entrypoint, implementation, nearby tests, and architecture documentation.
3. Identify the narrowest source-of-truth boundary, the files you may change, and the validation command that can prove the result.
4. Record unknowns instead of filling gaps with assumptions. Do not preload unrelated documentation or invent a new abstraction.
