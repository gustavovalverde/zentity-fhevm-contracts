---
"@zentity/contracts": minor
---

The package now depends on `@fhevm/solidity` 0.13.4 (FHEVM v13) instead of 0.9.1, and no longer depends on `@openzeppelin/confidential-contracts`, which required `@fhevm/solidity` 0.9.1 as a peer. Deployment addresses are unchanged.

Contracts built from this release handle encrypted inputs differently in `FHE.fromExternal`. An input with a proof is still checked by the InputVerifier. An input with an empty proof is accepted when the caller is already allowed to use the handle in the ACL, and a zero handle becomes an encrypted zero. Any other empty-proof input reverts with the new `SenderNotAllowedToUseHandle(bytes32,address)` error, which the `IdentityRegistry` and `CompliantERC20` ABIs now include. The contracts already deployed on Sepolia keep the 0.9.1 behavior until they are redeployed or upgraded.
