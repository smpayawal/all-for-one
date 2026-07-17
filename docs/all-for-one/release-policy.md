# Release policy

This hardening pass does not create commits, tags, releases, pushes, or pull requests. User-staged and user-unstaged work remains in the shared worktree.

Before a future release:

1. review the package changelog `[Unreleased]` sections;
2. run `npm run check` and the appropriate focused tests;
3. run the repository-requested release smoke tests from outside the checkout;
4. inspect generated lockfile/shrinkwrap changes; and
5. obtain explicit authorization before committing or pushing.

Dependency changes remain reviewed code. Use exact versions and `npm ci --ignore-scripts` for clean validation. Do not reinstall or remove `node_modules` merely to hide an environment failure.
