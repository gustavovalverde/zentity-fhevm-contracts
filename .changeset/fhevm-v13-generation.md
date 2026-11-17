---
"@zentity/contracts": minor
---

The `IdentityRegistry` and `CompliantERC20` ABIs now include the `SenderNotAllowedToUseHandle(bytes32,address)` error, which the contracts raise when a caller passes an encrypted handle it is not allowed to use. The package now depends on `@fhevm/solidity` 0.13.4 (FHEVM v13) instead of 0.9.1; deployment addresses are unchanged.
