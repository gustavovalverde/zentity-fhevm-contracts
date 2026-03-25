import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, save, getOrNull } = hre.deployments;

  // Check if already deployed
  const existing = await getOrNull("IdentityRegistry");
  if (existing) {
    console.log(`  IdentityRegistry already deployed at ${existing.address}`);
    return;
  }

  // 1. Deploy implementation
  const impl = await deploy("IdentityRegistry_Implementation", {
    contract: "IdentityRegistry",
    from: deployer,
    log: true,
  });

  // 2. Encode initialize(deployer) calldata
  const iface = new hre.ethers.Interface(["function initialize(address initialOwner)"]);
  const initData = iface.encodeFunctionData("initialize", [deployer]);

  // 3. Deploy ERC1967Proxy pointing to implementation
  const proxy = await deploy("IdentityRegistry_Proxy", {
    contract: "ERC1967Proxy",
    from: deployer,
    args: [impl.address, initData],
    log: true,
  });

  // 4. Save the proxy as "IdentityRegistry" with the implementation ABI
  const implArtifact = await hre.deployments.getArtifact("IdentityRegistry");
  await save("IdentityRegistry", {
    address: proxy.address,
    abi: implArtifact.abi,
    implementation: impl.address,
  });

  console.log(`  IdentityRegistry proxy: ${proxy.address}`);
  console.log(`  Implementation: ${impl.address}`);
  console.log(`  Owner + Registrar: ${deployer}`);
};

export default func;
func.id = "deploy_identity_registry";
func.tags = ["IdentityRegistry"];
