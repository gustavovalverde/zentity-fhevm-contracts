import {
  type ContractName,
  contractNames,
  isNetworkName,
  type NetworkName,
} from "../src/contract-names.js";
import { manifestPath, readManifest } from "./deployment-manifest.js";

const rawArgs = process.argv.slice(2);
const networkArg = rawArgs.find((arg) => !arg.startsWith("-")) ?? "sepolia";
const envStyle = rawArgs.includes("--env");

if (!isNetworkName(networkArg)) {
  console.error(`Unknown network "${networkArg}"`);
  process.exit(1);
}
const network: NetworkName = networkArg;

const envPrefixByNetwork: Record<NetworkName, string> = {
  hardhat: "LOCAL_",
  localhost: "LOCAL_",
  sepolia: "CONFIDENTIAL_CHAIN_",
  baseSepolia: "BASE_SEPOLIA_",
};

const envKeyByContract: Record<ContractName, string> = {
  IdentityRegistry: "IDENTITY_REGISTRY",
  IdentityRegistryMirror: "IDENTITY_REGISTRY_MIRROR",
  ComplianceRules: "COMPLIANCE_RULES",
  CompliantERC20: "COMPLIANT_ERC20",
};

const manifest = readManifest(network);
const addresses = Object.fromEntries(
  contractNames.map((name) => [name, manifest?.contracts[name]?.address ?? null]),
) as Record<ContractName, string | null>;
const deployedContractNames = contractNames.filter((name) => addresses[name]);

if (deployedContractNames.length === 0) {
  console.error(`No deployments found at ${manifestPath(network)}`);
  process.exit(1);
}

if (envStyle) {
  const prefix = envPrefixByNetwork[network];
  for (const name of deployedContractNames) {
    console.log(`${prefix}${envKeyByContract[name]}=${addresses[name] ?? ""}`);
  }
} else {
  console.log(JSON.stringify({ network, ...addresses }, null, 2));
}
