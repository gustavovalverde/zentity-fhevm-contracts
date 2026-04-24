# Guide (deployment, testing, funding, ownership)

## Environment files

Common Node conventions are supported:

- `.env` — shared defaults (non-secrets)
- `.env.local` — secrets or machine-specific values
- Optional: `.env.<env>` / `.env.<env>.local` when `NODE_ENV` is set

Use `.env.example` as the template.

## Local deploy (hardhat node)

1) Start a local node:

```bash
bunx hardhat node
```

2) Deploy to localhost:

```bash
bun run deploy:local
```

The local deploy command also runs write-path validation against the deployed
`IdentityRegistryMirror`: record, threshold read, level update, and revoke.
To rerun validation without redeploying:

```bash
bun run validate:local
```

3) Print addresses:

```bash
bun run print:deployments localhost --env
```

Addresses are written to `deployments/localhost`.

## Sepolia deploy

Required env values (put secrets in `.env.local`):

```
FHEVM_RPC_URL=...
FHEVM_PROVIDER_ID=zama # zama = Zama relayer SDK
FHEVM_PRIVATE_KEY=0x...
```

Deploy:

```bash
bun run deploy:sepolia
```

Print addresses:

```bash
bun run print:deployments sepolia --env
```

Addresses are written to `deployments/sepolia`.

## Base Sepolia mirror deploy

The Base mirror is the public, plaintext read layer for x402 and other
resource-server reads. It stores only the active attestation marker and
compliance level.

For the rationale and privacy boundary, see
[Production Attestation Architecture](production-attestation-architecture.md#public-read-mirrors).

Required env values:

```
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_SEPOLIA_PRIVATE_KEY=0x...
BASE_SEPOLIA_REGISTRAR_ADDRESS=0x...
```

`BASE_SEPOLIA_PRIVATE_KEY` deploys the proxy and owns the initial upgrade/admin
role. `BASE_SEPOLIA_REGISTRAR_ADDRESS` is the separate writer identity that
records mirrored compliance levels.

Deploy:

```bash
bun run deploy:base-sepolia
```

The Base deploy command validates the deployed mirror bytecode, owner, registrar,
and level constants before it exits. To rerun read-only validation:

```bash
bun run validate:base-sepolia
```

Print the address:

```bash
bun run print:deployments baseSepolia --env
```

Configure the web app with the printed mirror address as
`BASE_SEPOLIA_IDENTITY_REGISTRY_MIRROR`.

The committed Base Sepolia manifest is exported as
`@zentity/contracts/deployments/baseSepolia`.
App code should prefer that package manifest and use
`BASE_SEPOLIA_IDENTITY_REGISTRY_MIRROR` only for alternate deployments.
`BASE_SEPOLIA_REGISTRAR_PRIVATE_KEY` must correspond to the registrar address
configured during deployment.

## Testing

### Step-up matrix

Run these in order as you get closer to production deployments.

1) Lint + types:

```bash
bun run lint
bun run lint:sol
bun run typecheck
```

2) Mocked tests (fast, no node):

```bash
bun run test:mocked
```

3) Full Hardhat in-memory tests:

```bash
bun run test
```

4) Local network tests:

```bash
# terminal 1
bunx hardhat node

# terminal 2
bun run test:local
```

5) Sepolia integration tests:

```bash
bun run test:sepolia
```

To validate already deployed Sepolia artifacts without running integration tests:

```bash
bun run validate:sepolia
```

### Sepolia integration notes

- The **Full Integration Flow** requires at least 5 funded signers.
- If fewer than 5 signers are available, that suite is skipped (TODO in test).
- The **Sepolia Integration Smoke** suite runs with a single signer and
  verifies wiring between deployed contracts.

## Sepolia faucets

Faucet requirements can change over time. If one faucet rejects your wallet,
try another.

- https://sepoliafaucet.org (public, no registration)
- https://cloud.google.com/application/web3/faucet/ethereum/sepolia (Google account login)
- https://www.alchemy.com/faucets/ethereum-sepolia (eligibility checks may include mainnet ETH balance and activity)
- https://faucet.quicknode.com/ethereum/sepolia (requires mainnet ETH balance)
- https://www.infura.io/faucet/sepolia (account login)

Suggested flow:
1) Create a dedicated testnet deployer wallet.
2) Request Sepolia ETH from a faucet.
3) Confirm funds in a Sepolia explorer.
4) Deploy contracts.

## Ownership & admin safety

All admin-managed contracts in this repo use **two-step ownership transfer**:

1) `transferOwnership(newOwner)` by the current owner
2) `acceptOwnership()` by the pending owner

This prevents accidental ownership loss and makes transfers explicit.

Best practices:
- Use a **dedicated deployer wallet** (testnet only).
- Move ownership to a **multisig** after deployment.
- Avoid renouncing ownership unless no admin actions are ever needed.
- Keep the mirror registrar key separate from the proxy owner. The registrar
  writes mirrored compliance; ownership controls upgrades and registrar
  rotation.
- Revocation emits both `IdentityRevoked(user)` and `LevelUpdated(user, level, 0)`.
  Lifecycle indexers can subscribe to revocations; level-only indexers can
  remain consistent from level events alone.
- `currentMirrorAttestationId` is a mirror-local marker. It is stable across level
  changes and distinct from the encrypted fhEVM registry revision.
- `MAX_COMPLIANCE_LEVEL` is intentionally fixed at `4` for the current Zentity
  tier scale. Expanding the scale requires a proxy upgrade and a runbook entry.
- Before any mainnet deployment, add an operational circuit breaker or registrar
  pause path so a compromised registrar key can be contained quickly.
