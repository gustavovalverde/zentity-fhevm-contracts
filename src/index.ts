/**
 * @zentity/fhevm-contracts
 *
 * fhEVM smart contracts for privacy-preserving identity attestations
 */

import complianceRulesAbi from "../abi/ComplianceRules.json";
import compliantErc20Abi from "../abi/CompliantERC20.json";
import identityRegistryAbi from "../abi/IdentityRegistry.json";
import hardhatAddressesJson from "../deployments/hardhat/addresses.json";
import sepoliaAddressesJson from "../deployments/sepolia/addresses.json";

export const CONTRACT_NAMES = ["IdentityRegistry", "ComplianceRules", "CompliantERC20"] as const;

export type ContractName = (typeof CONTRACT_NAMES)[number];

export type ContractAddresses = {
  IdentityRegistry: string;
  ComplianceRules: string;
  CompliantERC20: string;
};

export type DeploymentManifest = {
  network: string;
  chainId: number;
  deployedAt?: string;
  deployer?: string;
  contracts: Record<ContractName, { address: string; txHash?: string }>;
};

type AddressesFile = {
  network?: string;
  chainId?: number;
  deployedAt?: string;
  deployer?: string;
  contracts: Record<ContractName, { address: string; txHash?: string }>;
};

const hardhatAddresses = hardhatAddressesJson as AddressesFile;
const sepoliaAddresses = sepoliaAddressesJson as AddressesFile;

export const CHAIN_ID_BY_NETWORK = {
  hardhat: 31337,
  localhost: 31337,
  sepolia: 11155111,
} as const;

export type NetworkName = keyof typeof CHAIN_ID_BY_NETWORK;
export type ChainId = (typeof CHAIN_ID_BY_NETWORK)[NetworkName];

function toManifest(
  source: AddressesFile,
  fallbackNetwork: NetworkName,
  fallbackChainId: number,
): DeploymentManifest {
  return {
    network: source.network ?? fallbackNetwork,
    chainId: source.chainId ?? fallbackChainId,
    deployedAt: source.deployedAt,
    deployer: source.deployer,
    contracts: {
      IdentityRegistry: source.contracts.IdentityRegistry,
      ComplianceRules: source.contracts.ComplianceRules,
      CompliantERC20: source.contracts.CompliantERC20,
    },
  };
}

export const DEPLOYMENTS: Partial<Record<NetworkName, DeploymentManifest>> = {
  hardhat: toManifest(hardhatAddresses, "hardhat", CHAIN_ID_BY_NETWORK.hardhat),
  localhost: toManifest(hardhatAddresses, "localhost", CHAIN_ID_BY_NETWORK.localhost),
  sepolia: toManifest(sepoliaAddresses, "sepolia", CHAIN_ID_BY_NETWORK.sepolia),
};

function toAddresses(source: AddressesFile): ContractAddresses {
  return {
    IdentityRegistry: source.contracts.IdentityRegistry.address,
    ComplianceRules: source.contracts.ComplianceRules.address,
    CompliantERC20: source.contracts.CompliantERC20.address,
  };
}

export const ADDRESSES = {
  hardhat: toAddresses(hardhatAddresses),
  localhost: toAddresses(hardhatAddresses),
  sepolia: toAddresses(sepoliaAddresses),
} as const satisfies Record<string, ContractAddresses>;

export const ABIS = {
  IdentityRegistry: identityRegistryAbi,
  ComplianceRules: complianceRulesAbi,
  CompliantERC20: compliantErc20Abi,
} as const;

export type AbiMap = typeof ABIS;

export function getAbi(name: ContractName) {
  return ABIS[name];
}

export const IdentityRegistryABI = identityRegistryAbi;
export const ComplianceRulesABI = complianceRulesAbi;
export const CompliantERC20ABI = compliantErc20Abi;

export function getDeployment(network: NetworkName): DeploymentManifest {
  const deployment = DEPLOYMENTS[network];
  if (!deployment) {
    throw new Error(
      `No deployments found for network "${network}". Deploy contracts and add deployments/${network}/*.json.`,
    );
  }
  return deployment;
}

export function hasDeployment(network: NetworkName): boolean {
  return Boolean(DEPLOYMENTS[network]);
}

export function isNetworkName(value: string): value is NetworkName {
  return value in CHAIN_ID_BY_NETWORK;
}

export function getNetworkNames(chainId: number): NetworkName[] {
  return (Object.keys(CHAIN_ID_BY_NETWORK) as NetworkName[]).filter(
    (name) => CHAIN_ID_BY_NETWORK[name] === chainId,
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

export function getContractAddresses(
  networkOrChainId: NetworkName | number,
  options?: {
    prefer?: NetworkName;
    overrides?: Partial<ContractAddresses>;
  },
): ContractAddresses {
  const network =
    typeof networkOrChainId === "number"
      ? getNetworkName(networkOrChainId, options?.prefer)
      : networkOrChainId;

  const deployment = getDeployment(network);
  const base = {
    IdentityRegistry: deployment.contracts.IdentityRegistry.address,
    ComplianceRules: deployment.contracts.ComplianceRules.address,
    CompliantERC20: deployment.contracts.CompliantERC20.address,
  };

  return { ...base, ...(options?.overrides ?? {}) };
}

export function resolveContractAddresses(
  networkOrChainId: NetworkName | number,
  options?: {
    prefer?: NetworkName;
    overrides?: Partial<ContractAddresses>;
  },
): ContractAddresses {
  const network =
    typeof networkOrChainId === "number"
      ? getNetworkName(networkOrChainId, options?.prefer)
      : networkOrChainId;

  if (hasDeployment(network)) {
    return getContractAddresses(network, options);
  }

  const overrides = options?.overrides ?? {};
  const missing = CONTRACT_NAMES.filter((name) => !overrides[name]);
  if (missing.length > 0) {
    throw new Error(
      `No deployment found for "${network}". Provide overrides for: ${missing.join(", ")}.`,
    );
  }

  return overrides as ContractAddresses;
}
