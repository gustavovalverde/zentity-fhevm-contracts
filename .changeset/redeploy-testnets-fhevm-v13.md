---
"@zentity/contracts": minor
---

The Sepolia and Base Sepolia manifests point to new deployments built from this release, so `@zentity/contracts/deployments/sepolia` and `@zentity/contracts/deployments/baseSepolia` return new addresses. The new contracts start with no attestations, so identities attested on the previous contracts must be attested again.

- Sepolia: `IdentityRegistry` is `0x79f24b1100691FbE00b338bFB3977a1A7AE742D1`, `ComplianceRules` is `0x3685BE535C9b4B5A162a8697DB000461795EFDF7`, and `CompliantERC20` is `0xd9bD2B8728975Ec090479D38D735e41C19FD5840`.
- Base Sepolia: `IdentityRegistryMirror` is `0x0CF34291E5Ba44dA4a86927260DEED0cAb80eC16`.

Apps that set these addresses through environment variables, such as `BASE_SEPOLIA_IDENTITY_REGISTRY_MIRROR`, must update them. The owner and registrar on both networks are still `0x15CedFBe8aC7A1BC24e5a4AE8a9263EDBBdCa7e4`.
