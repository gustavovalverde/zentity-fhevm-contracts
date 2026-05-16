# @zentity/contracts

## 0.7.0

### Minor Changes

- c61d3c2: Rename the encrypted-contract surface from "fhEVM" to "Zama confidential chain" end-to-end. Breaking.

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

## 0.6.0

### Major Changes

- Rename the public package from `@zentity/fhevm-contracts` to `@zentity/contracts`.
- Add `IdentityRegistryMirror`, a Base Sepolia plaintext compliance mirror with `isCompliant(address,uint8)`.
- Replace uppercase ABI exports with lower-camel ABI exports.
- Remove TypeChain and Hardhat deployment internals from the published package surface.

### Minor Changes

- Add Base Sepolia deployment configuration and `deploy:base-sepolia`.
- Add chainId-keyed `deployments` plus `getIdentityRegistry()` and `getIdentityRegistryMirror()` viem helpers.
- Export shared level constants via `attestedOnlyLevel` and `complianceLevels`.

## 0.3.0

### Minor Changes

- Add Sepolia deployment addresses and consolidation script.

  - Bundle Sepolia contract addresses (`IdentityRegistry`, `ComplianceRules`, `CompliantERC20`).
  - Add `consolidate-deployments.ts` to generate `addresses.json` from hardhat-deploy artifacts.
  - Add `localhost` as an alias for Hardhat.
  - Integrate consolidation into the build pipeline.

## 0.2.0

### Minor Changes

- Rename KYC level fields and functions to compliance level across contracts, ABIs, and docs.

## 0.1.2

### Patch Changes

- Update Sepolia deployment with improved contracts.

  - New contract addresses for `IdentityRegistry`, `ComplianceRules`, and `CompliantERC20`.
  - Add detailed attestation events for auditability.
  - Include attestation metadata tracking.

## 0.1.1

### Patch Changes

- Initial public release content: contracts, ABIs, deployments, and SDK helpers.
