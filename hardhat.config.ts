import type { HardhatUserConfig } from "hardhat/config";
import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "solidity-docgen";
import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";

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

const MNEMONIC =
  process.env.MNEMONIC || "test test test test test test test test test test test junk";
const CONFIDENTIAL_CHAIN_DEPLOYER_PRIVATE_KEY =
  process.env.CONFIDENTIAL_CHAIN_DEPLOYER_PRIVATE_KEY ??
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const CONFIDENTIAL_CHAIN_RPC_URL =
  process.env.CONFIDENTIAL_CHAIN_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const BASE_SEPOLIA_PRIVATE_KEY =
  process.env.BASE_SEPOLIA_PRIVATE_KEY ??
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const LOCAL_RPC_URL =
  process.env.LOCAL_RPC_URL || process.env.NEXT_PUBLIC_LOCAL_RPC_URL || "http://127.0.0.1:8545";

const config: HardhatUserConfig = {
  namedAccounts: {
    deployer: 0,
  },
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
      outputSelection: {
        "*": {
          "*": ["storageLayout", "devdoc", "userdoc"],
        },
      },
    },
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: MNEMONIC,
      },
      chainId: 31337,
    },
    localhost: {
      url: LOCAL_RPC_URL,
    },
    sepolia: {
      url: CONFIDENTIAL_CHAIN_RPC_URL,
      accounts: [CONFIDENTIAL_CHAIN_DEPLOYER_PRIVATE_KEY],
      chainId: 11155111,
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      accounts: [BASE_SEPOLIA_PRIVATE_KEY],
      chainId: 84532,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  docgen: {
    outputDir: "docs",
    pages: "files",
  },
};

export default config;
