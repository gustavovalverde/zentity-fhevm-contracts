import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, save, getOrNull } = hre.deployments;

  const existing = await getOrNull("IdentityRegistry");
  if (existing) {
    console.log(`  IdentityRegistry already deployed at ${existing.address}`);
    return;
  }

  const implementation = await deploy("IdentityRegistry_Implementation", {
    contract: "IdentityRegistry",
    from: deployer,
    log: true,
  });

  const implementationFactory = await hre.ethers.getContractFactory("IdentityRegistry");
  const initData = implementationFactory.interface.encodeFunctionData("initialize", [deployer]);

  const proxy = await deploy("IdentityRegistry_Proxy", {
    contract: "ERC1967Proxy",
    from: deployer,
    args: [implementation.address, initData],
    log: true,
  });

  const implementationArtifact = await hre.deployments.getArtifact("IdentityRegistry");
  await save("IdentityRegistry", {
    ...implementationArtifact,
    address: proxy.address,
    transactionHash: proxy.transactionHash,
  });

  console.log(`  IdentityRegistry proxy: ${proxy.address}`);
  console.log(`  Implementation: ${implementation.address}`);
  console.log(`  Owner + Registrar: ${deployer}`);
};

export default func;
func.id = "deploy_identity_registry";
func.tags = ["Fhevm", "IdentityRegistry"];
