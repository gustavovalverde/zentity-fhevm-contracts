import fs from "node:fs";
import path from "node:path";
import fhevmPlugin from "@fhevm/hardhat-plugin-v3";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import * as dotenv from "dotenv";
import { configVariable, defineConfig } from "hardhat/config";

const nodeEnv = process.env.NODE_ENV;
const envFiles = [
  nodeEnv ? `.env.${nodeEnv}.local` : null,
  nodeEnv !== "test" ? ".env.local" : null,
  nodeEnv ? `.env.${nodeEnv}` : null,
  ".env",
].filter(Boolean) as string[];

for (const envFile of envFiles) {
  const envPath = path.resolve(process.cwd(), envFile);
  if (!fs.existsSync(envPath)) {
    continue;
  }
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const CONFIDENTIAL_CHAIN_RPC_URL =
  process.env.CONFIDENTIAL_CHAIN_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const LOCAL_RPC_URL =
  process.env.LOCAL_RPC_URL || process.env.NEXT_PUBLIC_LOCAL_RPC_URL || "http://127.0.0.1:8545";

// Tests (default profile) and Ignition deployments (production profile) compile with the same
// settings. A production profile left implicit would drop these settings.
const solidityCompiler = {
  version: "0.8.38",
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    // FHEVM requires at least the Cancun EVM.
    evmVersion: "cancun",
    outputSelection: {
      "*": {
        "*": ["storageLayout", "devdoc", "userdoc"],
      },
    },
  },
};

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers, fhevmPlugin],
  solidity: {
    profiles: {
      default: solidityCompiler,
      production: solidityCompiler,
    },
    npmFilesToBuild: ["@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol"],
  },
  networks: {
    default: {
      type: "edr-simulated",
      chainId: 31337,
      ...(process.env.MNEMONIC ? { accounts: { mnemonic: process.env.MNEMONIC } } : {}),
    },
    localhost: {
      type: "http",
      chainId: 31337,
      url: LOCAL_RPC_URL,
    },
    sepolia: {
      type: "http",
      chainId: 11155111,
      url: CONFIDENTIAL_CHAIN_RPC_URL,
      accounts: [configVariable("CONFIDENTIAL_CHAIN_DEPLOYER_PRIVATE_KEY")],
    },
    baseSepolia: {
      type: "http",
      chainId: 84532,
      url: BASE_SEPOLIA_RPC_URL,
      accounts: [configVariable("BASE_SEPOLIA_PRIVATE_KEY")],
    },
  },
  typechain: {
    outDir: "typechain-types",
  },
});
