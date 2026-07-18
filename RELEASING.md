# Releasing All-For-One

All-For-One releases are published through GitHub Releases from the `allforone` branch. Internal Pi-compatible workspace packages remain private and are not published to npm.

## Prepare release metadata

Use the downstream preparation command so the product version, root lockfile metadata, and changelog remain aligned:

```bash
npm run release:afo:prepare -- 0.1.0-rc.1 --date YYYY-MM-DD
```

The command updates:

- the All-For-One version in `package.json`;
- the matching root version fields in `package-lock.json`;
- `packages/coding-agent/src/allforone/product.ts`;
- `CHANGELOG-AFO.md`, moving the current `Unreleased` notes into a dated version section.

It does not change the versions of the private Pi-compatible workspace packages, create a commit, create a tag, push a branch, or publish a release.

Review the generated diff before committing. To inspect a prepared release state without modifying files, use:

```bash
npm run release:afo:prepare -- 0.1.0-rc.1 --check --json
```

## Release requirements

Before creating a release tag:

1. Confirm the prepared release commit is on `allforone`.
2. Confirm `main` is an ancestor of the release commit:

   ```bash
   node scripts/check-upstream-relationship.mjs --main origin/main --current HEAD --json
   ```

3. Confirm the All-For-One version in `package.json` matches `packages/coding-agent/src/allforone/product.ts`.
4. Confirm `CHANGELOG-AFO.md` contains the matching dated version section.
5. Verify the prepared release state:

   ```bash
   npm run release:afo:prepare -- X.Y.Z --check --json
   ```

6. Run the complete validation set:

   ```bash
   npm ci --ignore-scripts
   npm run build
   npm run check
   ./test.sh
   ```

7. Build the standalone archives and run the available local smoke tests from outside the repository.
8. Review the final diff and confirm no Pi package version, package name, configuration path, session format, SDK surface, or RPC contract changed unintentionally.

## Native archive validation

The release workflow downloads and executes the same archives that it is preparing to publish. Publication is blocked unless the following native smoke jobs pass:

- Linux x64 on `ubuntu-latest`;
- macOS arm64 on `macos-latest`;
- Windows x64 on `windows-latest`.

Each job verifies `--version` and `--help` for `allforone`, `afo`, and the compatible `pi` launcher in offline mode.

The Linux arm64, macOS x64, and Windows arm64 archives are produced for compatibility testing but are best-effort until they are executed on corresponding native runners or verified hardware.

## Create a release candidate

Release candidates use semantic prerelease versions and tags such as:

```text
afo-v0.1.0-rc.1
```

Prepare and validate the matching version before creating the tag. The release workflow publishes prerelease tags as GitHub prereleases and explicitly prevents them from becoming the latest stable release.

Create an annotated tag only after the prepared release commit has passed validation:

```bash
git tag -a afo-v0.1.0-rc.1 -m "All-For-One 0.1.0-rc.1"
git push origin afo-v0.1.0-rc.1
```

## Create a stable release

Stable tags use the form `afo-vX.Y.Z` and must match the prepared product version exactly.

```bash
git tag -a afo-vX.Y.Z -m "All-For-One X.Y.Z"
git push origin afo-vX.Y.Z
```

Pushing an All-For-One tag starts `.github/workflows/allforone-release.yml`. The workflow validates the tag and prepared changelog state, rebuilds the standalone archives, generates release notes and a manifest, produces SHA-256 checksums, runs native archive smoke tests, and publishes a GitHub Release only after those tests pass.

Do not move, replace, or reuse a published tag. Public releases are immutable. When a release needs correction, prepare a new version.

## Failed release handling

- Validation or native smoke failures prevent publication.
- A draft created during a failed publish attempt is removed by the workflow.
- A transient failure may be retried only while the tag still points to the same verified source commit.
- When source changes are required, do not move the existing tag. Prepare and publish the next version, such as `rc.2`.
- Never edit a published release to replace its source artifacts.

## Verify the published release

After publication:

1. Download the release assets from GitHub.
2. Verify `SHA256SUMS`.
3. Extract the archive on each supported platform available for testing.
4. Run `allforone --version` and `allforone --help`.
5. Run the `afo` and `pi` compatibility launchers.
6. Confirm the reported All-For-One version and Pi compatibility baseline.
7. Record any platform that was not tested.

A release is not considered verified until the public assets, rather than workspace build output, have been downloaded and executed.

## Upstream synchronization before a release

Use the `Upstream Pi Sync` workflow to inspect drift. Updating `main` and preparing a `sync/pi-*` pull request are separate, explicit actions.

A `sync/pi-*` pull request must be merged with a merge commit. Never squash or rebase it because the native Pi `main` commit must remain an ancestor of `allforone`.

After the merge, run the upstream relationship check again before releasing.

## Prohibited downstream release paths

Do not use the inherited Pi package publication or release commands on `allforone`. All-For-One distribution is GitHub Releases only, and the `@earendil-works/pi-*` workspace packages must remain private.
