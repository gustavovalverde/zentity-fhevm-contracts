import { expect } from "chai";
import hre from "hardhat";

describe("Ownership transfers", () => {
  async function deployIdentityRegistryProxy() {
    const [owner] = await hre.ethers.getSigners();
    const factory = await hre.ethers.getContractFactory("IdentityRegistry");
    const impl = await factory.deploy();
    await impl.waitForDeployment();

    const proxyFactory = await hre.ethers.getContractFactory("ERC1967Proxy");
    const initData = factory.interface.encodeFunctionData("initialize", [owner.address]);
    const proxy = await proxyFactory.deploy(await impl.getAddress(), initData);
    await proxy.waitForDeployment();

    return hre.ethers.getContractAt("IdentityRegistry", await proxy.getAddress());
  }

  async function deployComplianceRules(registryAddress: string) {
    const factory = await hre.ethers.getContractFactory("ComplianceRules");
    const contract = await factory.deploy(registryAddress, 1);
    await contract.waitForDeployment();
    return contract;
  }

  async function deployCompliantERC20(checkerAddress: string) {
    const factory = await hre.ethers.getContractFactory("CompliantERC20");
    const contract = await factory.deploy("Zentity Token", "ZTY", checkerAddress);
    await contract.waitForDeployment();
    return contract;
  }

  it("supports two-step ownership in IdentityRegistry (via proxy)", async () => {
    const registry = await deployIdentityRegistryProxy();
    const [owner, nextOwner, other] = await hre.ethers.getSigners();

    expect(await registry.owner()).to.equal(owner.address);

    await expect(
      registry.connect(other).transferOwnership(nextOwner.address),
    ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");

    await registry.connect(owner).transferOwnership(nextOwner.address);
    expect(await registry.pendingOwner()).to.equal(nextOwner.address);

    await expect(registry.connect(other).acceptOwnership()).to.be.revertedWithCustomError(
      registry,
      "OwnableUnauthorizedAccount",
    );

    await registry.connect(nextOwner).acceptOwnership();
    expect(await registry.owner()).to.equal(nextOwner.address);
  });

  it("supports two-step ownership in ComplianceRules", async () => {
    const registry = await deployIdentityRegistryProxy();
    const compliance = await deployComplianceRules(await registry.getAddress());
    const [owner, nextOwner, other] = await hre.ethers.getSigners();

    expect(await compliance.owner()).to.equal(owner.address);

    await expect(
      compliance.connect(other).transferOwnership(nextOwner.address),
    ).to.be.revertedWithCustomError(compliance, "OwnableUnauthorizedAccount");

    await compliance.connect(owner).transferOwnership(nextOwner.address);
    await compliance.connect(nextOwner).acceptOwnership();
    expect(await compliance.owner()).to.equal(nextOwner.address);
  });

  it("supports two-step ownership in CompliantERC20", async () => {
    const registry = await deployIdentityRegistryProxy();
    const compliance = await deployComplianceRules(await registry.getAddress());
    const token = await deployCompliantERC20(await compliance.getAddress());
    const [owner, nextOwner, other] = await hre.ethers.getSigners();

    expect(await token.owner()).to.equal(owner.address);

    await expect(
      token.connect(other).transferOwnership(nextOwner.address),
    ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");

    await token.connect(owner).transferOwnership(nextOwner.address);
    await token.connect(nextOwner).acceptOwnership();
    expect(await token.owner()).to.equal(nextOwner.address);
  });
});
