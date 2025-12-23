import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;

  const compliance = await get("ComplianceRules");

  const token = await deploy("CompliantERC20", {
    from: deployer,
    args: ["Zentity Token", "ZTY", compliance.address],
    log: true,
  });

  await execute(
    "ComplianceRules",
    { from: deployer, log: true },
    "setAuthorizedCaller",
    token.address,
    true,
  );

  console.log(`  Name: Zentity Token`);
  console.log(`  Symbol: ZTY`);
  console.log(`  Compliance: ${compliance.address}`);
  console.log(`  Authorized Caller: ${token.address}`);
};

export default func;
func.id = "deploy_compliant_erc20";
func.tags = ["CompliantERC20"];
func.dependencies = ["ComplianceRules"];
