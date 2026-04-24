import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ContractName, contractNames } from "../src/contract-names";

const artifactsDir = join(__dirname, "../artifacts/contracts");
const abiDir = join(__dirname, "../abi");

mkdirSync(abiDir, { recursive: true });

const abiExportName: Record<ContractName, string> = {
  IdentityRegistry: "identityRegistryAbi",
  IdentityRegistryMirror: "identityRegistryMirrorAbi",
  ComplianceRules: "complianceRulesAbi",
  CompliantERC20: "compliantErc20Abi",
};

for (const contract of contractNames) {
  const possiblePaths = [
    join(artifactsDir, `core/${contract}.sol/${contract}.json`),
    join(artifactsDir, `compliance/${contract}.sol/${contract}.json`),
    join(artifactsDir, `tokens/${contract}.sol/${contract}.json`),
    join(artifactsDir, `interfaces/I${contract}.sol/I${contract}.json`),
  ];

  let artifact: { abi: unknown } | null = null;
  for (const path of possiblePaths) {
    if (!existsSync(path)) continue;
    artifact = JSON.parse(readFileSync(path, "utf8"));
    break;
  }

  if (!artifact) {
    console.warn(`Warning: Could not find artifact for ${contract}`);
    continue;
  }

  const abiPath = join(abiDir, `${contract}.json`);
  writeFileSync(abiPath, `${JSON.stringify(artifact.abi, null, 2)}\n`);
  console.log(`Exported ${contract} ABI to ${abiPath}`);
}

const indexJs = contractNames
  .map((contract) => `const ${abiExportName[contract]} = require("./${contract}.json");`)
  .join("\n");
const indexExports = `\n\nmodule.exports = {\n${contractNames
  .map((contract) => `  ${abiExportName[contract]},`)
  .join("\n")}\n};\n`;

writeFileSync(join(abiDir, "index.js"), `${indexJs}${indexExports}`);

const indexDts = contractNames
  .map((contract) => `export const ${abiExportName[contract]}: unknown;`)
  .join("\n");
writeFileSync(join(abiDir, "index.d.ts"), `${indexDts}\n`);

console.log("ABI export complete!");
