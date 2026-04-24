import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from "hardhat/builtin-tasks/task-names";
import type { HardhatUserConfig } from "hardhat/config";
import { subtask } from "hardhat/config";
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

const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const BASE_SEPOLIA_PRIVATE_KEY =
  process.env.BASE_SEPOLIA_PRIVATE_KEY ??
  "0x0000000000000000000000000000000000000000000000000000000000000001";

const BASE_DEPLOYMENT_SOURCE_PATHS = new Set([
  path.normalize(path.join(process.cwd(), "contracts/core/IdentityRegistryMirror.sol")),
  path.normalize(path.join(process.cwd(), "contracts/proxy/ERC1967Proxy.sol")),
]);

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_taskArgs, _hre, runSuper) => {
  const sourcePaths = (await runSuper()) as string[];
  return sourcePaths.filter((sourcePath) =>
    BASE_DEPLOYMENT_SOURCE_PATHS.has(path.normalize(sourcePath)),
  );
});

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
