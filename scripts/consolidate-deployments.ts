/**
 * Consolidate hardhat-deploy JSON files into a single addresses.json per network.
 *
 * Reads `deployments/{network}/*.json` (hardhat-deploy format),
 * extracts `.address` and `.transactionHash`, and writes `addresses.json`.
 *
 * Usage: bun scripts/consolidate-deployments.ts [network...]
 *        Defaults to all directories under deployments/ if no args given.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  chainIdByNetwork,
  contractNames,
  getRequiredContracts,
  isNetworkName,
} from "../src/contract-names";

const DEPLOYMENTS_DIR = resolve(__dirname, "../deployments");

type ContractEntry = { address: string; txHash?: string };

function readJsonIfExists<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function consolidateNetwork(network: string): void {
  if (!isNetworkName(network)) {
    console.error(`  Unknown network "${network}" — add it to chainIdByNetwork`);
    process.exit(1);
  }

  const networkDir = join(DEPLOYMENTS_DIR, network);
  const contracts: Record<string, ContractEntry> = {};
  let foundAny = false;

  for (const name of contractNames) {
    const raw = readJsonIfExists<{ address: string; transactionHash?: string }>(
      join(networkDir, `${name}.json`),
    );
    if (!raw) {
      console.warn(`  Missing ${name}.json — skipping`);
      continue;
    }
    foundAny = true;
    contracts[name] = {
      address: raw.address,
      ...(raw.transactionHash ? { txHash: raw.transactionHash } : {}),
    };
  }

  const addressesPath = join(networkDir, "addresses.json");
  if (!foundAny && readJsonIfExists(addressesPath)) {
    console.log(`  ✓ ${addressesPath} (already exists)`);
    return;
  }

  const missing = getRequiredContracts(network).filter((n) => !contracts[n]);
  if (missing.length > 0) {
    console.error(`  Missing contracts for ${network}: ${missing.join(", ")}`);
    process.exit(1);
  }

  const chainId = chainIdByNetwork[network];

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
