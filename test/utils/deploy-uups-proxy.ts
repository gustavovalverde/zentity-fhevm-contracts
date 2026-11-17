import type { HardhatEthers } from "@nomicfoundation/hardhat-ethers/types";

/**
 * Deploy a UUPS implementation and an ERC1967 proxy wrapping it, then return
 * the proxy address. Callers bind the typechain-typed contract themselves via
 * `ethers.getContractAt("ContractName", address)` to preserve type safety.
 */
export async function deployUupsProxy(
  ethers: HardhatEthers,
  contractName: string,
  initArgs: readonly unknown[],
): Promise<string> {
  const factory = await ethers.getContractFactory(contractName);
  const implementation = await factory.deploy();
  await implementation.waitForDeployment();

  const proxyFactory = await ethers.getContractFactory("ERC1967Proxy");
  const initData = factory.interface.encodeFunctionData("initialize", initArgs);
  const proxy = await proxyFactory.deploy(await implementation.getAddress(), initData);
  await proxy.waitForDeployment();

  return proxy.getAddress();
}
