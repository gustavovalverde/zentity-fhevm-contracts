import { expect } from "chai";
import { createPublicClient, http } from "viem";

import {
  chainIdByNetwork,
  deployments,
  getContractAddresses,
  getFhevmContractAddresses,
  getIdentityRegistryMirror,
  getIdentityRegistryMirrorAddress,
  getNetworkName,
} from "../../src/index";

describe("address helpers", () => {
  it("returns hardhat addresses from deployments", () => {
    const addresses = getContractAddresses("hardhat");
    expect(addresses.IdentityRegistry).to.equal("0x5FC8d32690cc91D4c39d9d3abcBD16989F875707");
    expect(addresses.ComplianceRules).to.equal("0xa513E6E4b8f2a923D98304ec87F64353C4D5C853");
  });

  it("returns sepolia addresses from deployments", () => {
    const addresses = getContractAddresses("sepolia");
    expect(addresses.IdentityRegistry).to.equal("0xa90723A47A14437500645Ece6049d0128A2f256D");
    expect(addresses.ComplianceRules).to.equal("0xDea37357418134e1A3ee21FAc2Fe28FD9b9908aa");
    expect(addresses.CompliantERC20).to.equal("0x39bc2b0717c21b5ac37BE1c552B7F69ce49F28c1");
  });

  it("returns base sepolia mirror address from deployments", () => {
    expect(getIdentityRegistryMirrorAddress("baseSepolia")).to.equal(
      "0xa33D1032fdcAA44a56d5372971ecA8e06b86fa14",
    );
  });

  it("resolves network name by chainId", () => {
    expect(getNetworkName(31337)).to.equal("hardhat");
    expect(getNetworkName(31337, "localhost")).to.equal("localhost");
  });

  it("overrides take precedence over deployment addresses", () => {
    const addresses = getFhevmContractAddresses("sepolia", {
      overrides: {
        IdentityRegistry: "0x0000000000000000000000000000000000000099",
      },
    });
    expect(addresses.IdentityRegistry).to.equal("0x0000000000000000000000000000000000000099");
    expect(addresses.ComplianceRules).to.equal("0xDea37357418134e1A3ee21FAc2Fe28FD9b9908aa");
  });

  it("resolves by chainId with overrides", () => {
    const addresses = getFhevmContractAddresses(11155111, {
      overrides: {
        CompliantERC20: "0x0000000000000000000000000000000000000042",
      },
    });
    expect(addresses.CompliantERC20).to.equal("0x0000000000000000000000000000000000000042");
    expect(addresses.IdentityRegistry).to.equal("0xa90723A47A14437500645Ece6049d0128A2f256D");
  });

  it("exports chainId-keyed deployment manifests", () => {
    expect(deployments[chainIdByNetwork.sepolia]?.contracts.IdentityRegistry.address).to.equal(
      "0xa90723A47A14437500645Ece6049d0128A2f256D",
    );
    expect(deployments[chainIdByNetwork.hardhat]?.contracts.ComplianceRules.address).to.equal(
      "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
    );
    expect(
      deployments[chainIdByNetwork.baseSepolia]?.contracts.IdentityRegistryMirror.address,
    ).to.equal("0xa33D1032fdcAA44a56d5372971ecA8e06b86fa14");
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
