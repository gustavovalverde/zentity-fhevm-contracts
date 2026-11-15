import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { renderAbiFiles, rootDir } from "./abi-files";

for (const file of renderAbiFiles()) {
  const target = join(rootDir, file.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.contents);
  console.log(`Exported ${file.path}`);
}

console.log("ABI export complete!");
