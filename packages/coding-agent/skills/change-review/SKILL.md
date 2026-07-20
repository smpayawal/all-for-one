---
name: change-review
description: Use when the user requests review of a pull request, branch, commit range, working-tree diff, or completed meaningful change. Review the complete change against repository standards and the originating requirement, then report only actionable correctness, compatibility, security, scope, and validation findings. Do not use for ordinary small edits.
---

# Review a change

Review the change without modifying it unless the user separately requests fixes.

1. Identify the originating requirement, intended behavior, base and head boundaries, and applicable project instructions.
2. Read the complete diff and inspect enough surrounding implementation and tests to understand each changed path.
3. Verify that every changed file is necessary and that no required file, migration, generated output, or documentation update is missing.
4. Check correctness, edge cases, error handling, lifecycle behavior, compatibility, security, and cross-platform effects at the changed boundary.
5. Check that tests exercise observable behavior and that reported validation matches commands and results that actually exist.
6. Distinguish defects from optional improvements. Avoid generic praise, taste-based comments, and style findings already enforced automatically.
7. Report findings in severity order with the affected path, concrete impact, supporting evidence, and smallest credible correction.
8. State residual risk, assumptions, and checks that could not be performed. If no actionable issue is found, say so directly.

Do not require a formal specification when the originating request and repository rules provide a sufficient review baseline.
