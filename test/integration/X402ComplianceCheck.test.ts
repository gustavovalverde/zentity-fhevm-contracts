/**
 * @title x402 Compliance Check Tests
 * @notice Simulates x402 facilitator verifying compliance before payment settlement
 */

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";

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

interface EncryptedInputResult {
  handles: readonly Uint8Array[];
  inputProof: Uint8Array;
}

function buildEncryptedIdentityAttributes(encryptedInput: EncryptedInputResult) {
  return {
    birthYearOffset: encryptedInput.handles[0],
    countryCode: encryptedInput.handles[1],
    complianceLevel: encryptedInput.handles[2],
    isBlacklisted: encryptedInput.handles[3],
    inputProof: encryptedInput.inputProof,
  };
}

describe("x402 Compliance Oracle", () => {
  let registry: any;
  let facilitator: any;
  let registryAddress: string;

  let owner: HardhatEthersSigner;
  let registrar: HardhatEthersSigner;
  let compliantUser: HardhatEthersSigner;
  let nonCompliantUser: HardhatEthersSigner;
  let domain: any;

  async function attestUser(
    userSigner: HardhatEthersSigner,
    complianceLevel: number,
    isBlacklisted = false,
  ) {
    const nonce = await registry.nonces(userSigner.address);
    const block = await hre.ethers.provider.getBlock("latest");
    const deadline = (block?.timestamp ?? 0) + 3600;

    const message = {
      user: userSigner.address,
      birthYearOffset: 90,
      countryCode: 840,
      complianceLevel,
      isBlacklisted,
      proofSetHash: hre.ethers.ZeroHash,
      policyVersion: 1,
      nonce,
      deadline,
    };

    const signature = await registrar.signTypedData(domain, PERMIT_TYPES, message);
    const { v, r, s } = hre.ethers.Signature.from(signature);

    const permit = { ...message, v, r, s };
    delete (permit as any).user;
    delete (permit as any).nonce;

    const encrypted = hre.fhevm.createEncryptedInput(registryAddress, userSigner.address);
    encrypted.add8(90);
    encrypted.add16(840);
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
        buildEncryptedIdentityAttributes(encryptedInput),
      );
  }

  before(async () => {
    [owner, registrar, compliantUser, nonCompliantUser] = await hre.ethers.getSigners();

    // Deploy registry via UUPS proxy
    const regFactory = await hre.ethers.getContractFactory("IdentityRegistry");
    const regImpl = await regFactory.deploy();
    await regImpl.waitForDeployment();

    const proxyFactory = await hre.ethers.getContractFactory("ERC1967Proxy");
    const initData = regFactory.interface.encodeFunctionData("initialize", [owner.address]);
    const proxy = await proxyFactory.deploy(await regImpl.getAddress(), initData);
    await proxy.waitForDeployment();

    registry = regFactory.attach(await proxy.getAddress());
    registryAddress = await proxy.getAddress();

    await registry.connect(owner).setRegistrar(registrar.address, true);

    // Deploy mock facilitator (requires compliance level >= 2)
    const facFactory = await hre.ethers.getContractFactory("MockFacilitator");
    facilitator = await facFactory.deploy(registryAddress, 2);
    await facilitator.waitForDeployment();

    // Authorize the facilitator as a policy contract
    await registry.connect(owner).setAuthorizedPolicy(await facilitator.getAddress(), true);

    // EIP-712 domain
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;
    domain = {
      name: "ZentityIdentityRegistry",
      version: "2",
      chainId: Number(chainId),
      verifyingContract: registryAddress,
    };

    // Attest users: compliant (level 3) and non-compliant (level 1)
    await attestUser(compliantUser, 3);
    await attestUser(nonCompliantUser, 1);
  });

  it("should verify compliant user via facilitator", async () => {
    await expect(facilitator.connect(owner).settleWithCompliance(compliantUser.address))
      .to.emit(facilitator, "SettlementAttempted")
      .withArgs(compliantUser.address);

    const result = await facilitator.settlementResults(compliantUser.address);
    const decrypted = await hre.fhevm.userDecryptEbool(
      result,
      await facilitator.getAddress(),
      owner,
    );
    expect(decrypted).to.be.true;
  });

  it("should reject non-compliant user via facilitator", async () => {
    await facilitator.connect(owner).settleWithCompliance(nonCompliantUser.address);

    const result = await facilitator.settlementResults(nonCompliantUser.address);
    const decrypted = await hre.fhevm.userDecryptEbool(
      result,
      await facilitator.getAddress(),
      owner,
    );
    expect(decrypted).to.be.false;
  });

  it("should reject non-attested wallet", async () => {
    const unknown = (await hre.ethers.getSigners())[5];
    await expect(
      facilitator.connect(owner).settleWithCompliance(unknown.address),
    ).to.be.revertedWithCustomError(registry, "NotAttested");
  });

  it("should work with isAttested pre-check (free view call)", async () => {
    // x402 facilitators can do a cheap pre-check before the FHE operation
    expect(await registry.isAttested(compliantUser.address)).to.be.true;
    const unknown = (await hre.ethers.getSigners())[5];
    expect(await registry.isAttested(unknown.address)).to.be.false;
  });
});
