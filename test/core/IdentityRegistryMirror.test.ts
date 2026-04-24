import { expect } from "chai";
import hre from "hardhat";
import { deployUupsProxy } from "../utils/deploy-uups-proxy";

async function deployMirrorProxy() {
  const [owner, registrar] = await hre.ethers.getSigners();
  const proxyAddress = await deployUupsProxy("IdentityRegistryMirror", [
    owner.address,
    registrar.address,
  ]);
  const mirror = await hre.ethers.getContractAt("IdentityRegistryMirror", proxyAddress);
  return { mirror, owner, registrar };
}

describe("IdentityRegistryMirror", () => {
  it("records level-aware compliance and supports threshold reads", async () => {
    const { mirror, registrar } = await deployMirrorProxy();
    const [, , user] = await hre.ethers.getSigners();

    await expect(mirror.connect(registrar).recordCompliance(user.address, 3))
      .to.emit(mirror, "IdentityAttested")
      .withArgs(user.address)
      .and.to.emit(mirror, "LevelUpdated")
      .withArgs(user.address, 0, 3);

    expect(await mirror.isAttested(user.address)).to.equal(true);
    expect(await mirror.currentLevel(user.address)).to.equal(3);
    expect(await mirror.isCompliant(user.address, 0)).to.equal(true);
    expect(await mirror.isCompliant(user.address, 2)).to.equal(true);
    expect(await mirror.isCompliant(user.address, 3)).to.equal(true);
    expect(await mirror.isCompliant(user.address, 4)).to.equal(false);
    expect(await mirror.isCompliant(user.address, 5)).to.equal(false);
  });

  it("updates levels without changing the attestation id", async () => {
    const { mirror, registrar } = await deployMirrorProxy();
    const [, , user] = await hre.ethers.getSigners();

    await mirror.connect(registrar).recordCompliance(user.address, 2);
    const mirrorAttestationId = await mirror.currentMirrorAttestationId(user.address);

    await expect(mirror.connect(registrar).recordCompliance(user.address, 4))
      .to.emit(mirror, "LevelUpdated")
      .withArgs(user.address, 2, 4)
      .and.not.to.emit(mirror, "IdentityAttested");

    expect(await mirror.currentMirrorAttestationId(user.address)).to.equal(mirrorAttestationId);
    expect(await mirror.currentLevel(user.address)).to.equal(4);
  });

  it("revokes mirrored attestations idempotently", async () => {
    const { mirror, registrar } = await deployMirrorProxy();
    const [, , user] = await hre.ethers.getSigners();

    await mirror.connect(registrar).recordCompliance(user.address, 2);

    await expect(mirror.connect(registrar).revokeAttestation(user.address))
      .to.emit(mirror, "IdentityRevoked")
      .withArgs(user.address)
      .and.to.emit(mirror, "LevelUpdated")
      .withArgs(user.address, 2, 0);

    expect(await mirror.isAttested(user.address)).to.equal(false);
    expect(await mirror.currentLevel(user.address)).to.equal(0);
    expect(await mirror.isCompliant(user.address, 0)).to.equal(false);

    await expect(mirror.connect(registrar).revokeAttestation(user.address)).not.to.emit(
      mirror,
      "IdentityRevoked",
    );
  });

  it("restricts writes to registrars and owner-managed registrar updates", async () => {
    const { mirror, owner, registrar } = await deployMirrorProxy();
    const [, , user, other] = await hre.ethers.getSigners();

    await expect(
      mirror.connect(other).recordCompliance(user.address, 2),
    ).to.be.revertedWithCustomError(mirror, "OnlyRegistrar");

    await mirror.connect(owner).setRegistrar(other.address, true);
    expect(await mirror.registrars(other.address)).to.equal(true);

    await mirror.connect(other).recordCompliance(user.address, 2);
    expect(await mirror.currentLevel(user.address)).to.equal(2);

    await mirror.connect(owner).setRegistrar(registrar.address, false);
    await expect(
      mirror.connect(registrar).recordCompliance(user.address, 3),
    ).to.be.revertedWithCustomError(mirror, "OnlyRegistrar");
  });

  it("rejects unsupported compliance levels and zero addresses", async () => {
    const { mirror, registrar } = await deployMirrorProxy();
    const [, , user] = await hre.ethers.getSigners();

    await expect(
      mirror.connect(registrar).recordCompliance(user.address, 0),
    ).to.be.revertedWithCustomError(mirror, "InvalidComplianceLevel");

    await expect(
      mirror.connect(registrar).recordCompliance(user.address, 5),
    ).to.be.revertedWithCustomError(mirror, "InvalidComplianceLevel");

    await expect(
      mirror.connect(registrar).recordCompliance(hre.ethers.ZeroAddress, 2),
    ).to.be.revertedWithCustomError(mirror, "ZeroAddress");

    await expect(
      mirror.connect(registrar).revokeAttestation(hre.ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(mirror, "ZeroAddress");
  });
});
