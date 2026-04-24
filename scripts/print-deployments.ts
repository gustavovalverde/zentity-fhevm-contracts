import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type ContractName,
  contractNames,
  isNetworkName,
  type NetworkName,
} from "../src/contract-names";

const rawArgs = process.argv.slice(2);
const networkArg = rawArgs.find((arg) => !arg.startsWith("-")) ?? "sepolia";
const envStyle = rawArgs.includes("--env");

if (!isNetworkName(networkArg)) {
  console.error(`Unknown network "${networkArg}"`);
  process.exit(1);
}
const network: NetworkName = networkArg;
const baseDir = resolve(process.cwd(), "deployments", network);

function readAddress(contractName: ContractName): string | null {
  try {
    const json = JSON.parse(readFileSync(join(baseDir, `${contractName}.json`), "utf8")) as {
      address?: string;
    };
    return json.address ?? null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

const envPrefixByNetwork: Record<NetworkName, string> = {
  hardhat: "LOCAL_",
  localhost: "LOCAL_",
  sepolia: "FHEVM_",
  baseSepolia: "BASE_SEPOLIA_",
};

const envKeyByContract: Record<ContractName, string> = {
  IdentityRegistry: "IDENTITY_REGISTRY",
  IdentityRegistryMirror: "IDENTITY_REGISTRY_MIRROR",
  ComplianceRules: "COMPLIANCE_RULES",
  CompliantERC20: "COMPLIANT_ERC20",
};

const addresses = Object.fromEntries(
  contractNames.map((name) => [name, readAddress(name)]),
) as Record<ContractName, string | null>;
const deployedContractNames = contractNames.filter((name) => addresses[name]);

if (contractNames.every((name) => !addresses[name])) {
  console.error(`No deployments found at ${baseDir}`);
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
