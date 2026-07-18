# Known limitations

These are deliberate boundaries or unresolved risks, not claims that the repository is production-safe in every environment.

- Bash runs with the host process privileges. Approval prompts are an authorization boundary, not a sandbox or filesystem isolation mechanism.
- The apply-patch path can detect concurrent changes and performs best-effort rollback, but a process crash or filesystem failure can still leave a partial patch.
- Validation discovery and a passing validation command do not prove task correctness. Commands are never executed automatically by the validation prompt.
- Execution-integrity enforcement is opt-in and remains default-off. Observe mode records evidence without silently turning it into a success claim.
- Memory is local JSONL state. Existing malformed, oversized, or unreadable files can be reported and omitted for reads; mutations fail closed and no repair or deletion is performed automatically.
- Secret scanning recognizes common credential forms only; it is not a complete detector for arbitrary secrets.
- Scoped instructions are bounded and diagnostic, but semantic conflicts between instruction files are not inferred or automatically resolved.
- Session-rail behavior is isolated to interactive mode. Print, RPC, and SDK modes do not receive an implicit rail.
- No paired live model evaluation has been run. Performance, cost, latency, quality, and reliability improvements are therefore unclaimed.
- Cross-platform CI and upstream rehearsal are verification gates; they do not replace platform-specific investigation when a gate fails.
- `pi.exec` isolates POSIX children in a process group and uses process-tree termination; Windows uses the documented `taskkill /T` tree-termination path. Cleanup remains best-effort if the host refuses termination or the operating system removes the process before the tree command runs.
