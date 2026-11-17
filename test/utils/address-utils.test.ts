import { expect } from "chai";
import { createPublicClient, http } from "viem";

import {
  chainIdByNetwork,
  deployments,
  getConfidentialContractAddresses,
  getContractAddresses,
  getIdentityRegistryMirror,
  getIdentityRegistryMirrorAddress,
  getNetworkName,
} from "../../src/index.js";

describe("address helpers", () => {
  it("returns hardhat addresses from deployments", () => {
    const addresses = getContractAddresses("hardhat");
    expect(addresses.IdentityRegistry).to.equal("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512");
    expect(addresses.ComplianceRules).to.equal("0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0");
  });

  it("returns sepolia addresses from deployments", () => {
    const addresses = getContractAddresses("sepolia");
    expect(addresses.IdentityRegistry).to.equal("0x79f24b1100691FbE00b338bFB3977a1A7AE742D1");
    expect(addresses.ComplianceRules).to.equal("0x3685BE535C9b4B5A162a8697DB000461795EFDF7");
    expect(addresses.CompliantERC20).to.equal("0xd9bD2B8728975Ec090479D38D735e41C19FD5840");
  });

  it("returns base sepolia mirror address from deployments", () => {
    expect(getIdentityRegistryMirrorAddress("baseSepolia")).to.equal(
      "0x0CF34291E5Ba44dA4a86927260DEED0cAb80eC16",
    );
  });

  it("resolves network name by chainId", () => {
    expect(getNetworkName(31337)).to.equal("hardhat");
    expect(getNetworkName(31337, "localhost")).to.equal("localhost");
  });

  it("overrides take precedence over deployment addresses", () => {
    const addresses = getConfidentialContractAddresses("sepolia", {
      overrides: {
        IdentityRegistry: "0x0000000000000000000000000000000000000099",
      },
    });
    expect(addresses.IdentityRegistry).to.equal("0x0000000000000000000000000000000000000099");
    expect(addresses.ComplianceRules).to.equal("0x3685BE535C9b4B5A162a8697DB000461795EFDF7");
  });

  it("resolves by chainId with overrides", () => {
    const addresses = getConfidentialContractAddresses(11155111, {
      overrides: {
        CompliantERC20: "0x0000000000000000000000000000000000000042",
      },
    });
    expect(addresses.CompliantERC20).to.equal("0x0000000000000000000000000000000000000042");
    expect(addresses.IdentityRegistry).to.equal("0x79f24b1100691FbE00b338bFB3977a1A7AE742D1");
  });

  it("exports chainId-keyed deployment manifests", () => {
    expect(deployments[chainIdByNetwork.sepolia]?.contracts.IdentityRegistry.address).to.equal(
      "0x79f24b1100691FbE00b338bFB3977a1A7AE742D1",
    );
    expect(deployments[chainIdByNetwork.hardhat]?.contracts.ComplianceRules.address).to.equal(
      "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    );
    expect(
      deployments[chainIdByNetwork.baseSepolia]?.contracts.IdentityRegistryMirror.address,
    ).to.equal("0x0CF34291E5Ba44dA4a86927260DEED0cAb80eC16");
  });

  it("builds typed viem mirror helpers with address overrides", () => {
    const client = createPublicClient({
      transport: http("http://127.0.0.1:8545"),
    });
    const mirror = getIdentityRegistryMirror(client, {
      address: "0x0000000000000000000000000000000000000001",
    });

    expect(mirror.address).to.equal("0x0000000000000000000000000000000000000001");
    expect(mirror.read.isCompliant).to.be.a("function");
  });
});
