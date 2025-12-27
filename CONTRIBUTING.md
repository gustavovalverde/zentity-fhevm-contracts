# Contributing

This repo requires a few pre-commit steps to keep deployments, ABIs, and
changesets consistent.

## Required pre-commit checklist

1) **Update changesets**
   - Any user-facing change **must** include a changeset.
   - Run:
     - `bunx changeset add`
   - Verify:
     - `bunx changeset status`

2) **Run tests**
   - Local mocked tests:
     - `bun run test:mocked`
   - If your change affects deployments or on-chain behavior:
     - `bun run deploy:mocked`

3) **Run lint + typecheck + build**
   - `bun run lint`
   - `bun run typecheck`
   - `bun run build`

4) **Sepolia deployment (when required)**
   - Only required when you intend to update on-chain addresses in
     `deployments/sepolia/*.json`.
   - Ensure `.env` / `.env.local` are set (`FHEVM_RPC_URL`, `PRIVATE_KEY`, etc.).
   - Run:
     - `bun run deploy:sepolia`
     - `bun run test:sepolia`
   - Commit the updated `deployments/sepolia/*.json` files if a new deployment
     is intended for release.

## Commit guidelines

- Use Conventional Commits (e.g., `feat(contracts): rename kyc to compliance level`).
- Keep changes scoped; avoid mixing refactors with deployment changes unless
  required for the release.

## Notes

- Hardhat emits warnings on unsupported Node versions. This does not block local
  workflows but should be resolved in CI toolchain updates.
