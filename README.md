# @zentity/contracts

Smart contracts, ABIs, deployment manifests, and viem helpers for Zentity's on-chain compliance surfaces.

## Overview

This package contains two contract families:

- **Zama confidential contracts on Ethereum Sepolia**: `IdentityRegistry`, `ComplianceRules`, and `CompliantERC20` store encrypted identity attributes and evaluate encrypted compliance predicates.
- **Base mirror contracts on Base Sepolia**: `IdentityRegistryMirror` stores only public, level-aware compliance state for low-latency `isCompliant(address,uint8)` reads.

The mirror is intentionally plaintext and narrow. It stores no PII, proof hashes, FHE ciphertext handles, or commitments.
For the architecture boundary and production rationale, see [Production Attestation Architecture](docs/production-attestation-architecture.md#public-read-mirrors).

## Installation

```bash
npm install @zentity/contracts
```

## Quickstart

```ts
import {
  chainIdByNetwork,
  complianceLevels,
  getIdentityRegistryMirror,
  identityRegistryMirrorAbi,
} from "@zentity/contracts";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const client = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"),
});

const mirror = getIdentityRegistryMirror(client, {
  network: chainIdByNetwork.baseSepolia,
});

const compliant = await mirror.read.isCompliant([
  "0x0000000000000000000000000000000000000001",
  complianceLevels.basic,
]);
```

Direct ABI imports use lower-camel names:

```ts
import { identityRegistryAbi, identityRegistryMirrorAbi } from "@zentity/contracts";
import { identityRegistryMirrorAbi as mirrorAbi } from "@zentity/contracts/abi";
```

## Networks

| Network | Chain ID | Contract family | Notes |
|---|---:|---|---|
| Hardhat | `31337` | fhEVM mocks | Local development |
| Ethereum Sepolia | `11155111` | Zama confidential | Encrypted registry and compliance checks |
| Base Sepolia | `84532` | Mirror | Plaintext `IdentityRegistryMirror` |

## Development

```bash
bun install
bun run compile
bun run test:mocked
bun run typecheck
```

To validate deployed artifacts against a running local node:

```bash
bunx hardhat node
bun run deploy:local
bun run validate:local
```

## Deploy

### Ethereum Sepolia confidential contracts

```bash
CONFIDENTIAL_CHAIN_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
CONFIDENTIAL_CHAIN_DEPLOYER_PRIVATE_KEY=0x... \
bun run deploy:sepolia
```

Print app env values:

```bash
bun run print:deployments sepolia --env
```

### Base Sepolia mirror

```bash
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
BASE_SEPOLIA_PRIVATE_KEY=0x... \
BASE_SEPOLIA_REGISTRAR_ADDRESS=0x... \
bun run deploy:base-sepolia
```

`BASE_SEPOLIA_PRIVATE_KEY` deploys the proxy and owns the initial upgrade/admin role.
`BASE_SEPOLIA_REGISTRAR_ADDRESS` is the separate writer identity that records
mirrored compliance levels.
The deploy script validates the deployed proxy, bytecode, owner, registrar, and
level constants before it exits.

After deployment, configure Zentity with:

```bash
BASE_SEPOLIA_IDENTITY_REGISTRY_MIRROR=0x...
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_SEPOLIA_REGISTRAR_PRIVATE_KEY=0x...
NEXT_PUBLIC_ENABLE_BASE_SEPOLIA=true
```

`BASE_SEPOLIA_REGISTRAR_PRIVATE_KEY` must correspond to the registrar address
configured during deployment. The deployed Base Sepolia manifest is shipped as
`@zentity/contracts/deployments/baseSepolia`, so application code should use the
package manifest by default and reserve env address overrides for alternate
deployments.

## Public Package Surface

The stable TypeScript surface is:

- `identityRegistryAbi`, `identityRegistryMirrorAbi`, `complianceRulesAbi`, `compliantErc20Abi`
- `deployments`, keyed by chain id
- `chainIdByNetwork`
- `getConfidentialContractAddresses()`
- `getIdentityRegistryMirrorAddress()`
- `getIdentityRegistry()`, `getIdentityRegistryMirror()`
- `attestedOnlyLevel`, `complianceLevels`

Generated TypeChain sources and Hardhat deployment internals are not part of the public package API.

## License

MIT
