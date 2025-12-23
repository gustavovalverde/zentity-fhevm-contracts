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
PRIVATE_KEY=0x...
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
