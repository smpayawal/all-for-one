---
name: security-boundary-review
description: Use when a change touches shell or process execution, filesystem or workspace boundaries, permissions, secrets, package installation, untrusted project resources, network access, or prompt and tool injection. Trace trust boundaries and failure modes, prefer deterministic enforcement, and require focused negative validation.
---

# Review a security boundary

Use this skill for changes that cross a trust boundary. It does not replace authorization, isolation, sandboxing, or deterministic runtime controls.

1. Identify protected assets, trusted actors, untrusted inputs, entrypoints, and sensitive sinks.
2. Trace the complete path from each untrusted input to process execution, filesystem mutation, credential use, network access, package loading, or tool invocation.
3. Review path normalization, workspace containment, symlinks, quoting, shell composition, environment inheritance, permissions, and failure-open behavior.
4. Review project trust, extensions, packages, skills, prompts, downloaded content, logs, and model-controlled arguments for injection or privilege expansion.
5. Review cancellation, timeouts, retries, child-process cleanup, temporary files, resource limits, and platform-specific behavior.
6. Prefer deterministic validation and enforcement at the narrowest correct runtime boundary. Approval prompts are not security isolation.
7. Define focused positive and negative tests, including bypass attempts and malformed inputs.
8. Report verified findings, exploit preconditions, practical impact, existing mitigations, the smallest safe correction, and residual risk.

Do not claim a boundary is secure without evidence or expand a focused review into a repository-wide audit unless requested.
