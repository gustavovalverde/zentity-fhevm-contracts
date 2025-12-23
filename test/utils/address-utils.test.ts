import { expect } from "chai";

import { getContractAddresses, getNetworkName, resolveContractAddresses } from "../../src/index";

describe("address helpers", () => {
  it("returns hardhat addresses from deployments", () => {
    const addresses = getContractAddresses("hardhat");
    expect(addresses.IdentityRegistry).to.equal("0x5FbDB2315678afecb367f032d93F642f64180aa3");
    expect(addresses.ComplianceRules).to.equal("0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0");
  });

  it("resolves network name by chainId", () => {
    expect(getNetworkName(31337)).to.equal("hardhat");
    expect(getNetworkName(31337, "localhost")).to.equal("localhost");
  });

  it("allows overrides when no deployment exists", () => {
    const addresses = resolveContractAddresses("sepolia", {
      overrides: {
        IdentityRegistry: "0x0000000000000000000000000000000000000001",
        ComplianceRules: "0x0000000000000000000000000000000000000002",
        CompliantERC20: "0x0000000000000000000000000000000000000003",
      },
    });

    expect(addresses.IdentityRegistry).to.equal("0x0000000000000000000000000000000000000001");
  });

  it("throws when overrides are incomplete", () => {
    expect(() =>
      resolveContractAddresses("sepolia", {
        overrides: {
          IdentityRegistry: "0x0000000000000000000000000000000000000001",
        },
      }),
    ).to.throw(/Provide overrides/);
  });
});
