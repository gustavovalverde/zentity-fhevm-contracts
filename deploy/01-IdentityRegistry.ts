import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const result = await deploy("IdentityRegistry", {
    from: deployer,
    log: true,
  });

  // Add deployer as registrar after deployment
  if (result.newlyDeployed) {
    const registry = await hre.ethers.getContractAt("IdentityRegistry", result.address);
    const tx = await registry.addRegistrar(deployer);
    await tx.wait();
    console.log(`  Registrar added: ${deployer}`);
  }
};

export default func;
func.id = "deploy_identity_registry";
func.tags = ["IdentityRegistry"];
