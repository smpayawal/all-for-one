# All-For-One changelog

## Unreleased

### Added

- Added `allforone` as the primary command and `afo` as a short alias while retaining the Pi-compatible `pi` command.
- Added an independent All-For-One product version with an explicit Pi compatibility baseline.
- Added generic offline baselines, structural doctor checks, execution/context evaluators, upstream relationship verification, compaction telemetry, and dedicated branch CI.
- Added bounded scoped-context, local-memory, skill-priority, and apply-patch diagnostics.

### Changed

- Updated repository and package metadata to identify All-For-One as the maintained downstream project.
- Made `read`, `bash`, `edit`, `write`, and `apply_patch` the canonical default active tools.
- Kept execution-integrity enforcement opt-in and mode-aware validation guidance bounded.
- Preserved `.pi`, `PI_*`, Pi package names, sessions, extensions, SDK exports, and RPC interfaces as compatibility identifiers.

### Removed

- Removed the built-in `changes` tool and its public/event surface.
