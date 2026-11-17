import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ChainId,
  type ContractName,
  chainIdByNetwork,
  type NetworkName,
} from "../src/contract-names.js";

export const rootDir = join(import.meta.dirname, "..");

/** The published manifest for one network: `deployments/<network>/addresses.json`. */
export type DeploymentManifest = {
  network: NetworkName;
  chainId: ChainId;
  contracts: Partial<Record<ContractName, { address: string; txHash?: string }>>;
};

/** The Ignition future that holds each published address (the proxy, for upgradeable contracts). */
export const ignitionFutureIds: Record<ContractName, string> = {
  IdentityRegistry: "Confidential#IdentityRegistry",
  ComplianceRules: "Confidential#ComplianceRules",
  CompliantERC20: "Confidential#CompliantERC20",
  IdentityRegistryMirror: "IdentityRegistryMirror#IdentityRegistryMirror",
};

/** Ignition's default deployment directory for the network's chain. */
export function ignitionDeploymentDir(network: NetworkName): string {
  return join(rootDir, "ignition", "deployments", `chain-${chainIdByNetwork[network]}`);
}

export function manifestPath(network: NetworkName): string {
  return join(rootDir, "deployments", network, "addresses.json");
}

export function readManifest(network: NetworkName): DeploymentManifest | null {
  try {
    return JSON.parse(readFileSync(manifestPath(network), "utf8")) as DeploymentManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function writeManifest(manifest: DeploymentManifest): string {
  const path = manifestPath(manifest.network);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return path;
}
