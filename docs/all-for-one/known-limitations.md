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
- `pi.exec` and local Bash isolate POSIX children in a dedicated process group and await graceful-then-force process-tree cleanup. Windows awaits `taskkill /T`, queries descendants, and falls back to direct PID termination when the root exits first.
- Command cancellation has a final 10-second cleanup deadline followed by a 1-second root-exit wait. If the operating system, helper, or process refuses termination, the runtime reports cleanup as incomplete, detaches owned handles, and returns instead of hanging indefinitely.
- Cleanup remains best-effort. No process API can guarantee termination after an operating-system crash, PID reuse, external reparenting, inaccessible process metadata, or host policy refusal.
