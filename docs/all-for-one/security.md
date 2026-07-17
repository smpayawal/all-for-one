# Security and cross-platform review

The hardening boundary is intentionally local and fail-closed where practical:

- `apply_patch` preflights every operation, re-checks canonical paths and file state before each commit, preserves non-Windows modes, uses same-directory exclusive temporary files plus flush/rename replacement, and performs best-effort in-process rollback on later failure;
- path-scoped context rejects outside-root paths and bounds active scope/content diagnostics;
- local memory stays outside the repository, uses restrictive permissions where supported, locks read-modify-write mutations, atomically replaces JSONL, bounds entries/count/file size, and treats secret scanning as best-effort;
- validation guidance is advisory and never grants command permission or automatic execution;
- tool and diagnostic inputs are bounded before they are surfaced in prompts or `/context`.

Windows-specific behavior is covered by the dedicated CI matrix for apply-patch, file mutation, memory, scoped context, and session-rail suites. macOS and Linux are covered by local validation where available. Remote operations, process crashes, power loss, uncooperative child processes, and external filesystem semantics remain limitations.
