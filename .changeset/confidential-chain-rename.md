---
"@zentity/contracts": minor
---

Rename the encrypted-contract surface from "fhEVM" to "Zama confidential chain" end-to-end. Breaking.

**Solidity ABI**

- `IdentityRegistry.attestWithPermit` collapses the four `external*` handles plus `inputProof` into a single `EncryptedIdentityAttributes` struct argument. Callers must pack the struct instead of passing positional encrypted fields.
- `CompliantERC20` renames the encrypted entry points and wraps their inputs in a new `EncryptedTokenAmount` struct: `transfer` → `transferConfidential`, `approve` → `approveConfidential`, `transferFrom` → `transferFromConfidential`. The plaintext `transfer(address,uint256)` overload is unchanged.

**TypeScript API**

- `getFhevmContractAddresses` → `getConfidentialContractAddresses`
- `FhevmContractName` / `fhevmContractNames` / `FhevmContractAddresses` / `FhevmDeploymentManifest` → `Confidential*` equivalents

**Deploy + env**

- Hardhat tag `Fhevm` → `Confidential` (`bun run deploy:sepolia` is unchanged but invokes the new tag internally).
- Environment variables `FHEVM_RPC_URL` / `FHEVM_PRIVATE_KEY` are replaced by `CONFIDENTIAL_CHAIN_RPC_URL` / `CONFIDENTIAL_CHAIN_DEPLOYER_PRIVATE_KEY`.
- `scripts/print-deployments.ts` emits `CONFIDENTIAL_CHAIN_*` prefixes for Sepolia.
- `hardhat.config.ts` reads `LOCAL_RPC_URL` (or `NEXT_PUBLIC_LOCAL_RPC_URL`) for the localhost network so downstream apps can point Hardhat at a non-default port.
