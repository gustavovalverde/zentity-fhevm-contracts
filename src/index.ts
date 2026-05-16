/**
 * @zentity/contracts
 *
 * ABIs, deployments, and typed helpers for Zentity smart contracts.
 */

import { type Client, getContract } from "viem";
import complianceRulesAbiJson from "../abi/ComplianceRules.json";
import compliantErc20AbiJson from "../abi/CompliantERC20.json";
import identityRegistryAbiJson from "../abi/IdentityRegistry.json";
import identityRegistryMirrorAbiJson from "../abi/IdentityRegistryMirror.json";
import baseSepoliaAddressesJson from "../deployments/baseSepolia/addresses.json";
import hardhatAddressesJson from "../deployments/hardhat/addresses.json";
import sepoliaAddressesJson from "../deployments/sepolia/addresses.json";
import {
  type ChainId,
  type ConfidentialContractName,
  type ContractName,
  chainIdByNetwork,
  confidentialContractNames,
  contractNames,
  isNetworkName,
  type MirrorContractName,
  mirrorContractNames,
  type NetworkName,
} from "./contract-names";

export {
  type ChainId,
  type ConfidentialContractName,
  confidentialContractNames,
  type ContractName,
  chainIdByNetwork,
  contractNames,
  isNetworkName,
  type MirrorContractName,
  mirrorContractNames,
  type NetworkName,
};

export type ContractAddresses = Partial<Record<ContractName, string>>;

export type ConfidentialContractAddresses = Record<ConfidentialContractName, string>;

export type ContractDeployment<TContractName extends ContractName = ContractName> = Record<
  TContractName,
  { address: string; txHash?: string }
>;

export type DeploymentManifest<TContractName extends ContractName = ContractName> = {
  network: string;
  chainId: number;
  deployedAt?: string;
  deployer?: string;
  contracts: ContractDeployment<TContractName>;
};

export type ConfidentialDeploymentManifest = DeploymentManifest<ConfidentialContractName>;
export type MirrorDeploymentManifest = DeploymentManifest<MirrorContractName>;

type AddressesFile = Omit<DeploymentManifest, "contracts"> & {
  contracts: Partial<Record<ContractName, { address: string; txHash?: string }>>;
};

const hardhatAddresses = hardhatAddressesJson as AddressesFile;
const baseSepoliaAddresses = baseSepoliaAddressesJson as AddressesFile;
const sepoliaAddresses = sepoliaAddressesJson as AddressesFile;

function requireDeploymentContracts<TContractName extends ContractName>(
  source: AddressesFile,
  required: readonly TContractName[],
  network: NetworkName,
): ContractDeployment<TContractName> {
  const missing = required.filter((name) => !source.contracts[name]);
  if (missing.length > 0) {
    throw new Error(`Missing deployment contract(s) for ${network}: ${missing.join(", ")}.`);
  }

  return Object.fromEntries(
    required.map((name) => [name, source.contracts[name]]),
  ) as ContractDeployment<TContractName>;
}

function toManifest<TContractName extends ContractName>(
  source: AddressesFile,
  defaultNetwork: NetworkName,
  defaultChainId: number,
  required: readonly TContractName[],
): DeploymentManifest<TContractName> {
  return {
    network: source.network ?? defaultNetwork,
    chainId: source.chainId ?? defaultChainId,
    deployedAt: source.deployedAt,
    deployer: source.deployer,
    contracts: requireDeploymentContracts(source, required, defaultNetwork),
  };
}

const hardhatDeployment = toManifest(
  hardhatAddresses,
  "hardhat",
  chainIdByNetwork.hardhat,
  confidentialContractNames,
);
const localhostDeployment = toManifest(
  hardhatAddresses,
  "localhost",
  chainIdByNetwork.localhost,
  confidentialContractNames,
);
const sepoliaDeployment = toManifest(
  sepoliaAddresses,
  "sepolia",
  chainIdByNetwork.sepolia,
  confidentialContractNames,
);
const baseSepoliaDeployment = toManifest(
  baseSepoliaAddresses,
  "baseSepolia",
  chainIdByNetwork.baseSepolia,
  mirrorContractNames,
);

const deploymentsByNetwork: Partial<
  Record<NetworkName, ConfidentialDeploymentManifest | MirrorDeploymentManifest>
> = {
  hardhat: hardhatDeployment,
  localhost: localhostDeployment,
  sepolia: sepoliaDeployment,
  baseSepolia: baseSepoliaDeployment,
};

