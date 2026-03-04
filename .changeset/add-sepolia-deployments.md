---
"@zentity/fhevm-contracts": minor
---

Add Sepolia deployment addresses and consolidation script

- Bundle Sepolia contract addresses (IdentityRegistry, ComplianceRules, CompliantERC20)
- Add `consolidate-deployments.ts` script to generate `addresses.json` from hardhat-deploy artifacts
- Add `localhost` as alias for hardhat network
- Integrate consolidation into build pipeline
