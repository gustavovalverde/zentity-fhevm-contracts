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

2) **Regenerate ABIs after contract changes**
   - `bun run compile && bun run export-abi`
   - This writes `abi/<Contract>.json` and the const-typed `src/abi/<Contract>.ts`
     modules. Both are generated; commit them and never edit them by hand.
     `bun run test` fails when they no longer match the compiled contracts.

3) **Run tests**
   - In-process tests:
     - `bun run test`
   - If your change affects deployments or on-chain behavior, deploy to a
     local node (`bunx hardhat node` in another terminal):
     - `bun run deploy:local`

4) **Run lint + typecheck + build**
   - `bun run lint`
   - `bun run typecheck`
   - `bun run build`

5) **Sepolia deployment (when required)**
   - Only required when you intend to update the on-chain addresses in
     `deployments/sepolia/addresses.json`.
   - Ensure `.env` / `.env.local` are set (`CONFIDENTIAL_CHAIN_RPC_URL`, `CONFIDENTIAL_CHAIN_DEPLOYER_PRIVATE_KEY`, etc.).
   - Run:
     - `bun run deploy:sepolia`
     - `bun run validate:sepolia`
   - Commit `ignition/deployments/chain-11155111` and the updated
     `deployments/sepolia/addresses.json` if a new deployment is intended for
     release.

## Commit guidelines

- Use Conventional Commits (e.g., `feat(contracts): rename kyc to compliance level`).
- Keep changes scoped; avoid mixing refactors with deployment changes unless
  required for the release.

## Notes

- Use the Node.js version in `.nvmrc`; CI uses the same file.
