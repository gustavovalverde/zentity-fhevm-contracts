/**
 * @zentity/fhevm-contracts
 *
 * fhEVM smart contracts for privacy-preserving identity attestations
 */

import complianceRulesAbi from "../abi/ComplianceRules.json";
import compliantErc20Abi from "../abi/CompliantERC20.json";
import identityRegistryAbi from "../abi/IdentityRegistry.json";
import hardhatAddressesJson from "../deployments/hardhat/addresses.json";

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

type HardhatAddressesFile = {
  network?: string;
  chainId?: number;
  deployedAt?: string;
  deployer?: string;
  contracts: Record<ContractName, { address: string; txHash?: string }>;
};

const hardhatAddresses = hardhatAddressesJson as HardhatAddressesFile;

export const CHAIN_ID_BY_NETWORK = {
  hardhat: 31337,
  localhost: 31337,
  sepolia: 11155111,
} as const;

export type NetworkName = keyof typeof CHAIN_ID_BY_NETWORK;
export type ChainId = (typeof CHAIN_ID_BY_NETWORK)[NetworkName];

export const DEPLOYMENTS: Partial<Record<NetworkName, DeploymentManifest>> = {
  hardhat: {
    network: hardhatAddresses.network ?? "hardhat",
    chainId: hardhatAddresses.chainId ?? CHAIN_ID_BY_NETWORK.hardhat,
    deployedAt: hardhatAddresses.deployedAt,
    deployer: hardhatAddresses.deployer,
    contracts: {
      IdentityRegistry: hardhatAddresses.contracts.IdentityRegistry,
      ComplianceRules: hardhatAddresses.contracts.ComplianceRules,
      CompliantERC20: hardhatAddresses.contracts.CompliantERC20,
    },
  },
};

export const ADDRESSES = {
  hardhat: {
    IdentityRegistry: hardhatAddresses.contracts.IdentityRegistry.address,
    ComplianceRules: hardhatAddresses.contracts.ComplianceRules.address,
    CompliantERC20: hardhatAddresses.contracts.CompliantERC20.address,
  },
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
