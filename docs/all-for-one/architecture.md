# All-For-One architecture

All-For-One is a narrow hardening layer over the Native Pi monorepo. The core agent loop, session manager, extension runner, SDK, print mode, RPC mode, and interactive mode remain the primary runtime boundaries.

The main changes are:

- canonical built-in capability registry with five registered coding tools and a four-tool native default profile;
- explicit auto, native, patch, and full tool profiles with model-keyed execution behavior;
- bounded path-scoped context and skill metadata diagnostics;
- preflighted `apply_patch` mutations with concurrent-change detection and best-effort rollback;
- opt-in, repository-grounded execution-integrity observation;
- explicit local memory limits outside the repository;
- in-memory compaction telemetry; and
- generic offline baselines, doctors, evaluators, and an upstream relationship verifier.

Local command execution is bounded at the existing `execCommand()` and local Bash seams. POSIX commands that are intentionally isolated run in a dedicated process group; timeout and abort first request graceful group termination and then force termination after a bounded grace period. Windows awaits the `taskkill /T` helper and uses process discovery plus direct-PID fallback when the root exits before descendants. A result reports timeout/abort/signal/error classification separately from best-effort tree-cleanup status.

Optional behavior remains optional. Safe-mode authorization, the read-only code-intelligence interface, external sandbox, and lazy MCP guidance live in [optional capabilities](optional-capabilities.md), not in the default harness. No validator agent, workflow engine, database, embedding system, automatic command runner, or semantic memory subsystem was added.
