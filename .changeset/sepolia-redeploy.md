---
"@zentity/fhevm-contracts": patch
---

Update Sepolia deployment with improved contracts

- New contract addresses for IdentityRegistry, ComplianceRules, and CompliantERC20
- Added detailed attestation events (IdentityAttestedDetailed, IdentityRevokedDetailed) for better auditability
- Includes attestation metadata tracking (timestamp, registrar, revocation status)
