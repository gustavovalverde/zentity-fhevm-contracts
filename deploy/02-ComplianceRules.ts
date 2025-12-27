import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;

  const registry = await get("IdentityRegistry");
  const minComplianceLevel = 1;

  await deploy("ComplianceRules", {
    from: deployer,
    args: [registry.address, minComplianceLevel],
    log: true,
  });

  console.log(`  Registry: ${registry.address}`);
  console.log(`  Min Compliance Level: ${minComplianceLevel}`);
};

export default func;
func.id = "deploy_compliance_rules";
func.tags = ["ComplianceRules"];
func.dependencies = ["IdentityRegistry"];
