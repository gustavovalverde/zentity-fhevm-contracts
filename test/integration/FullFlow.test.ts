/**
 * @title Full Integration Flow Tests (v2)
 * @notice End-to-end: permit → attest → grant → mint → transfer → revoke
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

function buildEncryptedTokenAmount(encryptedInput: EncryptedInputResult) {
  return {
    amount: encryptedInput.handles[0],
    inputProof: encryptedInput.inputProof,
  };
}

describe("Full Integration Flow", () => {
  let registry: any;
  let token: any;

  let registryAddress: string;
  let complianceAddress: string;

  let owner: HardhatEthersSigner;
  let registrar: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let domain: any;

  async function deployAll() {
    // 1. IdentityRegistry via UUPS proxy
    const regFactory = await hre.ethers.getContractFactory("IdentityRegistry");
    const regImpl = await regFactory.deploy();
    await regImpl.waitForDeployment();

    const proxyFactory = await hre.ethers.getContractFactory("ERC1967Proxy");
    const initData = regFactory.interface.encodeFunctionData("initialize", [owner.address]);
    const proxy = await proxyFactory.deploy(await regImpl.getAddress(), initData);
    await proxy.waitForDeployment();

    const reg = regFactory.attach(await proxy.getAddress());
    registryAddress = await proxy.getAddress();

    // 2. ComplianceRules
    const compFactory = await hre.ethers.getContractFactory("ComplianceRules");
    const comp = await compFactory.deploy(registryAddress, 1);
    await comp.waitForDeployment();
    complianceAddress = await comp.getAddress();

    // Authorize ComplianceRules as a policy contract
    await (reg as any).setAuthorizedPolicy(complianceAddress, true);

    // 3. CompliantERC20
    const tokFactory = await hre.ethers.getContractFactory("CompliantERC20");
    const tok = await tokFactory.deploy("Zentity Token", "ZTY", complianceAddress);
    await tok.waitForDeployment();

    // Wire: token as authorized caller on ComplianceRules
    await comp.connect(owner).setAuthorizedCaller(await tok.getAddress(), true);

    // Add registrar
    await (reg as any).connect(owner).setRegistrar(registrar.address, true);

    return { reg: reg as any, comp: comp as any, tok: tok as any };
  }

  async function attestUser(
    userSigner: HardhatEthersSigner,
    birthYearOffset: number,
    countryCode: number,
    complianceLevel: number,
    isBlacklisted: boolean,
  ) {
    const nonce = await registry.nonces(userSigner.address);
    const block = await hre.ethers.provider.getBlock("latest");
    const deadline = (block?.timestamp ?? 0) + 3600;

    const message = {
      user: userSigner.address,
      birthYearOffset,
      countryCode,
      complianceLevel,
      isBlacklisted,
      proofSetHash: hre.ethers.ZeroHash,
      policyVersion: 1,
      nonce,
      deadline,
    };

    const signature = await registrar.signTypedData(domain, PERMIT_TYPES, message);
    const { v, r, s } = hre.ethers.Signature.from(signature);

    const permit = { ...message, deadline, v, r, s };
    delete (permit as any).user;
    delete (permit as any).nonce;

    const encrypted = hre.fhevm.createEncryptedInput(registryAddress, userSigner.address);
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
        buildEncryptedIdentityAttributes(encryptedInput),
      );
  }

  before(async () => {
    [owner, registrar, alice, bob] = await hre.ethers.getSigners();
    const contracts = await deployAll();
    registry = contracts.reg;
    token = contracts.tok;

    const chainId = (await hre.ethers.provider.getNetwork()).chainId;
    domain = {
      name: "ZentityIdentityRegistry",
      version: "2",
      chainId: Number(chainId),
      verifyingContract: registryAddress,
    };
  });

  it("should attest Alice and Bob via permits", async () => {
    await attestUser(alice, 90, 840, 3, false);
    await attestUser(bob, 100, 276, 2, false);

    expect(await registry.isAttested(alice.address)).to.be.true;
    expect(await registry.isAttested(bob.address)).to.be.true;
  });

  it("should allow Alice to grant compliance access", async () => {
    // Grant COMPLIANCE + BLACKLIST to ComplianceRules for TRANSFER_GATING
    await registry.connect(alice).grantAttributeAccess(complianceAddress, 0x0c, 3);
    expect(await registry.getGrantedAttributes(alice.address, complianceAddress)).to.equal(0x0c);
  });

  it("should allow Bob to grant compliance access", async () => {
    await registry.connect(bob).grantAttributeAccess(complianceAddress, 0x0c, 3);
  });

  it("should mint tokens to Alice", async () => {
    await token.connect(owner).mint(alice.address, 5n * 10n ** 18n);
    expect(await token.totalSupply()).to.equal(5n * 10n ** 18n);
  });

  it("should allow compliant transfer from Alice to Bob", async () => {
    const tokenAddress = await token.getAddress();
    const amount = 2n * 10n ** 18n;

    const encrypted = hre.fhevm.createEncryptedInput(tokenAddress, alice.address);
    encrypted.add64(amount);
    const encryptedInput = await encrypted.encrypt();

    await token
      .connect(alice)
      .transferConfidential(bob.address, buildEncryptedTokenAmount(encryptedInput));
  });

  it("should allow Alice to self-revoke", async () => {
    await registry.connect(alice).revokeIdentity();
    expect(await registry.isAttested(alice.address)).to.be.false;
  });

  it("should silently fail transfer after revocation (branch-free)", async () => {
    // Re-attest Alice for the token check, but don't grant compliance access
    // Actually, the transfer should silently transfer 0 since Alice is no longer compliant
    // Since Alice was revoked, ComplianceRules.checkCompliance will return false
    // The branch-free logic will transfer 0
    const tokenAddress = await token.getAddress();
    const amount = 1n * 10n ** 18n;

    const encrypted = hre.fhevm.createEncryptedInput(tokenAddress, alice.address);
    encrypted.add64(amount);
    const encryptedInput = await encrypted.encrypt();

    // This should NOT revert — it silently transfers 0
    await token
      .connect(alice)
      .transferConfidential(bob.address, buildEncryptedTokenAmount(encryptedInput));

    // Token still exists (totalSupply unchanged)
    expect(await token.totalSupply()).to.equal(5n * 10n ** 18n);
  });
});
