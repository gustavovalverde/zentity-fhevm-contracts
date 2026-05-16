/**
 * Shared contract-name constants used by `src/index.ts`, deployment scripts,
 * and the ABI exporter. Kept ABI-free so it can run before artifacts exist.
 */

export const confidentialContractNames = [
  "IdentityRegistry",
  "ComplianceRules",
  "CompliantERC20",
] as const;

export const mirrorContractNames = ["IdentityRegistryMirror"] as const;

export const contractNames = [...confidentialContractNames, ...mirrorContractNames] as const;

export type ConfidentialContractName = (typeof confidentialContractNames)[number];
export type MirrorContractName = (typeof mirrorContractNames)[number];
export type ContractName = (typeof contractNames)[number];

export const chainIdByNetwork = {
  hardhat: 31_337,
  localhost: 31_337,
  sepolia: 11_155_111,
  baseSepolia: 84_532,
} as const;

export type NetworkName = keyof typeof chainIdByNetwork;
export type ChainId = (typeof chainIdByNetwork)[NetworkName];

const networkNames = Object.keys(chainIdByNetwork);

/** Which contracts a network is expected to host. */
export function getRequiredContracts(network: NetworkName): readonly ContractName[] {
  return network === "baseSepolia" ? mirrorContractNames : confidentialContractNames;
}

export function isNetworkName(value: string): value is NetworkName {
  return networkNames.includes(value);
}
