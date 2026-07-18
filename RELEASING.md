# Releasing All-For-One

All-For-One releases are published through GitHub Releases from the `allforone` branch. Internal Pi-compatible workspace packages remain private and are not published to npm.

## Release requirements

Before creating a release tag:

1. Confirm the release commit is on `allforone`.
2. Confirm `main` is an ancestor of the release commit:

   ```bash
   node scripts/check-upstream-relationship.mjs --main origin/main --current HEAD --json
   ```

3. Confirm the All-For-One version in `package.json` matches `packages/coding-agent/src/allforone/product.ts`.
4. Confirm `CHANGELOG-AFO.md` describes the release accurately.
5. Run the complete validation set:

   ```bash
   npm ci --ignore-scripts
   npm run build
   npm run check
   ./test.sh
   ```

6. Build the standalone archives and run the available local smoke tests from outside the repository.
7. Review the final diff and confirm no Pi package version, package name, configuration path, session format, SDK surface, or RPC contract changed unintentionally.

## Create the release

All-For-One tags use the form `afo-vX.Y.Z` and must match the product version exactly.

Create an annotated tag only after the release commit has passed validation:

```bash
git tag -a afo-vX.Y.Z -m "All-For-One X.Y.Z"
git push origin afo-vX.Y.Z
```

Pushing the tag starts `.github/workflows/allforone-release.yml`. The workflow validates the tag, rebuilds the standalone archives, generates release notes and a manifest, produces SHA-256 checksums, and publishes a GitHub Release.

Do not move, replace, or reuse a published tag. Public releases are immutable. When a release needs correction, prepare a new version.

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
