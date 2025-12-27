/**
 * @title IdentityRegistry Tests
 * @notice Tests for the on-chain encrypted identity registry
 * @dev Uses @fhevm/hardhat-plugin for encrypted input/output handling
 */

import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";

describe("IdentityRegistry", () => {
  let registry: Awaited<ReturnType<typeof deployContract>>;
  let contractAddress: string;
  let owner: HardhatEthersSigner;
  let registrar: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let verifier: HardhatEthersSigner;

  async function deployContract() {
    const factory = await hre.ethers.getContractFactory("IdentityRegistry");
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return contract;
  }

  async function attestUser(
    userAddress: string,
    birthYearOffset: number,
    countryCode: number,
    complianceLevel: number,
    isBlacklisted: boolean,
    signer: HardhatEthersSigner,
  ) {
    const encrypted = hre.fhevm.createEncryptedInput(contractAddress, signer.address);
    encrypted.add8(birthYearOffset);
    encrypted.add16(countryCode);
    encrypted.add8(complianceLevel);
    encrypted.addBool(isBlacklisted);
    const encryptedInput = await encrypted.encrypt();

    await registry
      .connect(signer)
      .attestIdentity(
        userAddress,
        encryptedInput.handles[0],
        encryptedInput.handles[1],
        encryptedInput.handles[2],
        encryptedInput.handles[3],
        encryptedInput.inputProof,
      );
  }

  before(async () => {
    [owner, registrar, user1, user2, verifier] = await hre.ethers.getSigners();
    registry = await deployContract();
    contractAddress = await registry.getAddress();

    await hre.fhevm.assertCoprocessorInitialized(registry, "IdentityRegistry");
  });

  describe("Deployment", () => {
    it("should set deployer as owner", async () => {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("should set deployer as initial registrar", async () => {
      expect(await registry.registrars(owner.address)).to.be.true;
    });
  });

  describe("Registrar Management", () => {
    it("should allow owner to add registrar", async () => {
      await expect(registry.connect(owner).addRegistrar(registrar.address))
        .to.emit(registry, "RegistrarAdded")
        .withArgs(registrar.address);

      expect(await registry.registrars(registrar.address)).to.be.true;
    });

    it("should revert when non-owner tries to add registrar", async () => {
      await expect(
        registry.connect(user1).addRegistrar(user2.address),
      ).to.be.revertedWithCustomError(registry, "OnlyOwner");
    });

    it("should allow owner to remove registrar", async () => {
      await registry.connect(owner).addRegistrar(user2.address);

      await expect(registry.connect(owner).removeRegistrar(user2.address))
        .to.emit(registry, "RegistrarRemoved")
        .withArgs(user2.address);

      expect(await registry.registrars(user2.address)).to.be.false;
    });
  });

  describe("Identity Attestation", () => {
    it("should allow registrar to attest identity", async () => {
      // Birth year 1990 (offset 90), USA (840), compliance level 3, not blacklisted
      await attestUser(user1.address, 90, 840, 3, false, registrar);

      expect(await registry.isAttested(user1.address)).to.be.true;

      const timestamp = await registry.attestationTimestamp(user1.address);
      expect(timestamp).to.be.greaterThan(0);
    });

    it("should emit IdentityAttested event", async () => {
      const encrypted = hre.fhevm.createEncryptedInput(contractAddress, registrar.address);
      encrypted.add8(100);
      encrypted.add16(276);
      encrypted.add8(2);
      encrypted.addBool(false);
      const encryptedInput = await encrypted.encrypt();

      await expect(
        registry
          .connect(registrar)
          .attestIdentity(
            user2.address,
            encryptedInput.handles[0],
            encryptedInput.handles[1],
            encryptedInput.handles[2],
            encryptedInput.handles[3],
            encryptedInput.inputProof,
          ),
      )
        .to.emit(registry, "IdentityAttested")
        .withArgs(user2.address, registrar.address);
    });

    it("should track attestation metadata for auditability", async () => {
      const attestationId = await registry.currentAttestationId(user2.address);
      expect(attestationId).to.equal(1n);

      const metadata = await registry.getAttestationMetadata(user2.address, attestationId);
      expect(metadata.registrar).to.equal(registrar.address);
      expect(metadata.timestamp).to.be.greaterThan(0);
      expect(metadata.revokedAt).to.equal(0n);
    });

    it("should revert when attesting an already-attested user", async () => {
      const encrypted = hre.fhevm.createEncryptedInput(contractAddress, registrar.address);
      encrypted.add8(101);
      encrypted.add16(840);
      encrypted.add8(4);
      encrypted.addBool(false);
      const encryptedInput = await encrypted.encrypt();

      await expect(
        registry
          .connect(registrar)
          .attestIdentity(
            user1.address,
            encryptedInput.handles[0],
            encryptedInput.handles[1],
            encryptedInput.handles[2],
            encryptedInput.handles[3],
            encryptedInput.inputProof,
          ),
      ).to.be.revertedWithCustomError(registry, "AlreadyAttested");
    });

    it("should revert when non-registrar tries to attest", async () => {
      const encrypted = hre.fhevm.createEncryptedInput(contractAddress, user1.address);
      encrypted.add8(100);
      encrypted.add16(840);
      encrypted.add8(1);
      encrypted.addBool(false);
      const encryptedInput = await encrypted.encrypt();

      await expect(
        registry
          .connect(user1)
          .attestIdentity(
            verifier.address,
            encryptedInput.handles[0],
            encryptedInput.handles[1],
            encryptedInput.handles[2],
            encryptedInput.handles[3],
            encryptedInput.inputProof,
          ),
      ).to.be.revertedWithCustomError(registry, "OnlyRegistrar");
    });
  });

  describe("Encrypted Data Retrieval", () => {
    it("should allow user to read their own compliance level", async () => {
      const encryptedCompliance = await registry.connect(user1).getComplianceLevel(user1.address);

      const complianceLevel = await hre.fhevm.userDecryptEuint(
        FhevmType.euint8,
        encryptedCompliance,
        contractAddress,
        user1,
      );

      expect(complianceLevel).to.equal(3n);
    });

    it("should allow user to read their own blacklist status", async () => {
      const encryptedBlacklist = await registry.connect(user1).getBlacklistStatus(user1.address);

      const isBlacklisted = await hre.fhevm.userDecryptEbool(
        encryptedBlacklist,
        contractAddress,
        user1,
      );

      expect(isBlacklisted).to.be.false;
    });

    it("should revert for non-attested users", async () => {
      const unattested = (await hre.ethers.getSigners())[5];

      await expect(
        registry.connect(unattested).getBirthYearOffset(unattested.address),
      ).to.be.revertedWithCustomError(registry, "NotAttested");
    });
  });

  describe("Verification Helpers", () => {
    it("should check minimum compliance level correctly", async () => {
      await registry.connect(user1).hasMinComplianceLevel(user1.address, 2);

      const encryptedHasMinCompliance = await registry
        .connect(user1)
        .getComplianceLevelResult(user1.address, 2);

      const hasMinCompliance = await hre.fhevm.userDecryptEbool(
        encryptedHasMinCompliance,
        contractAddress,
        user1,
      );

      expect(hasMinCompliance).to.be.true;
    });

    it("should fail compliance check when level is insufficient", async () => {
      await registry.connect(user1).hasMinComplianceLevel(user1.address, 5);

      const encryptedHasMinCompliance = await registry
        .connect(user1)
        .getComplianceLevelResult(user1.address, 5);

      const hasMinCompliance = await hre.fhevm.userDecryptEbool(
        encryptedHasMinCompliance,
        contractAddress,
        user1,
      );

      expect(hasMinCompliance).to.be.false;
    });

    it("should check not-blacklisted status", async () => {
      await registry.connect(user1).isNotBlacklisted(user1.address);

      const encryptedNotBlacklisted = await registry
        .connect(user1)
        .getBlacklistResult(user1.address);

      const isNotBlacklisted = await hre.fhevm.userDecryptEbool(
        encryptedNotBlacklisted,
        contractAddress,
        user1,
      );

      expect(isNotBlacklisted).to.be.true;
    });
  });

  describe("Access Control Grants", () => {
    it("should block verifier from reading user data without grant", async () => {
      await expect(
        registry.connect(verifier).getComplianceLevel(user1.address),
      ).to.be.revertedWithCustomError(registry, "AccessProhibited");
    });

    it("should allow user to grant access to verifier", async () => {
      await expect(registry.connect(user1).grantAccessTo(verifier.address))
        .to.emit(registry, "AccessGranted")
        .withArgs(user1.address, verifier.address);
    });

    it("should allow verifier to read user data after grant", async () => {
      const encryptedCompliance = await registry
        .connect(verifier)
        .getComplianceLevel(user1.address);

      const complianceLevel = await hre.fhevm.userDecryptEuint(
        FhevmType.euint8,
        encryptedCompliance,
        contractAddress,
        verifier,
      );

      expect(complianceLevel).to.equal(3n);
    });
  });

  describe("Identity Revocation", () => {
    it("should allow registrar to revoke identity", async () => {
      expect(await registry.isAttested(user2.address)).to.be.true;

      await expect(registry.connect(registrar).revokeIdentity(user2.address))
        .to.emit(registry, "IdentityRevoked")
        .withArgs(user2.address);

      expect(await registry.isAttested(user2.address)).to.be.false;

      const lastAttestationId = await registry.latestAttestationId(user2.address);
      const metadata = await registry.getAttestationMetadata(user2.address, lastAttestationId);
      expect(metadata.revokedAt).to.be.greaterThan(0);
    });

    it("should revert when revoking non-attested user", async () => {
      const unattested = (await hre.ethers.getSigners())[7];

      await expect(
        registry.connect(registrar).revokeIdentity(unattested.address),
      ).to.be.revertedWithCustomError(registry, "NotAttested");
    });
  });
});
