import { expect } from "chai";

import { getContractAddresses, getNetworkName, resolveContractAddresses } from "../../src/index";

describe("address helpers", () => {
  it("returns hardhat addresses from deployments", () => {
    const addresses = getContractAddresses("hardhat");
    expect(addresses.IdentityRegistry).to.equal("0x5FC8d32690cc91D4c39d9d3abcBD16989F875707");
    expect(addresses.ComplianceRules).to.equal("0xa513E6E4b8f2a923D98304ec87F64353C4D5C853");
  });

  it("returns sepolia addresses from deployments", () => {
    const addresses = getContractAddresses("sepolia");
    expect(addresses.IdentityRegistry).to.equal("0x05c6FB879BbF0Cab2B0206523583F94E49Ba62e2");
    expect(addresses.ComplianceRules).to.equal("0x78dE340fc7A6ba470a5dD8b0a5f5933cD48dC164");
    expect(addresses.CompliantERC20).to.equal("0x2CBEF5Da4F16346bBb34C3D7a81bFC0D9882c711");
  });

  it("resolves network name by chainId", () => {
    expect(getNetworkName(31337)).to.equal("hardhat");
    expect(getNetworkName(31337, "localhost")).to.equal("localhost");
  });

  it("overrides take precedence over deployment addresses", () => {
    const addresses = resolveContractAddresses("sepolia", {
      overrides: {
        IdentityRegistry: "0x0000000000000000000000000000000000000099",
      },
    });
    expect(addresses.IdentityRegistry).to.equal("0x0000000000000000000000000000000000000099");
    expect(addresses.ComplianceRules).to.equal("0x78dE340fc7A6ba470a5dD8b0a5f5933cD48dC164");
  });

  it("resolves by chainId with overrides", () => {
    const addresses = resolveContractAddresses(11155111, {
      overrides: {
        CompliantERC20: "0x0000000000000000000000000000000000000042",
      },
    });
    expect(addresses.CompliantERC20).to.equal("0x0000000000000000000000000000000000000042");
    expect(addresses.IdentityRegistry).to.equal("0x05c6FB879BbF0Cab2B0206523583F94E49Ba62e2");
  });
});
