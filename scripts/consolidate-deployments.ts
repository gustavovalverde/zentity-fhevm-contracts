/**
 * Consolidate hardhat-deploy JSON files into a single addresses.json per network.
 *
 * Reads `deployments/{network}/*.json` (hardhat-deploy format),
 * extracts `.address` and `.transactionHash`, and writes `addresses.json`.
 *
 * Usage: bun scripts/consolidate-deployments.ts [network...]
 *        Defaults to all directories under deployments/ if no args given.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DEPLOYMENTS_DIR = resolve(__dirname, "../deployments");
const CONTRACT_NAMES = ["IdentityRegistry", "ComplianceRules", "CompliantERC20"] as const;

const CHAIN_IDS: Record<string, number> = {
  hardhat: 31337,
  localhost: 31337,
  sepolia: 11155111,
};

type ContractEntry = { address: string; txHash?: string };

function consolidateNetwork(network: string): void {
  const networkDir = join(DEPLOYMENTS_DIR, network);
  if (!existsSync(networkDir)) {
    console.error(`No deployments directory for network "${network}"`);
    process.exit(1);
  }

  // Skip if addresses.json already exists and no individual contract JSONs are present
  const addressesPath = join(networkDir, "addresses.json");
  const hasContractJsons = CONTRACT_NAMES.some((n) => existsSync(join(networkDir, `${n}.json`)));
  if (existsSync(addressesPath) && !hasContractJsons) {
    console.log(`  ✓ ${addressesPath} (already exists)`);
    return;
  }

  const contracts: Record<string, ContractEntry> = {};

  for (const name of CONTRACT_NAMES) {
    const filePath = join(networkDir, `${name}.json`);
    if (!existsSync(filePath)) {
      console.warn(`  Missing ${name}.json — skipping`);
      continue;
    }
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    contracts[name] = {
      address: raw.address,
      ...(raw.transactionHash ? { txHash: raw.transactionHash } : {}),
    };
  }

  const missing = CONTRACT_NAMES.filter((n) => !contracts[n]);
  if (missing.length > 0) {
    console.error(`  Missing contracts for ${network}: ${missing.join(", ")}`);
    process.exit(1);
  }

  const chainId = CHAIN_IDS[network];
  if (!chainId) {
    console.error(`  Unknown chainId for network "${network}" — add it to CHAIN_IDS`);
    process.exit(1);
  }

  const output = {
    network,
    chainId,
    contracts,
  };

  const outPath = join(networkDir, "addresses.json");
  writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`  ✓ ${outPath}`);
}

// Determine networks: CLI args or auto-discover
const args = process.argv.slice(2);
const networks =
  args.length > 0
    ? args
    : readdirSync(DEPLOYMENTS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((name) => name !== "solcInputs");

console.log(`Consolidating deployments for: ${networks.join(", ")}`);
for (const network of networks) {
  consolidateNetwork(network);
}
