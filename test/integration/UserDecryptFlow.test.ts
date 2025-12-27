/**
 * @title User Decrypt Flow (Hardhat + Mock Relayer)
 * @notice End-to-end decrypt test using @fhevm/mock-utils on a Hardhat network
 * @dev Exercises: encrypted input -> on-chain storage -> user decrypt via mock relayer
 */

import { expect } from "chai";
import hre from "hardhat";
import { buildMockFhevmInstance, decryptHandles } from "../utils/fhevm";

describe("User Decrypt Flow (E2E)", () => {
  async function deployIdentityRegistry() {
    const factory = await hre.ethers.getContractFactory("IdentityRegistry");
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return contract;
  }

  it("decrypts identity handles end-to-end", async () => {
    const [owner, registrar, alice] = await hre.ethers.getSigners();

    const identityRegistry = await deployIdentityRegistry();
    const registryAddress = (await identityRegistry.getAddress()) as `0x${string}`;

    await hre.fhevm.assertCoprocessorInitialized(identityRegistry, "IdentityRegistry");

    await identityRegistry.connect(owner).addRegistrar(registrar.address);

    const encrypted = hre.fhevm.createEncryptedInput(registryAddress, registrar.address);
    encrypted.add8(90); // birthYearOffset
    encrypted.add16(840); // countryCode
    encrypted.add8(3); // complianceLevel
    encrypted.addBool(false); // isBlacklisted
    const encryptedInput = await encrypted.encrypt();

    await identityRegistry
      .connect(registrar)
      .attestIdentity(
        alice.address,
        encryptedInput.handles[0],
        encryptedInput.handles[1],
        encryptedInput.handles[2],
        encryptedInput.handles[3],
        encryptedInput.inputProof,
      );

    const birthYearHandle = (await identityRegistry
      .connect(alice)
      .getBirthYearOffset(alice.address)) as `0x${string}`;
    const countryHandle = (await identityRegistry
      .connect(alice)
      .getCountryCode(alice.address)) as `0x${string}`;
    const complianceHandle = (await identityRegistry
      .connect(alice)
      .getComplianceLevel(alice.address)) as `0x${string}`;
    const blacklistHandle = (await identityRegistry
      .connect(alice)
      .getBlacklistStatus(alice.address)) as `0x${string}`;

    const instance = await buildMockFhevmInstance(hre.ethers.provider);

    const decrypted = await decryptHandles(
      instance,
      [
        { handleBytes32: birthYearHandle, contractAddress: registryAddress },
        { handleBytes32: countryHandle, contractAddress: registryAddress },
        { handleBytes32: complianceHandle, contractAddress: registryAddress },
        { handleBytes32: blacklistHandle, contractAddress: registryAddress },
      ],
      alice,
    );

    expect(decrypted[birthYearHandle]).to.equal(90n);
    expect(decrypted[countryHandle]).to.equal(840n);
    expect(decrypted[complianceHandle]).to.equal(3n);
    expect(decrypted[blacklistHandle]).to.equal(false);
  });
});
