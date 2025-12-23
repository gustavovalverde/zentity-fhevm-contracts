# Changesets

Use Changesets to version and publish `@zentity/fhevm-contracts`.

## Add a changeset
```bash
bunx changeset
```

## Release flow
- The Release workflow opens a "version packages" PR when changesets exist.
- Merging that PR publishes to npm.
