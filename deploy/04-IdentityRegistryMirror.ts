import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, save } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying IdentityRegistryMirror...");

  if (hre.network.name === "baseSepolia" && !process.env.BASE_SEPOLIA_PRIVATE_KEY) {
    throw new Error("BASE_SEPOLIA_PRIVATE_KEY is required for Base Sepolia mirror deployment");
  }
  const registrar =
    hre.network.name === "baseSepolia" ? process.env.BASE_SEPOLIA_REGISTRAR_ADDRESS : deployer;
  if (!registrar) {
    throw new Error(
      "BASE_SEPOLIA_REGISTRAR_ADDRESS is required for Base Sepolia mirror deployment",
    );
  }

  const implementation = await deploy("IdentityRegistryMirror_Implementation", {
    from: deployer,
    contract: "IdentityRegistryMirror",
    args: [],
    log: true,
  });

  const implementationFactory = await ethers.getContractFactory("IdentityRegistryMirror");
  const initData = implementationFactory.interface.encodeFunctionData("initialize", [
    deployer,
    registrar,
  ]);

  const proxy = await deploy("IdentityRegistryMirror_Proxy", {
    from: deployer,
    contract: "ERC1967Proxy",
    args: [implementation.address, initData],
    log: true,
  });

  const implementationArtifact = await hre.deployments.getArtifact("IdentityRegistryMirror");
  await save("IdentityRegistryMirror", {
    ...implementationArtifact,
    address: proxy.address,
    transactionHash: proxy.transactionHash,
  });

  console.log(`  IdentityRegistryMirror proxy: ${proxy.address}`);
};

func.tags = ["IdentityRegistryMirror"];
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  !["baseSepolia", "hardhat", "localhost"].includes(hre.network.name);

export default func;
