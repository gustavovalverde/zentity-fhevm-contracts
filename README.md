# @zentity/fhevm-contracts

fhEVM smart contracts for privacy-preserving identity attestations.

## Overview

This package provides Solidity contracts using Zama's fhEVM:

- **IdentityRegistry** — encrypted identity attributes (birth year offset, country, compliance (KYC) level, blacklist)
- **ComplianceRules** — encrypted compliance checks with cached results
- **CompliantERC20** — demo token enforcing compliance on transfers

## Installation

```bash
npm install @zentity/fhevm-contracts
```

## Quickstart (local)

```bash
bun install
bun run compile
bun run test:mocked

# terminal 1
bunx hardhat node

# terminal 2
bun run deploy:local
bun run print:deployments localhost --env
```

## Quickstart (Sepolia)

1) Set env values in `.env.local`:

```
FHEVM_RPC_URL=...
FHEVM_PROVIDER_ID=zama # zama = Zama relayer SDK
PRIVATE_KEY=0x...
```

Tip: keep shared defaults in `.env` and secrets in `.env.local`.
See `docs/deployment.md` for the full env-file behavior.

2) Deploy and print addresses:

```bash
bun run deploy:sepolia
bun run print:deployments sepolia --env
```

3) Run integration smoke tests:

```bash
bun run test:sepolia
```

## Usage

Minimal setup (addresses + ABI):

```typescript
import {
  getContractAddresses,
  getAbi,
} from "@zentity/fhevm-contracts";

const addresses = getContractAddresses("hardhat");
const identityRegistry = new ethers.Contract(
  addresses.IdentityRegistry,
  getAbi("IdentityRegistry"),
  signer
);
```

Direct ABI imports:

```typescript
import { IdentityRegistryABI } from "@zentity/fhevm-contracts";
// or
import { IdentityRegistryABI } from "@zentity/fhevm-contracts/abi";
```

Address helpers:

```typescript
import {
  getContractAddresses,
  resolveContractAddresses,
  getNetworkName,
  hasDeployment,
  CHAIN_ID_BY_NETWORK,
} from "@zentity/fhevm-contracts";

const network = getNetworkName(31337, "hardhat");
if (!hasDeployment(network)) throw new Error("Missing deployments");

const addresses = getContractAddresses(network, {
  overrides: { ComplianceRules: "0x..." },
});

// Sepolia or other networks without bundled deployments:
const sepoliaAddresses = resolveContractAddresses("sepolia", {
  overrides: {
    IdentityRegistry: "0x...",
    ComplianceRules: "0x...",
    CompliantERC20: "0x...",
  },
});
```

## Addresses & deployments

Deployments are stored in `deployments/<network>`. Use the helper script to
print them as JSON or env-style output:

```bash
bun run print:deployments
bun run print:deployments sepolia --env
```

## Networks

| Network | Chain ID | RPC |
|---------|----------|-----|
| Sepolia | 11155111 | https://ethereum-sepolia-rpc.publicnode.com |
| Localhost | 31337 | http://127.0.0.1:8545 |

Note: only networks with a deployment manifest in `deployments/<network>` are
available via `getContractAddresses()` out of the box.

## Ownership & admin safety

Admin-managed contracts use **two-step ownership transfer**:
`transferOwnership(newOwner)` → `acceptOwnership()`.

See `docs/guide.md` for details and best practices.

## Documentation

- `docs/guide.md` (deployment, testing, faucets, ownership)
- `docs/architecture.md` (contract flow overview)
- `CONTRIBUTING.md` (pre-commit checklist, changesets, deployments)

## Development

This repo uses Bun by default. If you prefer npm, replace `bun run <script>`
with `npm run <script>`.

Common scripts:
- `bun run compile`
- `bun run test:mocked`
- `bun run test`
- `bun run deploy:local`
- `bun run deploy:sepolia`

## License

MIT