export type DeploymentsByChainId = {
  [chainIdByNetwork.hardhat]: ConfidentialDeploymentManifest;
  [chainIdByNetwork.sepolia]: ConfidentialDeploymentManifest;
} & Partial<Record<typeof chainIdByNetwork.baseSepolia, MirrorDeploymentManifest>>;

export const deployments: DeploymentsByChainId = {
  [chainIdByNetwork.hardhat]: hardhatDeployment,
  [chainIdByNetwork.sepolia]: sepoliaDeployment,
  [chainIdByNetwork.baseSepolia]: baseSepoliaDeployment,
};

function toAddresses(source: AddressesFile): ContractAddresses {
  return Object.fromEntries(
    Object.entries(source.contracts).map(([name, contract]) => [name, contract.address]),
  ) as ContractAddresses;
}

export const abis = {
  IdentityRegistry: identityRegistryAbiJson,
  ComplianceRules: complianceRulesAbiJson,
  CompliantERC20: compliantErc20AbiJson,
  IdentityRegistryMirror: identityRegistryMirrorAbiJson,
} as const;

export type AbiMap = typeof abis;

export const identityRegistryAbi = abis.IdentityRegistry;
export const complianceRulesAbi = abis.ComplianceRules;
export const compliantErc20Abi = abis.CompliantERC20;
export const identityRegistryMirrorAbi = abis.IdentityRegistryMirror;

export const attestedOnlyLevel = 0;

export const complianceLevels = {
  none: 1,
  basic: 2,
  full: 3,
  chip: 4,
} as const;

export function getAbi(name: ContractName) {
  return abis[name];
}

export function getDeployment(
  network: NetworkName,
): ConfidentialDeploymentManifest | MirrorDeploymentManifest {
  const deployment = deploymentsByNetwork[network];
  if (!deployment) {
    throw new Error(
      `No deployments found for network "${network}". Deploy contracts or provide address overrides.`,
    );
  }
  return deployment;
}

export function hasDeployment(network: NetworkName): boolean {
  return Boolean(deploymentsByNetwork[network]);
}

export function getNetworkNames(chainId: number): NetworkName[] {
  return (Object.keys(chainIdByNetwork) as NetworkName[]).filter(
    (name) => chainIdByNetwork[name] === chainId,
  );
}

export function getNetworkName(chainId: number, prefer?: NetworkName): NetworkName {
  const matches = getNetworkNames(chainId);
  if (matches.length === 0) {
    throw new Error(`No network mapped for chainId ${chainId}`);
  }
  if (prefer && matches.includes(prefer)) return prefer;
  return matches[0];
}

function normalizeNetwork(
  networkOrChainId: NetworkName | number,
  prefer?: NetworkName,
): NetworkName {
  return typeof networkOrChainId === "number"
    ? getNetworkName(networkOrChainId, prefer)
    : networkOrChainId;
}

function requireAddressMap<TContractName extends ContractName>(
  contracts: ContractAddresses,
  required: readonly TContractName[],
  network: NetworkName,
): Record<TContractName, string> {
  const missing = required.filter((name) => !contracts[name]);
  if (missing.length > 0) {
    throw new Error(`Missing contract address(es) for ${network}: ${missing.join(", ")}.`);
  }

  return Object.fromEntries(required.map((name) => [name, contracts[name]])) as Record<
    TContractName,
    string
  >;
}

export function getContractAddresses(
  networkOrChainId: NetworkName | number,
  options?: {
    prefer?: NetworkName;
    overrides?: ContractAddresses;
  },
): ContractAddresses {
  const network = normalizeNetwork(networkOrChainId, options?.prefer);
  const deployment = deploymentsByNetwork[network];

  if (!deployment && !options?.overrides) {
    throw new Error(
      `No deployment found for "${network}". Provide address overrides or deploy contracts first.`,
    );
  }

  return {
    ...(deployment ? toAddresses(deployment) : {}),
    ...(options?.overrides ?? {}),
  };
}

export function getConfidentialContractAddresses(
  networkOrChainId: NetworkName | number,
  options?: {
    prefer?: NetworkName;
    overrides?: Partial<ConfidentialContractAddresses>;
  },
): ConfidentialContractAddresses {
  const network = normalizeNetwork(networkOrChainId, options?.prefer);
  const contracts = getContractAddresses(network, {
    overrides: options?.overrides,
  });

  return requireAddressMap(contracts, confidentialContractNames, network);
}

