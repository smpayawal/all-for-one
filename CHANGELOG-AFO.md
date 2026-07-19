# All-For-One changelog

## Unreleased

### Added

- Added reusable native verification for public GitHub Release assets, manifests, checksums, tagged commits, and compatibility launchers.
- Added a controlled `merge-sync` operation for reviewed `sync/pi-*` pull requests.

### Changed

- Unified release preparation, tag validation, and prerelease classification behind a strict semantic-version parser.
- Made successful publication automatically verify the public release payload with pinned verification tooling.
- Documented downstream ownership boundaries without moving runtime behavior out of its correct Pi layers.
- Clarified All-For-One as an independently maintained terminal coding harness based on Pi.

### Fixed

- Prevented `allforone` and `afo` self-update commands from consulting or installing through Pi's release channel; product self-update now fails closed with All-For-One release guidance.

## [0.1.0-rc.1] - 2026-07-19

### Added

- Added deterministic All-For-One release preparation with aligned product version, lockfile metadata, and dated changelog sections.
- Added native archive smoke validation for macOS arm64, Linux x64, and Windows x64 before release publication.
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

- Publish semantic prerelease tags as GitHub prereleases without marking them as the latest stable release.
- Clarified the downstream release process and required merge-commit handling for `sync/pi-*` pull requests.
- Marked the Pi-compatible workspace packages private in the All-For-One branch and formalized GitHub Releases as the downstream distribution path.
- Moved product identity and presentation helpers behind the All-For-One-owned `src/allforone` boundary.
- Updated repository and package metadata to identify All-For-One as the maintained downstream project.
- Made `read`, `bash`, `edit`, `write`, and `apply_patch` the canonical default active tools.
- Kept execution-integrity enforcement opt-in and mode-aware validation guidance bounded.
- Preserved `.pi`, `PI_*`, Pi package names, sessions, extensions, SDK exports, and RPC interfaces as compatibility identifiers.

### Removed

- Removed the built-in `changes` tool and its public/event surface.
