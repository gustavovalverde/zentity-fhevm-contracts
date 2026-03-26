/**
 * @title IdentityRegistry v2 Tests
 * @notice Tests for the UUPS-upgradeable encrypted identity registry
 *         with EIP-712 permits, per-attribute grants, and x402 compliance surface
 */

import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";

// EIP-712 types for the attestation permit
const PERMIT_TYPES = {
  AttestPermit: [
    { name: "user", type: "address" },
    { name: "birthYearOffset", type: "uint8" },
    { name: "countryCode", type: "uint16" },
    { name: "complianceLevel", type: "uint8" },
    { name: "isBlacklisted", type: "bool" },
    { name: "proofSetHash", type: "bytes32" },
    { name: "policyVersion", type: "uint32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const CONSENT_TYPES = {
  UserConsent: [
    { name: "user", type: "address" },
    { name: "attributeMask", type: "uint8" },
    { name: "chainId", type: "uint256" },
    { name: "revision", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

describe("IdentityRegistry", () => {
  let registry: Awaited<ReturnType<typeof deployProxy>>;
  let proxyAddress: string;
  let owner: HardhatEthersSigner;
  let registrar: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let verifier: HardhatEthersSigner;
  let domain: { name: string; version: string; chainId: number; verifyingContract: string };

  async function deployProxy() {
    const factory = await hre.ethers.getContractFactory("IdentityRegistry");
    const impl = await factory.deploy();
    await impl.waitForDeployment();

    const proxyFactory = await hre.ethers.getContractFactory("ERC1967Proxy");
    const initData = factory.interface.encodeFunctionData("initialize", [owner.address]);
    const proxy = await proxyFactory.deploy(await impl.getAddress(), initData);
    await proxy.waitForDeployment();

    return factory.attach(await proxy.getAddress()) as Awaited<ReturnType<typeof factory.deploy>>;
  }

  /** Sign an EIP-712 attestation permit as the registrar */
  async function signPermit(
    signer: HardhatEthersSigner,
    userAddress: string,
    birthYearOffset: number,
    countryCode: number,
    complianceLevel: number,
    isBlacklisted: boolean,
    proofSetHash: string = hre.ethers.ZeroHash,
    policyVersion: number = 1,
    deadline?: number,
  ) {
    const nonce = await registry.nonces(userAddress);
    const block = await hre.ethers.provider.getBlock("latest");
    const dl = deadline ?? (block?.timestamp ?? 0) + 3600;

    const message = {
      user: userAddress,
      birthYearOffset,
      countryCode,
      complianceLevel,
      isBlacklisted,
      proofSetHash,
      policyVersion,
      nonce,
      deadline: dl,
    };

    const signature = await signer.signTypedData(domain, PERMIT_TYPES, message);
    const { v, r, s } = hre.ethers.Signature.from(signature);

    return {
      permit: {
        birthYearOffset,
        countryCode,
        complianceLevel,
        isBlacklisted,
        proofSetHash,
        policyVersion,
        deadline: dl,
        v,
        r,
        s,
      },
    };
  }

  /** Attest a user via EIP-712 permit + FHE encryption */
  async function attestUser(
    userSigner: HardhatEthersSigner,
    birthYearOffset: number,
    countryCode: number,
    complianceLevel: number,
    isBlacklisted: boolean,
    permitSigner: HardhatEthersSigner = registrar,
    proofSetHash: string = hre.ethers.ZeroHash,
  ) {
    const { permit } = await signPermit(
      permitSigner,
      userSigner.address,
      birthYearOffset,
      countryCode,
      complianceLevel,
      isBlacklisted,
      proofSetHash,
    );

    const encrypted = hre.fhevm.createEncryptedInput(proxyAddress, userSigner.address);
    encrypted.add8(birthYearOffset);
    encrypted.add16(countryCode);
    encrypted.add8(complianceLevel);
    encrypted.addBool(isBlacklisted);
    const encryptedInput = await encrypted.encrypt();

    await registry
      .connect(userSigner)
      .attestWithPermit(
        permit,
        0,
        hre.ethers.ZeroHash,
        hre.ethers.ZeroHash,
        0,
        0,
        encryptedInput.handles[0],
        encryptedInput.handles[1],
        encryptedInput.handles[2],
        encryptedInput.handles[3],
        encryptedInput.inputProof,
      );
  }

  async function signConsent(
    signer: HardhatEthersSigner,
    attributeMask: number,
    revision: bigint,
    deadline?: number,
  ) {
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;
    const block = await hre.ethers.provider.getBlock("latest");
    const dl = deadline ?? (block?.timestamp ?? 0) + 3600;

    const message = {
      user: signer.address,
      attributeMask,
      chainId,
      revision,
      deadline: dl,
    };

    const signature = await signer.signTypedData(domain, CONSENT_TYPES, message);
    const { v, r, s } = hre.ethers.Signature.from(signature);

    return { v, r, s, attributeMask, deadline: dl };
  }

  before(async () => {
    [owner, registrar, user1, user2, verifier] = await hre.ethers.getSigners();
    registry = await deployProxy();
    proxyAddress = await registry.getAddress();

    await hre.fhevm.assertCoprocessorInitialized(registry, "IdentityRegistry");

    // Set up EIP-712 domain (must match the contract's domain)
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;
    domain = {
      name: "ZentityIdentityRegistry",
      version: "2",
      chainId: Number(chainId),
      verifyingContract: proxyAddress,
    };

    // Add registrar
    await registry.connect(owner).setRegistrar(registrar.address, true);

    // Authorize test signers as policy contracts for compliance check tests
    await registry.connect(owner).setAuthorizedPolicy(user1.address, true);
    await registry.connect(owner).setAuthorizedPolicy(user2.address, true);
    await registry.connect(owner).setAuthorizedPolicy(verifier.address, true);
  });

  describe("Initialization", () => {
    it("should set owner via proxy", async () => {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("should set owner as initial registrar", async () => {
      expect(await registry.registrars(owner.address)).to.be.true;
    });

    it("should prevent re-initialization", async () => {
      await expect(registry.initialize(user1.address)).to.be.reverted;
    });
  });

  describe("Registrar Management", () => {
    it("should allow owner to set registrar", async () => {
      await expect(registry.connect(owner).setRegistrar(registrar.address, true))
        .to.emit(registry, "RegistrarUpdated")
        .withArgs(registrar.address, true);

      expect(await registry.registrars(registrar.address)).to.be.true;
    });

    it("should revert when non-owner sets registrar", async () => {
      await expect(
        registry.connect(user1).setRegistrar(user2.address, true),
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("should reject zero address registrar", async () => {
      await expect(
        registry.connect(owner).setRegistrar(hre.ethers.ZeroAddress, true),
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });
  });

  describe("EIP-712 Permit Attestation", () => {
    it("should attest identity with valid permit", async () => {
      await attestUser(user1, 90, 840, 3, false);

      expect(await registry.isAttested(user1.address)).to.be.true;
      expect(await registry.attestationTimestamp(user1.address)).to.be.greaterThan(0);
      expect(await registry.currentAttestationId(user1.address)).to.equal(1n);
    });

    it("should emit IdentityAttested event", async () => {
      const { permit } = await signPermit(registrar, user2.address, 100, 276, 2, false);
      const encrypted = hre.fhevm.createEncryptedInput(proxyAddress, user2.address);
      encrypted.add8(100);
      encrypted.add16(276);
      encrypted.add8(2);
      encrypted.addBool(false);
      const encryptedInput = await encrypted.encrypt();

      await expect(
        registry
          .connect(user2)
          .attestWithPermit(
            permit,
            0,
            hre.ethers.ZeroHash,
            hre.ethers.ZeroHash,
            0,
            0,
            encryptedInput.handles[0],
            encryptedInput.handles[1],
            encryptedInput.handles[2],
            encryptedInput.handles[3],
            encryptedInput.inputProof,
          ),
      )
        .to.emit(registry, "IdentityAttested")
        .withArgs(user2.address);
    });

    it("should store proofSetHash from permit", async () => {
      expect(await registry.getProofSetHash(user1.address)).to.equal(hre.ethers.ZeroHash);
    });

    it("should increment nonce after attestation", async () => {
      expect(await registry.nonces(user1.address)).to.equal(1n);
      expect(await registry.nonces(user2.address)).to.equal(1n);
    });

    it("should allow re-attestation and increment revision", async () => {
      // Ensure user is attested first
      if (!(await registry.isAttested(user1.address))) {
        await attestUser(user1, 90, 840, 3, false);
      }
      const revBefore = await registry.revisions(user1.address);
      const { permit } = await signPermit(registrar, user1.address, 90, 840, 3, false);
      const encrypted = hre.fhevm.createEncryptedInput(proxyAddress, user1.address);
      encrypted.add8(90);
      encrypted.add16(840);
      encrypted.add8(3);
      encrypted.addBool(false);
      const encryptedInput = await encrypted.encrypt();

      await registry
        .connect(user1)
        .attestWithPermit(
          permit,
          0,
          hre.ethers.ZeroHash,
          hre.ethers.ZeroHash,
          0,
          0,
          encryptedInput.handles[0],
          encryptedInput.handles[1],
          encryptedInput.handles[2],
          encryptedInput.handles[3],
          encryptedInput.inputProof,
        );

      expect(await registry.revisions(user1.address)).to.equal(revBefore + 1n);
      expect(await registry.isAttested(user1.address)).to.be.true;
    });

    it("should revert on expired permit", async () => {
      const nonAttested = (await hre.ethers.getSigners())[5];
      const block = await hre.ethers.provider.getBlock("latest");
      const { permit } = await signPermit(
        registrar,
        nonAttested.address,
        90,
        840,
        3,
        false,
        hre.ethers.ZeroHash,
        1,
        (block?.timestamp ?? 0) - 1,
      );
      const encrypted = hre.fhevm.createEncryptedInput(proxyAddress, nonAttested.address);
      encrypted.add8(90);
      encrypted.add16(840);
      encrypted.add8(3);
      encrypted.addBool(false);
      const encryptedInput = await encrypted.encrypt();

      await expect(
        registry
          .connect(nonAttested)
          .attestWithPermit(
            permit,
            0,
            hre.ethers.ZeroHash,
            hre.ethers.ZeroHash,
            0,
            0,
            encryptedInput.handles[0],
            encryptedInput.handles[1],
            encryptedInput.handles[2],
            encryptedInput.handles[3],
            encryptedInput.inputProof,
          ),
      ).to.be.revertedWithCustomError(registry, "PermitExpired");
    });

    it("should revert on non-registrar signer", async () => {
      const nonAttested = (await hre.ethers.getSigners())[6];
      // Sign with user1 (not a registrar)
      const { permit } = await signPermit(user1, nonAttested.address, 90, 840, 3, false);
      const encrypted = hre.fhevm.createEncryptedInput(proxyAddress, nonAttested.address);
      encrypted.add8(90);
      encrypted.add16(840);
      encrypted.add8(3);
      encrypted.addBool(false);
      const encryptedInput = await encrypted.encrypt();

      await expect(
        registry
          .connect(nonAttested)
          .attestWithPermit(
            permit,
            0,
            hre.ethers.ZeroHash,
            hre.ethers.ZeroHash,
            0,
            0,
            encryptedInput.handles[0],
            encryptedInput.handles[1],
            encryptedInput.handles[2],
            encryptedInput.handles[3],
            encryptedInput.inputProof,
          ),
      ).to.be.revertedWithCustomError(registry, "InvalidPermit");
    });

    it("should reject replayed permit (same nonce)", async () => {
      const nonAttested = (await hre.ethers.getSigners())[7];
      // Attest once
      await attestUser(nonAttested, 90, 840, 3, false);
      // Revoke to allow re-attestation attempt
      await registry.connect(registrar).revokeIdentityFor(nonAttested.address);
      // Re-attestation must use a fresh nonce because revocation invalidates pending permits
      await attestUser(nonAttested, 90, 840, 3, false);
      expect(await registry.nonces(nonAttested.address)).to.equal(3n);
    });

    it("should invalidate a signed permit when identity is revoked before submission", async () => {
      const revokable = (await hre.ethers.getSigners())[9];
      await attestUser(revokable, 90, 840, 3, false);

      const { permit } = await signPermit(registrar, revokable.address, 91, 840, 4, false);
      const encrypted = hre.fhevm.createEncryptedInput(proxyAddress, revokable.address);
      encrypted.add8(91);
      encrypted.add16(840);
      encrypted.add8(4);
      encrypted.addBool(false);
      const encryptedInput = await encrypted.encrypt();

      await registry.connect(registrar).revokeIdentityFor(revokable.address);

      await expect(
        registry
          .connect(revokable)
          .attestWithPermit(
            permit,
            0,
            hre.ethers.ZeroHash,
            hre.ethers.ZeroHash,
            0,
            0,
            encryptedInput.handles[0],
            encryptedInput.handles[1],
            encryptedInput.handles[2],
            encryptedInput.handles[3],
            encryptedInput.inputProof,
          ),
      ).to.be.revertedWithCustomError(registry, "InvalidPermit");

      expect(await registry.nonces(revokable.address)).to.equal(2n);
    });

    it("should accept consent signed for the target revision on re-attestation", async () => {
      const consentUser = (await hre.ethers.getSigners())[10];
      await attestUser(consentUser, 90, 840, 3, false);

      const currentRevision = await registry.revisions(consentUser.address);
      const targetRevision = currentRevision + 1n;
      const { permit } = await signPermit(registrar, consentUser.address, 92, 840, 4, false);
      const consent = await signConsent(consentUser, 0x0f, targetRevision);

      const encrypted = hre.fhevm.createEncryptedInput(proxyAddress, consentUser.address);
      encrypted.add8(92);
      encrypted.add16(840);
      encrypted.add8(4);
      encrypted.addBool(false);
      const encryptedInput = await encrypted.encrypt();

      await registry
        .connect(consentUser)
        .attestWithPermit(
          permit,
          consent.v,
          consent.r,
          consent.s,
          consent.attributeMask,
          consent.deadline,
          encryptedInput.handles[0],
          encryptedInput.handles[1],
          encryptedInput.handles[2],
          encryptedInput.handles[3],
          encryptedInput.inputProof,
        );

      expect(await registry.revisions(consentUser.address)).to.equal(targetRevision);
      expect(await registry.nonces(consentUser.address)).to.equal(2n);
    });
  });

  describe("Encrypted Data Retrieval", () => {
    it("should allow user to read their compliance level", async () => {
      const encryptedCompliance = await registry.connect(user1).getComplianceLevel(user1.address);
      const complianceLevel = await hre.fhevm.userDecryptEuint(
        FhevmType.euint8,
        encryptedCompliance,
        proxyAddress,
        user1,
      );
      expect(complianceLevel).to.equal(3n);
    });

    it("should allow user to read their blacklist status", async () => {
      const encryptedBlacklist = await registry.connect(user1).getBlacklistStatus(user1.address);
      const isBlacklisted = await hre.fhevm.userDecryptEbool(
        encryptedBlacklist,
        proxyAddress,
        user1,
      );
      expect(isBlacklisted).to.be.false;
    });

    it("should revert for non-attested users", async () => {
      const unattested = (await hre.ethers.getSigners())[8];
      await expect(
        registry.connect(unattested).getBirthYearOffset(unattested.address),
      ).to.be.revertedWithCustomError(registry, "NotAttested");
    });
  });

  describe("Per-Attribute Grants", () => {
    it("should block verifier before grant", async () => {
      await expect(
        registry.connect(verifier).getComplianceLevel(user1.address),
      ).to.be.revertedWithCustomError(registry, "AccessProhibited");
    });

    it("should grant specific attributes with purpose", async () => {
      // Grant only compliance + blacklist (for TRANSFER_GATING)
      const mask = 0x04 | 0x08; // COMPLIANCE | BLACKLIST
      await expect(
        registry
          .connect(user1)
          .grantAttributeAccess(verifier.address, mask, 3), // Purpose.TRANSFER_GATING = 3
      )
        .to.emit(registry, "AttributeAccessGranted")
        .withArgs(user1.address, verifier.address, mask, 3);

      expect(await registry.getGrantedAttributes(user1.address, verifier.address)).to.equal(mask);
    });

    it("should allow verifier to read granted attribute", async () => {
      const encryptedCompliance = await registry
        .connect(verifier)
        .getComplianceLevel(user1.address);
      const complianceLevel = await hre.fhevm.userDecryptEuint(
        FhevmType.euint8,
        encryptedCompliance,
        proxyAddress,
        verifier,
      );
      expect(complianceLevel).to.equal(3n);
    });

    it("should block verifier from reading ungranted attribute", async () => {
      // birthYearOffset was not granted (mask was 0x0C, not including 0x01)
      await expect(
        registry.connect(verifier).getBirthYearOffset(user1.address),
      ).to.be.revertedWithCustomError(registry, "AccessProhibited");
    });

    it("should grant all attributes via grantAccessTo", async () => {
      const other = (await hre.ethers.getSigners())[9];
      await expect(registry.connect(user1).grantAccessTo(other.address))
        .to.emit(registry, "AttributeAccessGranted")
        .withArgs(user1.address, other.address, 0x0f, 0); // ATTR_ALL, Purpose.COMPLIANCE_CHECK

      expect(await registry.getGrantedAttributes(user1.address, other.address)).to.equal(0x0f);
    });

    it("should reject zero address grantee", async () => {
      await expect(
        registry.connect(user1).grantAttributeAccess(hre.ethers.ZeroAddress, 0x0f, 0),
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });
  });

  describe("Compliance Checks (x402 Surface)", () => {
    before(async () => {
      // Ensure user1 is attested for compliance tests
      if (!(await registry.isAttested(user1.address))) {
        await attestUser(user1, 90, 840, 3, false);
      }
    });

    it("should pass compliance check when level meets requirement", async () => {
      // user1 has compliance level 3, check for minLevel 2
      await registry.connect(user1).checkCompliance(user1.address, 2);

      const revision = await registry.revisions(user1.address);
      const key = hre.ethers.keccak256(
        hre.ethers.solidityPacked(
          ["address", "string", "uint8", "uint256"],
          [user1.address, "compliance", 2, revision],
        ),
      );
      const result = await registry.connect(user1).getVerificationResult(key);
      const decrypted = await hre.fhevm.userDecryptEbool(result, proxyAddress, user1);
      expect(decrypted).to.be.true;
    });

    it("should fail compliance check when level is insufficient", async () => {
      // user1 has compliance level 3, check for minLevel 5
      await registry.connect(user1).checkCompliance(user1.address, 5);

      const revision = await registry.revisions(user1.address);
      const key = hre.ethers.keccak256(
        hre.ethers.solidityPacked(
          ["address", "string", "uint8", "uint256"],
          [user1.address, "compliance", 5, revision],
        ),
      );
      const result = await registry.connect(user1).getVerificationResult(key);
      const decrypted = await hre.fhevm.userDecryptEbool(result, proxyAddress, user1);
      expect(decrypted).to.be.false;
    });

    it("should check hasMinComplianceLevel individually", async () => {
      await registry.connect(user1).hasMinComplianceLevel(user1.address, 3);
      const revision = await registry.revisions(user1.address);
      const key = hre.ethers.keccak256(
        hre.ethers.solidityPacked(
          ["address", "string", "uint8", "uint256"],
          [user1.address, "minLevel", 3, revision],
        ),
      );
      const result = await registry.connect(user1).getVerificationResult(key);
      const decrypted = await hre.fhevm.userDecryptEbool(result, proxyAddress, user1);
      expect(decrypted).to.be.true;
    });

    it("should check isNotBlacklisted", async () => {
      await registry.connect(user1).isNotBlacklisted(user1.address);
      const revision = await registry.revisions(user1.address);
      const key = hre.ethers.keccak256(
        hre.ethers.solidityPacked(
          ["address", "string", "uint256"],
          [user1.address, "notBlacklisted", revision],
        ),
      );
      const result = await registry.connect(user1).getVerificationResult(key);
      const decrypted = await hre.fhevm.userDecryptEbool(result, proxyAddress, user1);
      expect(decrypted).to.be.true;
    });
  });

  describe("Bidirectional Revocation", () => {
    it("should allow user to self-revoke", async () => {
      expect(await registry.isAttested(user2.address)).to.be.true;

      await expect(registry.connect(user2).revokeIdentity())
        .to.emit(registry, "IdentityRevoked")
        .withArgs(user2.address);

      expect(await registry.isAttested(user2.address)).to.be.false;
      expect(await registry.attestationTimestamp(user2.address)).to.equal(0n);
      expect(await registry.getProofSetHash(user2.address)).to.equal(hre.ethers.ZeroHash);
    });

    it("should allow registrar to revoke", async () => {
      // Re-attest user2
      await attestUser(user2, 100, 276, 2, false);
      expect(await registry.isAttested(user2.address)).to.be.true;

      await expect(registry.connect(registrar).revokeIdentityFor(user2.address))
        .to.emit(registry, "IdentityRevoked")
        .withArgs(user2.address);

      expect(await registry.isAttested(user2.address)).to.be.false;
    });

    it("should revert when non-registrar calls revokeIdentityFor", async () => {
      await expect(
        registry.connect(user1).revokeIdentityFor(user1.address),
      ).to.be.revertedWithCustomError(registry, "OnlyRegistrar");
    });

    it("should revert when revoking non-attested user", async () => {
      const unattested = (await hre.ethers.getSigners())[8];
      await expect(registry.connect(unattested).revokeIdentity()).to.be.revertedWithCustomError(
        registry,
        "NotAttested",
      );
    });

    it("should allow re-attestation after revocation", async () => {
      await attestUser(user2, 100, 276, 2, false);
      expect(await registry.isAttested(user2.address)).to.be.true;
      expect(await registry.nonces(user2.address)).to.be.greaterThan(0n);
    });
  });

  describe("Constants", () => {
    it("should expose attribute constants", async () => {
      expect(await registry.ATTR_BIRTH_YEAR()).to.equal(0x01);
      expect(await registry.ATTR_COUNTRY()).to.equal(0x02);
      expect(await registry.ATTR_COMPLIANCE()).to.equal(0x04);
      expect(await registry.ATTR_BLACKLIST()).to.equal(0x08);
      expect(await registry.ATTR_ALL()).to.equal(0x0f);
    });
  });
});
