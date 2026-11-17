import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * The confidential contracts: IdentityRegistry behind an ERC1967 proxy, ComplianceRules as an
 * authorized policy on it, and CompliantERC20 as an authorized caller of ComplianceRules. The
 * deployer owns all three and is the registry's first registrar.
 */
export default buildModule("Confidential", (m) => {
  const deployer = m.getAccount(0);

  const implementation = m.contract("IdentityRegistry", [], {
    id: "IdentityRegistry_Implementation",
  });
  const proxy = m.contract(
    "ERC1967Proxy",
    [implementation, m.encodeFunctionCall(implementation, "initialize", [deployer])],
    { id: "IdentityRegistry_Proxy" },
  );
  const identityRegistry = m.contractAt("IdentityRegistry", proxy, { id: "IdentityRegistry" });

  const minComplianceLevel = 1;
  const complianceRules = m.contract("ComplianceRules", [identityRegistry, minComplianceLevel]);
  m.call(identityRegistry, "setAuthorizedPolicy", [complianceRules, true]);

  const compliantErc20 = m.contract("CompliantERC20", ["Zentity Token", "ZTY", complianceRules]);
  m.call(complianceRules, "setAuthorizedCaller", [compliantErc20, true]);

  return { identityRegistry, complianceRules, compliantErc20 };
});
