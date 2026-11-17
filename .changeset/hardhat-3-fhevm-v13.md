---
"@zentity/contracts": minor
---

The package is now an ES module and requires Node.js 22.12 or later. Import paths and the `exports` map are unchanged; CommonJS callers load it through `require()`, which Node.js supports for ES modules from 22.12.

The package depends on `@fhevm/solidity` 0.13.4 (FHEVM v13) instead of 0.9.1, and no longer depends on `@openzeppelin/confidential-contracts`, which required `@fhevm/solidity` 0.9.1 as a peer.

Contracts built from this release handle encrypted inputs differently in `FHE.fromExternal`. An input with a proof is still checked by the InputVerifier. An input with an empty proof is accepted when the caller is already allowed to use the handle in the ACL, and a zero handle becomes an encrypted zero. Any other empty-proof input reverts with the new `SenderNotAllowedToUseHandle(bytes32,address)` error, which the `IdentityRegistry` and `CompliantERC20` ABIs now include.

The local Hardhat manifest, `@zentity/contracts/deployments/hardhat`, has new addresses, because the local FHEVM stack no longer deploys from the first test account: `IdentityRegistry` is `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`, `ComplianceRules` is `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`, and `CompliantERC20` is `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9`.

`ethers` is no longer a peer dependency, because the package code imports only `viem`. Projects that use the ABIs with ethers keep working with their own `ethers` install.

Manifests written from Hardhat Ignition deployments no longer record a contract's `txHash`. The field stays optional in the manifest type.
