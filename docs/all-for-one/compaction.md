# Compaction

Native compaction remains the source of truth. Structural summary validation rejects invalid results, allows one repair attempt at most, and exact user-message retention remains disabled by default. Evidence references are bounded and remain diagnostic references, not a new persistence system.

`AgentSession.getContextInfo().compactionHealth` now includes session-scoped in-memory telemetry for compaction runs, structural validation failures, repair attempts/successes/failures, total and latest duration, estimated token totals before/after, optional provider usage/cost when already exposed by an extension result, and explicit missing-measurement limitations.

Telemetry is not written to session files or a database. Provider metrics are not invented when the native compaction path does not expose them. The deterministic health and retention suites cover these boundaries; live quality and cost effects require paired workload evaluation.
