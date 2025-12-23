import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const contracts = ["IdentityRegistry", "ComplianceRules", "CompliantERC20"];
const artifactsDir = join(__dirname, "../artifacts/contracts");
const abiDir = join(__dirname, "../abi");

// Ensure abi directory exists
mkdirSync(abiDir, { recursive: true });

for (const contract of contracts) {
  // Find the artifact (check multiple possible locations)
  const possiblePaths = [
    join(artifactsDir, `core/${contract}.sol/${contract}.json`),
    join(artifactsDir, `compliance/${contract}.sol/${contract}.json`),
    join(artifactsDir, `tokens/${contract}.sol/${contract}.json`),
    join(artifactsDir, `interfaces/I${contract}.sol/I${contract}.json`),
  ];

  let artifact: { abi: unknown } | null = null;
  for (const path of possiblePaths) {
    try {
      artifact = JSON.parse(readFileSync(path, "utf8"));
      break;
    } catch {
      // Try next path
    }
  }

  if (!artifact) {
    console.warn(`Warning: Could not find artifact for ${contract}`);
    continue;
  }

  // Write just the ABI
  const abiPath = join(abiDir, `${contract}.json`);
  writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
  console.log(`Exported ${contract} ABI to ${abiPath}`);
}

const indexJs = contracts
  .map((contract) => `const ${contract}ABI = require("./${contract}.json");`)
  .join("\n");
const indexExports = `\n\nmodule.exports = {\n${contracts
  .map((contract) => `  ${contract}ABI,`)
  .join("\n")}\n};\n`;

writeFileSync(join(abiDir, "index.js"), `${indexJs}${indexExports}`);

const indexDts = contracts.map((contract) => `export const ${contract}ABI: unknown;`).join("\n");
writeFileSync(join(abiDir, "index.d.ts"), `${indexDts}\n`);

console.log("ABI export complete!");
