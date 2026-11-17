# @zentity/contracts

## 0.9.0

### Minor Changes

- 434b82c: The package is now an ES module and requires Node.js 22.12 or later. Import paths and the `exports` map are unchanged; CommonJS callers load it through `require()`, which Node.js supports for ES modules from 22.12.

  The package depends on `@fhevm/solidity` 0.13.4 (FHEVM v13) instead of 0.9.1, and no longer depends on `@openzeppelin/confidential-contracts`, which required `@fhevm/solidity` 0.9.1 as a peer.

  Contracts built from this release handle encrypted inputs differently in `FHE.fromExternal`. An input with a proof is still checked by the InputVerifier. An input with an empty proof is accepted when the caller is already allowed to use the handle in the ACL, and a zero handle becomes an encrypted zero. Any other empty-proof input reverts with the new `SenderNotAllowedToUseHandle(bytes32,address)` error, which the `IdentityRegistry` and `CompliantERC20` ABIs now include.

  The local Hardhat manifest, `@zentity/contracts/deployments/hardhat`, has new addresses, because the local FHEVM stack no longer deploys from the first test account: `IdentityRegistry` is `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`, `ComplianceRules` is `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`, and `CompliantERC20` is `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9`.

  `ethers` is no longer a peer dependency, because the package code imports only `viem`. Projects that use the ABIs with ethers keep working with their own `ethers` install.

  Manifests written from Hardhat Ignition deployments no longer record a contract's `txHash`. The field stays optional in the manifest type.

- 0fa0717: The Sepolia and Base Sepolia manifests point to new deployments built from this release, so `@zentity/contracts/deployments/sepolia` and `@zentity/contracts/deployments/baseSepolia` return new addresses. The new contracts start with no attestations, so identities attested on the previous contracts must be attested again.

  - Sepolia: `IdentityRegistry` is `0x79f24b1100691FbE00b338bFB3977a1A7AE742D1`, `ComplianceRules` is `0x3685BE535C9b4B5A162a8697DB000461795EFDF7`, and `CompliantERC20` is `0xd9bD2B8728975Ec090479D38D735e41C19FD5840`.
  - Base Sepolia: `IdentityRegistryMirror` is `0x0CF34291E5Ba44dA4a86927260DEED0cAb80eC16`.

  Apps that set these addresses through environment variables, such as `BASE_SEPOLIA_IDENTITY_REGISTRY_MIRROR`, must update them. The owner and registrar on both networks are still `0x15CedFBe8aC7A1BC24e5a4AE8a9263EDBBdCa7e4`.

## 0.8.0

### Minor Changes

- b1279fb: ABI exports are now const-typed, so viem and wagmi infer function names, arguments, and return types from `identityRegistryAbi`, `identityRegistryMirrorAbi`, `complianceRulesAbi`, and `compliantErc20Abi` without casts. Breaking for TypeScript callers that relied on the previous widened types.

  - `@zentity/contracts/abi` now declares the same typed ABIs instead of `unknown`. The JSON subpaths (`@zentity/contracts/abi/IdentityRegistry` and the others) are unchanged.
  - `getIdentityRegistry()` and `getIdentityRegistryMirror()` return typed viem contracts for the client passed in, also exported as `IdentityRegistryContract` and `IdentityRegistryMirrorContract`, so `read.isCompliant(...)` resolves to `boolean`.
  - `getAbi(name)` returns the ABI type for the named contract.
  - Code that assigned an ABI to a mutable or widened type, or passed a function name held in a plain `string`, can now fail to typecheck. Use a literal function name or viem's `ContractFunctionName` type.

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
