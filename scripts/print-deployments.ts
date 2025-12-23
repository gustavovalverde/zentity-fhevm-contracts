import fs from "node:fs";
import path from "node:path";

const rawArgs = process.argv.slice(2);
const network = rawArgs.find((arg) => !arg.startsWith("-")) || "sepolia";
const envStyle = rawArgs.includes("--env");
const baseDir = path.resolve(process.cwd(), "deployments", network);

function readAddress(contractName: string) {
  const filePath = path.join(baseDir, `${contractName}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const json = JSON.parse(fs.readFileSync(filePath, "utf8")) as { address?: string };
  return json.address || null;
}

const addresses = {
  identityRegistry: readAddress("IdentityRegistry"),
  complianceRules: readAddress("ComplianceRules"),
  compliantErc20: readAddress("CompliantERC20"),
};

if (!addresses.identityRegistry && !addresses.complianceRules && !addresses.compliantErc20) {
  console.error(`No deployments found at ${baseDir}`);
  process.exit(1);
}

if (envStyle) {
  console.log(`IDENTITY_REGISTRY_${network.toUpperCase()}=${addresses.identityRegistry ?? ""}`);
  console.log(`COMPLIANCE_RULES_${network.toUpperCase()}=${addresses.complianceRules ?? ""}`);
  console.log(`COMPLIANT_ERC20_${network.toUpperCase()}=${addresses.compliantErc20 ?? ""}`);
} else {
  console.log(JSON.stringify({ network, ...addresses }, null, 2));
}
