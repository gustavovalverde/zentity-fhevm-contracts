import { expect } from "chai";
import type { ContractTransactionResponse } from "ethers";
import hre from "hardhat";

type OwnershipContract = {
  owner: () => Promise<string>;
  pendingOwner: () => Promise<string>;
  transferOwnership: (newOwner: string) => Promise<ContractTransactionResponse>;
  acceptOwnership: () => Promise<ContractTransactionResponse>;
  connect: (signer: unknown) => OwnershipContract;
  interface: unknown;
};

describe("Ownership transfers", () => {
  async function deployIdentityRegistry() {
    const factory = await hre.ethers.getContractFactory("IdentityRegistry");
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return contract;
  }

  async function deployComplianceRules(registryAddress: string) {
    const factory = await hre.ethers.getContractFactory("ComplianceRules");
    const contract = await factory.deploy(registryAddress, 1);
    await contract.waitForDeployment();
    return contract;
  }

  async function deployCompliantERC20(checkerAddress: string) {
    const factory = await hre.ethers.getContractFactory("CompliantERC20");
    const contract = await factory.deploy("Zentity Token", "ZENT", checkerAddress);
    await contract.waitForDeployment();
    return contract;
  }

  async function assertTwoStepOwnership(contract: OwnershipContract) {
    const [owner, nextOwner, other] = await hre.ethers.getSigners();

    expect(await contract.owner()).to.equal(owner.address);
    expect(await contract.pendingOwner()).to.equal(hre.ethers.ZeroAddress);

    await expect(
      contract.connect(other).transferOwnership(nextOwner.address),
    ).to.be.revertedWithCustomError(contract, "OnlyOwner");

    await expect(
      contract.connect(owner).transferOwnership(hre.ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(contract, "InvalidOwner");

    await expect(contract.connect(owner).transferOwnership(nextOwner.address))
      .to.emit(contract, "OwnershipTransferStarted")
      .withArgs(owner.address, nextOwner.address);

    expect(await contract.pendingOwner()).to.equal(nextOwner.address);

    await expect(contract.connect(other).acceptOwnership()).to.be.revertedWithCustomError(
      contract,
      "OnlyPendingOwner",
    );

    await expect(contract.connect(nextOwner).acceptOwnership())
      .to.emit(contract, "OwnershipTransferred")
      .withArgs(owner.address, nextOwner.address);

    expect(await contract.owner()).to.equal(nextOwner.address);
    expect(await contract.pendingOwner()).to.equal(hre.ethers.ZeroAddress);
  }

  it("supports two-step ownership in IdentityRegistry", async () => {
    const registry = (await deployIdentityRegistry()) as unknown as OwnershipContract;
    await assertTwoStepOwnership(registry);
  });

  it("supports two-step ownership in ComplianceRules", async () => {
    const registry = await deployIdentityRegistry();
    const complianceRules = (await deployComplianceRules(
      await registry.getAddress(),
    )) as unknown as OwnershipContract;
    await assertTwoStepOwnership(complianceRules);
  });

  it("supports two-step ownership in CompliantERC20", async () => {
    const registry = await deployIdentityRegistry();
    const complianceRules = await deployComplianceRules(await registry.getAddress());
    const token = (await deployCompliantERC20(
      await complianceRules.getAddress(),
    )) as unknown as OwnershipContract;
    await assertTwoStepOwnership(token);
  });
});
