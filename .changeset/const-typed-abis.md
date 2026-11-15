---
"@zentity/contracts": minor
---

ABI exports are now const-typed, so viem and wagmi infer function names, arguments, and return types from `identityRegistryAbi`, `identityRegistryMirrorAbi`, `complianceRulesAbi`, and `compliantErc20Abi` without casts. Breaking for TypeScript callers that relied on the previous widened types.

- `@zentity/contracts/abi` now declares the same typed ABIs instead of `unknown`. The JSON subpaths (`@zentity/contracts/abi/IdentityRegistry` and the others) are unchanged.
- `getIdentityRegistry()` and `getIdentityRegistryMirror()` return typed viem contracts for the client passed in, also exported as `IdentityRegistryContract` and `IdentityRegistryMirrorContract`, so `read.isCompliant(...)` resolves to `boolean`.
- `getAbi(name)` returns the ABI type for the named contract.
- Code that assigned an ABI to a mutable or widened type, or passed a function name held in a plain `string`, can now fail to typecheck. Use a literal function name or viem's `ContractFunctionName` type.
