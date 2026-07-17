# All-For-One architecture

All-For-One is a narrow hardening layer over the Native Pi monorepo. The core agent loop, session manager, extension runner, SDK, print mode, RPC mode, and interactive mode remain the primary runtime boundaries.

The main changes are:

- canonical built-in capability registry with five default active tools;
- bounded path-scoped context and skill metadata diagnostics;
- preflighted `apply_patch` mutations with concurrent-change detection and best-effort rollback;
- opt-in, repository-grounded execution-integrity observation;
- explicit local memory limits outside the repository;
- in-memory compaction telemetry; and
- generic offline baselines, doctors, evaluators, and an upstream relationship verifier.

Optional behavior remains optional. No validator agent, workflow engine, database, embedding system, automatic command runner, or semantic memory subsystem was added.
