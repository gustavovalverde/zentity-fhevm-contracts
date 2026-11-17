/**
 * Writes the published manifest, `deployments/<network>/addresses.json`, from the Ignition
 * deployment recorded for the network's chain in `ignition/deployments/chain-<chainId>`.
 *
 * Usage: bun scripts/consolidate-deployments.ts [network...]
 *        Defaults to every network. A network without a recorded Ignition deployment keeps its
 *        manifest. So does `hardhat`: in-process deployments are not recorded, and its manifest
 *        holds the addresses a fresh `hardhat node` gets from `bun run deploy:local`.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { status } from "@nomicfoundation/ignition-core";
import {
  chainIdByNetwork,
  contractNames,
  getRequiredContracts,
  isNetworkName,
  type NetworkName,
} from "../src/contract-names.js";
import {
  type DeploymentManifest,
  ignitionDeploymentDir,
  ignitionFutureIds,
  manifestPath,
  readManifest,
  writeManifest,
} from "./deployment-manifest.js";

async function consolidateNetwork(network: NetworkName): Promise<void> {
  const deploymentDir = ignitionDeploymentDir(network);
  if (network === "hardhat" || !existsSync(deploymentDir)) {
    if (readManifest(network)) {
      console.log(`  ✓ ${manifestPath(network)} (kept, no Ignition deployment to read)`);
    }
    return;
  }

  const deployment = await status(deploymentDir);
  const contracts: DeploymentManifest["contracts"] = {};
  for (const name of contractNames) {
    const deployed = deployment.contracts[ignitionFutureIds[name]];
    if (deployed) {
      contracts[name] = { address: deployed.address };
    }
  }

  const missing = getRequiredContracts(network).filter((name) => !contracts[name]);
  if (missing.length > 0) {
    throw new Error(`Missing contracts for ${network} in ${deploymentDir}: ${missing.join(", ")}`);
  }

  mkdirSync(dirname(manifestPath(network)), { recursive: true });
  const written = writeManifest({ network, chainId: chainIdByNetwork[network], contracts });
  console.log(`  ✓ ${written}`);
}

const args = process.argv.slice(2);
const unknown = args.filter((name) => !isNetworkName(name));
if (unknown.length > 0) {
  console.error(`Unknown network(s): ${unknown.join(", ")}. Add them to chainIdByNetwork.`);
  process.exit(1);
}
const networks = (args.length > 0 ? args : Object.keys(chainIdByNetwork)) as NetworkName[];

console.log(`Consolidating deployments for: ${networks.join(", ")}`);
for (const network of networks) {
  await consolidateNetwork(network);
}
