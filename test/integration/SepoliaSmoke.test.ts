import { expect } from "chai";
import hre from "hardhat";

describe("Sepolia Integration Smoke", () => {
  before(async function () {
    if (hre.network.name !== "sepolia") {
      return this.skip();
    }
  });

  it("should load deployed contracts and verify wiring", async () => {
    const [deployer] = await hre.ethers.getSigners();

    const identityDeployment = await hre.deployments.get("IdentityRegistry");
    const complianceDeployment = await hre.deployments.get("ComplianceRules");
    const tokenDeployment = await hre.deployments.get("CompliantERC20");

    const identityRegistry = await hre.ethers.getContractAt(
      "IdentityRegistry",
      identityDeployment.address,
      deployer,
    );
    const complianceRules = await hre.ethers.getContractAt(
      "ComplianceRules",
      complianceDeployment.address,
      deployer,
    );
    const token = await hre.ethers.getContractAt(
      "CompliantERC20",
      tokenDeployment.address,
      deployer,
    );

    expect(identityDeployment.address).to.not.equal(hre.ethers.ZeroAddress);
    expect(complianceDeployment.address).to.not.equal(hre.ethers.ZeroAddress);
    expect(tokenDeployment.address).to.not.equal(hre.ethers.ZeroAddress);

    expect(await complianceRules.identityRegistry()).to.equal(identityDeployment.address);
    expect(await token.complianceChecker()).to.equal(complianceDeployment.address);
    expect(await complianceRules.authorizedCallers(tokenDeployment.address)).to.equal(true);

    expect(await identityRegistry.owner()).to.not.equal(hre.ethers.ZeroAddress);
    expect(await identityRegistry.confidentialProtocolId()).to.equal(10001);

    // NOTE: Sepolia deployment currently uses "Zentity Token" from deploy script.
    // TODO: Update this assertion if/when the Sepolia deployment is redeployed with a new name.
    expect(await token.name()).to.equal("Zentity Token");
    expect(await token.symbol()).to.equal("ZTY");
  });
});
