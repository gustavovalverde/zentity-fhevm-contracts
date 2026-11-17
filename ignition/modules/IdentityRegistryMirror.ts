import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * The plaintext Base mirror behind an ERC1967 proxy. The deployer owns upgrades and registrar
 * management; `registrar` records mirrored compliance and defaults to the deployer, which is
 * what local deployments use. Base Sepolia sets it in `ignition/parameters/baseSepolia.json`.
 */
export default buildModule("IdentityRegistryMirror", (m) => {
  const owner = m.getAccount(0);
  const registrar = m.getParameter("registrar", owner);

  const implementation = m.contract("IdentityRegistryMirror", [], {
    id: "IdentityRegistryMirror_Implementation",
  });
  const proxy = m.contract(
    "ERC1967Proxy",
    [implementation, m.encodeFunctionCall(implementation, "initialize", [owner, registrar])],
    { id: "IdentityRegistryMirror_Proxy" },
  );
  const identityRegistryMirror = m.contractAt("IdentityRegistryMirror", proxy, {
    id: "IdentityRegistryMirror",
  });

  return { identityRegistryMirror };
});
