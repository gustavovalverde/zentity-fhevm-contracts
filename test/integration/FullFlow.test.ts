/**
 * @title Full Integration Tests
 * @notice Tests the complete flow: IdentityRegistry -> ComplianceRules -> CompliantERC20
 * @dev Uses @fhevm/hardhat-plugin for encrypted input/output handling
 */

import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";

describe("Full Integration Flow", () => {
  let identityRegistry: Awaited<ReturnType<typeof deployIdentityRegistry>>;
  let complianceRules: Awaited<ReturnType<typeof deployComplianceRules>>;
  let token: Awaited<ReturnType<typeof deployToken>>;

  let registryAddress: string;
  let complianceAddress: string;
  let tokenAddress: string;

  let owner: HardhatEthersSigner;
  let registrar: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;

  async function deployIdentityRegistry() {
    const factory = await hre.ethers.getContractFactory("IdentityRegistry");
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return contract;
  }

  async function deployComplianceRules(registryAddr: string) {
    const factory = await hre.ethers.getContractFactory("ComplianceRules");
    const contract = await factory.deploy(registryAddr, 1); // minKycLevel = 1
    await contract.waitForDeployment();
    return contract;
  }

  async function deployToken(complianceAddr: string) {
    const factory = await hre.ethers.getContractFactory("CompliantERC20");
    const contract = await factory.deploy("Zentity Token", "ZTY", complianceAddr);
    await contract.waitForDeployment();
    return contract;
  }

  async function attestUser(
    userAddress: string,
    birthYearOffset: number,
    countryCode: number,
    kycLevel: number,
    isBlacklisted: boolean,
    signer: HardhatEthersSigner,
  ) {
    const encrypted = hre.fhevm.createEncryptedInput(registryAddress, signer.address);
    encrypted.add8(birthYearOffset);
    encrypted.add16(countryCode);
    encrypted.add8(kycLevel);
    encrypted.addBool(isBlacklisted);
    const encryptedInput = await encrypted.encrypt();

    await identityRegistry
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

  before(async function () {
    const signers = await hre.ethers.getSigners();
    if (signers.length < 5) {
      // TODO: Provision at least 5 funded Sepolia accounts to cover full integration flow.
      // This test is skipped on Sepolia when only a single deployer key is configured.
      return this.skip();
    }
    [owner, registrar, alice, bob, charlie] = signers;

    // Deploy all contracts
    identityRegistry = await deployIdentityRegistry();
    registryAddress = await identityRegistry.getAddress();

    complianceRules = await deployComplianceRules(registryAddress);
    complianceAddress = await complianceRules.getAddress();

    token = await deployToken(complianceAddress);
    tokenAddress = await token.getAddress();

    await complianceRules.connect(owner).setAuthorizedCaller(tokenAddress, true);

    // Initialize coprocessors
    await hre.fhevm.assertCoprocessorInitialized(identityRegistry, "IdentityRegistry");
    await hre.fhevm.assertCoprocessorInitialized(complianceRules, "ComplianceRules");
    await hre.fhevm.assertCoprocessorInitialized(token, "CompliantERC20");

    // Setup registrar
    await identityRegistry.connect(owner).addRegistrar(registrar.address);
  });

  describe("Setup", () => {
    it("should have all contracts deployed correctly", async () => {
      expect(registryAddress).to.not.equal(hre.ethers.ZeroAddress);
      expect(complianceAddress).to.not.equal(hre.ethers.ZeroAddress);
      expect(tokenAddress).to.not.equal(hre.ethers.ZeroAddress);
    });

    it("should have compliance rules pointing to identity registry", async () => {
      expect(await complianceRules.identityRegistry()).to.equal(registryAddress);
    });

    it("should have token pointing to compliance rules", async () => {
      expect(await token.complianceChecker()).to.equal(complianceAddress);
    });
  });

  describe("User Attestation", () => {
    it("should attest Alice (compliant user)", async () => {
      // Alice: KYC level 3, not blacklisted
      await attestUser(alice.address, 90, 840, 3, false, registrar);
      expect(await identityRegistry.isAttested(alice.address)).to.be.true;
    });

    it("should attest Bob (compliant user)", async () => {
      // Bob: KYC level 2, not blacklisted
      await attestUser(bob.address, 95, 276, 2, false, registrar);
      expect(await identityRegistry.isAttested(bob.address)).to.be.true;
    });

    it("should attest Charlie (blacklisted user)", async () => {
      // Charlie: KYC level 1, but blacklisted
      await attestUser(charlie.address, 85, 840, 1, true, registrar);
      expect(await identityRegistry.isAttested(charlie.address)).to.be.true;
    });
  });

  describe("Access Grants", () => {
    it("should allow users to grant ComplianceRules access", async () => {
      await identityRegistry.connect(alice).grantAccessTo(complianceAddress);
      await identityRegistry.connect(bob).grantAccessTo(complianceAddress);
      await identityRegistry.connect(charlie).grantAccessTo(complianceAddress);
    });
  });

  describe("Compliance Checks", () => {
    it("should pass compliance for Alice", async () => {
      await complianceRules.connect(alice).checkCompliance(alice.address);

      const result = await complianceRules.connect(alice).getComplianceResult(alice.address);
      const isCompliant = await hre.fhevm.userDecryptEbool(result, complianceAddress, alice);

      expect(isCompliant).to.be.true;
    });

    it("should pass compliance for Bob", async () => {
      await complianceRules.connect(bob).checkCompliance(bob.address);

      const result = await complianceRules.connect(bob).getComplianceResult(bob.address);
      const isCompliant = await hre.fhevm.userDecryptEbool(result, complianceAddress, bob);

      expect(isCompliant).to.be.true;
    });

    it("should fail compliance for Charlie (blacklisted)", async () => {
      await complianceRules.connect(charlie).checkCompliance(charlie.address);

      const result = await complianceRules.connect(charlie).getComplianceResult(charlie.address);
      const isCompliant = await hre.fhevm.userDecryptEbool(result, complianceAddress, charlie);

      expect(isCompliant).to.be.false;
    });

    it("should fail compliance for non-attested user", async () => {
      const unattested = (await hre.ethers.getSigners())[6];
      await complianceRules.connect(unattested).checkCompliance(unattested.address);

      const result = await complianceRules
        .connect(unattested)
        .getComplianceResult(unattested.address);
      const isCompliant = await hre.fhevm.userDecryptEbool(result, complianceAddress, unattested);

      expect(isCompliant).to.be.false;
    });

    it("should block non-owner callers from checking compliance for others", async () => {
      await expect(
        complianceRules.connect(bob).checkCompliance(alice.address),
      ).to.be.revertedWithCustomError(complianceRules, "CallerNotAuthorized");
    });

    it("should block unauthorized access to cached compliance results", async () => {
      await complianceRules.connect(alice).checkCompliance(alice.address);

      await expect(
        complianceRules.connect(owner).getComplianceResult(alice.address),
      ).to.be.revertedWithCustomError(complianceRules, "AccessProhibited");
    });
  });

  describe("Token Operations", () => {
    // Note: euint64 max is ~18.4 quintillion. Using smaller values for tests.
    const MINT_AMOUNT = 1000000000n; // 1 billion (fits easily in uint64)
    const TRANSFER_AMOUNT = 100000000n; // 100 million
    const UINT64_MAX = (1n << 64n) - 1n;

    it("should mint tokens to Alice", async () => {
      await token.connect(owner).mint(alice.address, MINT_AMOUNT);

      const balance = await token.connect(alice).balanceOf(alice.address);
      const decryptedBalance = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64,
        balance,
        tokenAddress,
        alice,
      );

      expect(decryptedBalance).to.equal(MINT_AMOUNT);
    });

    it("should reject mint amounts above uint64 max", async () => {
      await expect(
        token.connect(owner).mint(alice.address, UINT64_MAX + 1n),
      ).to.be.revertedWithCustomError(token, "TotalSupplyOverflow");
    });

    it("should allow compliant transfer from Alice to Bob", async () => {
      const encrypted = hre.fhevm.createEncryptedInput(tokenAddress, alice.address);
      encrypted.add64(TRANSFER_AMOUNT);
      const encryptedInput = await encrypted.encrypt();

      await token
        .connect(alice)
        ["transfer(address,bytes32,bytes)"](
          bob.address,
          encryptedInput.handles[0],
          encryptedInput.inputProof,
        );

      // Check Bob's balance
      const bobBalance = await token.connect(bob).balanceOf(bob.address);
      const decryptedBobBalance = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64,
        bobBalance,
        tokenAddress,
        bob,
      );

      expect(decryptedBobBalance).to.equal(TRANSFER_AMOUNT);

      // Check Alice's balance
      const aliceBalance = await token.connect(alice).balanceOf(alice.address);
      const decryptedAliceBalance = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64,
        aliceBalance,
        tokenAddress,
        alice,
      );

      expect(decryptedAliceBalance).to.equal(MINT_AMOUNT - TRANSFER_AMOUNT);
    });

    it("should reject transfer with unauthorized ciphertext handle", async () => {
      const aliceBalanceHandle = await token.balanceOf(alice.address);

      await expect(
        token.connect(bob)["transfer(address,bytes32)"](bob.address, aliceBalanceHandle),
      ).to.be.revertedWithCustomError(token, "UnauthorizedCiphertext");
    });

    it("should silently fail transfer to Charlie (blacklisted) - branch-free", async () => {
      const aliceBalanceBefore = await token.connect(alice).balanceOf(alice.address);
      const aliceBalanceBeforeDecrypted = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64,
        aliceBalanceBefore,
        tokenAddress,
        alice,
      );

      const encrypted = hre.fhevm.createEncryptedInput(tokenAddress, alice.address);
      encrypted.add64(TRANSFER_AMOUNT);
      const encryptedInput = await encrypted.encrypt();

      // Transfer should NOT revert - branch-free compliance
      await token
        .connect(alice)
        ["transfer(address,bytes32,bytes)"](
          charlie.address,
          encryptedInput.handles[0],
          encryptedInput.inputProof,
        );

      // Alice's balance should be unchanged (transfer of 0 happened)
      const aliceBalanceAfter = await token.connect(alice).balanceOf(alice.address);
      const aliceBalanceAfterDecrypted = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64,
        aliceBalanceAfter,
        tokenAddress,
        alice,
      );

      expect(aliceBalanceAfterDecrypted).to.equal(aliceBalanceBeforeDecrypted);
    });
  });

  describe("Compliance Changes", () => {
    it("should update min KYC level and affect compliance", async () => {
      // Increase min KYC level to 3 (Bob has level 2)
      await complianceRules.connect(owner).setMinKycLevel(3);

      // Bob should now fail compliance
      await complianceRules.connect(bob).checkCompliance(bob.address);

      const result = await complianceRules.connect(bob).getComplianceResult(bob.address);
      const isCompliant = await hre.fhevm.userDecryptEbool(result, complianceAddress, bob);

      expect(isCompliant).to.be.false;

      // Reset for other tests
      await complianceRules.connect(owner).setMinKycLevel(1);
    });
  });
});
