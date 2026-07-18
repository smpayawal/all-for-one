# Security and cross-platform review

The hardening boundary is intentionally local and fail-closed where practical:

- `apply_patch` preflights every operation, re-checks canonical paths and file state before each commit, preserves non-Windows modes, uses same-directory exclusive temporary files plus flush/rename replacement, and performs best-effort in-process rollback on later failure;
- path-scoped context rejects outside-root paths and bounds active scope/content diagnostics;
- local memory stays outside the repository, uses restrictive permissions where supported, locks read-modify-write mutations, atomically replaces JSONL, bounds entries/count/file size, uses no-follow file-descriptor reads on POSIX systems, fails closed before mutating unreadable or malformed state, and treats secret scanning as best-effort;
- validation guidance is advisory and never grants command permission or automatic execution;
- tool and diagnostic inputs are bounded before they are surfaced in prompts or `/context`.

The optional safe-mode extension is authorization-oriented, not isolation. It allows only an exact read-only command set without approval, fails closed on shell syntax, destructive flags, credential-like paths, malformed mutation arguments, path traversal, Windows absolute paths on non-Windows hosts, and symlink escapes, and treats approval as permission rather than a sandbox. Genuine built-in read-only tools are distinguished from extension tools that reuse their names; unknown tools require interactive approval and are blocked without UI.

The focused security suite covers positive and denial paths for safe mode, canonical path checks, credential references, malformed arguments, large stdout/stderr, hung descendants, invalid settings/session or memory inputs, resource loading, and extension/tool boundaries. The remaining checklist is operational: test malicious and conflicting instruction files, unreadable or oversized context, secret-like output, prompt injection in source files, and critical/observer extension failures on the exact release candidate. Bash still has host privileges; use a container, VM, restricted account, or external sandbox for untrusted repositories.

## Release-candidate security checklist

This is an evidence checklist, not a claim that every adverse fixture has passed in this checkout. Items marked `Needs Verification` require a fresh fixture or manual run against the exact release candidate.

| Check | Current evidence | Status |
| --- | --- | --- |
| Malicious repository instruction files | resource-loader/scoped-context suites; inspect source-file instruction handling manually | Needs Verification |
| Path traversal | `safe-mode.test.ts` mutation-path regression | Covered |
| Symlink escape | `safe-mode.test.ts` canonical symlink regression | Covered |
| Unreadable instruction files | resource-loader behavior exists; no dedicated release-candidate fixture recorded here | Needs Verification |
| Oversized context files | All-For-One doctor oversized-context check | Covered |
| Duplicate/conflicting context files | loader diagnostics and doctor duplicate-content check | Covered; semantic conflict review pending |
| Secret-like tool output | bounded output tests; secret-content redaction behavior needs a targeted fixture | Needs Verification |
| Credential-file access | safe-mode `.env`, auth, SSH/AWS/config, PEM, and key references | Covered |
| Destructive Bash commands | safe-mode shell syntax, destructive command, and mutating-flag cases | Covered |
| Extension tool-name shadowing | safe-mode shadowed built-in regression | Covered |
| Malformed tool arguments | safe-mode malformed write/patch cases | Covered |
| Very large stdout/stderr | `exec.test.ts` independent bounded-stream cases | Covered |
| Hung commands | `exec.test.ts` timeout and force-cleanup cases | Covered |
| Process descendants | `exec.test.ts` and local-Bash process-tree regressions | Covered on POSIX; Windows CI required |
| Invalid session files | session/resource-loader suites; exact malformed-session release run | Needs Verification |
| Invalid settings | `settings-manager.test.ts` invalid-value cases | Covered |
| Malformed local memory | memory suite and doctor memory checks | Covered |
| Prompt injection inside source files | no semantic trust guarantee; use isolated manual fixture | Needs Verification |
| Commands outside workspace | safe-mode canonical path, traversal, and symlink checks | Covered for mutation tools |
| Critical/observer extension failures | extension suites cover event handling; release-candidate failure-injection run remains | Needs Verification |

Windows-specific behavior is covered by the dedicated CI matrix for apply-patch, file mutation, memory, scoped context, and session-rail suites. macOS and Linux are covered by local validation where available. Remote operations, process crashes, power loss, uncooperative child processes, and external filesystem semantics remain limitations.