export function getIdentityRegistryMirrorAddress(
  networkOrChainId: NetworkName | number,
  options?: {
    prefer?: NetworkName;
    overrides?: Partial<Record<MirrorContractName, string>>;
  },
): string {
  const network = normalizeNetwork(networkOrChainId, options?.prefer);
  const contracts = getContractAddresses(network, {
    overrides: options?.overrides,
  });

  return requireAddressMap(contracts, mirrorContractNames, network).IdentityRegistryMirror;
}

type ContractClientOptions<TOverrides extends ContractAddresses> = {
  address?: string;
  network?: NetworkName | number;
  overrides?: Partial<TOverrides>;
  prefer?: NetworkName;
};

function resolveClientChainId(
  client: Client,
  explicitNetwork?: NetworkName | number,
): NetworkName | number {
  if (explicitNetwork !== undefined) {
    return explicitNetwork;
  }

  const chainId = client.chain?.id;
  if (typeof chainId !== "number") {
    throw new Error("A network or client with chain metadata is required.");
  }

  return chainId;
}

export function getIdentityRegistry(
  client: Client,
  options?: ContractClientOptions<ConfidentialContractAddresses>,
) {
  const address =
    options?.address ??
    getConfidentialContractAddresses(resolveClientChainId(client, options?.network), {
      prefer: options?.prefer,
      overrides: options?.overrides,
    }).IdentityRegistry;

  return getContract({
    address: address as `0x${string}`,
    abi: identityRegistryAbi,
    client,
  });
}

export function getIdentityRegistryMirror(
  client: Client,
  options?: ContractClientOptions<Record<MirrorContractName, string>>,
) {
  const address =
    options?.address ??
    getIdentityRegistryMirrorAddress(resolveClientChainId(client, options?.network), {
      prefer: options?.prefer,
      overrides: options?.overrides,
    });

  return getContract({
    address: address as `0x${string}`,
    abi: identityRegistryMirrorAbi,
    client,
  });
}

// ============ EIP-712 Permit Types ============

/** Attribute bitmask constants for grantAttributeAccess. */
export const ATTR = {
  BIRTH_YEAR: 0x01,
  COUNTRY: 0x02,
  COMPLIANCE: 0x04,
  BLACKLIST: 0x08,
  ALL: 0x0f,
} as const;

/** Purpose enum matching the Solidity `IIdentityRegistry.Purpose`. */
export enum Purpose {
  COMPLIANCE_CHECK = 0,
  AGE_VERIFICATION = 1,
  NATIONALITY_CHECK = 2,
  TRANSFER_GATING = 3,
  AUDIT = 4,
}

/** EIP-712 type definition for the attestation permit. */
export const ATTEST_PERMIT_TYPES = {
  AttestPermit: [
    { name: "user", type: "address" },
    { name: "birthYearOffset", type: "uint8" },
    { name: "countryCode", type: "uint16" },
    { name: "complianceLevel", type: "uint8" },
    { name: "isBlacklisted", type: "bool" },
    { name: "proofSetHash", type: "bytes32" },
    { name: "policyVersion", type: "uint32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Build the EIP-712 domain for attestation permit signing. */
export function getAttestPermitDomain(chainId: number, registryAddress: string) {
  return {
    name: "ZentityIdentityRegistry",
    version: "2",
    chainId,
    verifyingContract: registryAddress,
  };
}

/** TypeScript type for the permit struct. */
export interface AttestPermitData {
  birthYearOffset: number;
  countryCode: number;
  complianceLevel: number;
  isBlacklisted: boolean;
  proofSetHash: string;
  policyVersion: number;
  deadline: number;
  v: number;
  r: string;
  s: string;
}

// ============ User Consent Types ============

/** EIP-712 type definition for user consent receipt. */
export const CONSENT_TYPES = {
  UserConsent: [
    { name: "user", type: "address" },
    { name: "attributeMask", type: "uint8" },
    { name: "chainId", type: "uint256" },
    { name: "revision", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export interface UserConsent {
  user: string;
  attributeMask: number;
  chainId: number;
  revision: number;
  deadline: number;
}

export interface ConsentSignature {
  v: number;
  r: string;
  s: string;
  attributeMask: number;
  deadline: number;
}

/** Compute the revision that a consent signature should bind to. */
export function getConsentRevision(currentRevision: bigint, isCurrentlyAttested: boolean): bigint;
export function getConsentRevision(currentRevision: number, isCurrentlyAttested: boolean): number;
export function getConsentRevision(currentRevision: bigint | number, isCurrentlyAttested: boolean) {
  if (!isCurrentlyAttested) {
    return currentRevision;
  }

  return typeof currentRevision === "bigint" ? currentRevision + 1n : currentRevision + 1;
}
