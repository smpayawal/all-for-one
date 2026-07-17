# All-For-One changelog

## Unreleased

### Added

- Added generic offline baselines, structural doctor checks, execution/context evaluators, upstream relationship verification, compaction telemetry, and dedicated branch CI.
- Added bounded scoped-context, local-memory, skill-priority, and apply-patch diagnostics.

### Changed

- Made `read`, `bash`, `edit`, `write`, and `apply_patch` the canonical default active tools.
- Kept execution-integrity enforcement opt-in and mode-aware validation guidance bounded.

### Removed

- Removed the built-in `changes` tool and its public/event surface.
