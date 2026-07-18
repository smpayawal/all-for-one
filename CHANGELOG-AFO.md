# All-For-One changelog

## Unreleased

### Added

- Added fail-closed publication checks for inherited Pi package and release commands.
- Added `AFO_*` aliases for the public Pi runtime environment variables, with explicit All-For-One precedence and conflict diagnostics.
- Added a controlled upstream Pi synchronization workflow with read-only drift reporting, verified `main` fast-forwards, and review-only `sync/pi-*` pull requests.
- Added synchronization status reporting and tests for current, fast-forward, main-ahead, product-behind, and divergent histories.
- Added a separate `afo-v*` GitHub release workflow for branded macOS, Linux, and Windows binaries without publishing the internal Pi-compatible packages to npm.
- Added release manifests, source-backed release notes, SHA-256 checksums, release tag validation, and a Linux binary smoke test.
- Added `allforone` as the primary command and `afo` as a short alias while retaining the Pi-compatible `pi` command.
- Added an independent All-For-One product version with an explicit Pi compatibility baseline.
- Added generic offline baselines, structural doctor checks, execution/context evaluators, upstream relationship verification, compaction telemetry, and dedicated branch CI.
- Added bounded scoped-context, local-memory, skill-priority, and apply-patch diagnostics.

### Changed

- Marked the Pi-compatible workspace packages private in the All-For-One branch and formalized GitHub Releases as the downstream distribution path.
- Moved product identity and presentation helpers behind the All-For-One-owned `src/allforone` boundary.
- Updated repository and package metadata to identify All-For-One as the maintained downstream project.
- Made `read`, `bash`, `edit`, `write`, and `apply_patch` the canonical default active tools.
- Kept execution-integrity enforcement opt-in and mode-aware validation guidance bounded.
- Preserved `.pi`, `PI_*`, Pi package names, sessions, extensions, SDK exports, and RPC interfaces as compatibility identifiers.

### Removed

- Removed the built-in `changes` tool and its public/event surface.
