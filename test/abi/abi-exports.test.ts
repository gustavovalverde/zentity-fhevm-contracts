import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "chai";
import {
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type ContractFunctionReturnType,
  createPublicClient,
  http,
  zeroAddress,
} from "viem";

import { renderAbiFiles, rootDir } from "../../scripts/abi-files.js";
import {
  complianceLevels,
  type getAbi,
  getIdentityRegistry,
  getIdentityRegistryMirror,
  identityRegistryAbi,
  identityRegistryMirrorAbi,
} from "../../src/index.js";

// Compile-time assertions, enforced by `bun run typecheck`.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type MirrorReadName = ContractFunctionName<typeof identityRegistryMirrorAbi, "pure" | "view">;
type RegistryReadName = ContractFunctionName<typeof identityRegistryAbi, "pure" | "view">;

type AbiTypeAssertions = [
  Expect<Equal<string extends MirrorReadName ? true : false, false>>,
  Expect<Equal<"isCompliant" extends MirrorReadName ? true : false, true>>,
  Expect<Equal<"attestWithPermit" extends RegistryReadName ? true : false, false>>,
  Expect<
    Equal<
      ContractFunctionArgs<typeof identityRegistryMirrorAbi, "view", "isCompliant">,
      readonly [Address, number]
    >
  >,
  Expect<
    Equal<
      ContractFunctionReturnType<typeof identityRegistryMirrorAbi, "view", "isCompliant">,
      boolean
    >
  >,
  Expect<
    Equal<ContractFunctionReturnType<typeof identityRegistryAbi, "view", "isAttested">, boolean>
  >,
  Expect<
    Equal<ReturnType<typeof getAbi<"IdentityRegistryMirror">>, typeof identityRegistryMirrorAbi>
  >,
];

// Type-checked but never called: viem infers names, arguments, and results from the exported ABIs.
async function readsAreTyped() {
  const client = createPublicClient({ transport: http() });

  const compliant = await client.readContract({
    abi: identityRegistryMirrorAbi,
    address: zeroAddress,
    functionName: "isCompliant",
    args: [zeroAddress, complianceLevels.basic],
  });

  await client.readContract({
    abi: identityRegistryMirrorAbi,
    address: zeroAddress,
    // @ts-expect-error the mirror ABI has no such function
    functionName: "notAFunction",
  });

  await client.readContract({
    abi: identityRegistryMirrorAbi,
    address: zeroAddress,
    functionName: "isCompliant",
    // @ts-expect-error the user argument must be an address
    args: [1n, complianceLevels.basic],
  });

  const mirror = getIdentityRegistryMirror(client, { network: "baseSepolia" });
  const compliantViaHelper = await mirror.read.isCompliant([zeroAddress, complianceLevels.full]);

  const registry = getIdentityRegistry(client, { network: "sepolia" });
  const attestationId = await registry.read.currentAttestationId([zeroAddress]);

  return [
    true satisfies Equal<typeof compliant, boolean>,
    true satisfies Equal<typeof compliantViaHelper, boolean>,
    true satisfies Equal<typeof attestationId, bigint>,
  ] as const;
}

describe("published ABIs", () => {
  it("exports the generated ABI modules with the JSON ABI contents", () => {
    const assertions: AbiTypeAssertions | undefined = undefined;
    expect(assertions).to.equal(undefined);
    expect(readsAreTyped).to.be.a("function");

    const mirrorJson = JSON.parse(
      readFileSync(join(rootDir, "abi/IdentityRegistryMirror.json"), "utf8"),
    );
    const registryJson = JSON.parse(
      readFileSync(join(rootDir, "abi/IdentityRegistry.json"), "utf8"),
    );
    expect(identityRegistryMirrorAbi).to.deep.equal(mirrorJson);
    expect(identityRegistryAbi).to.deep.equal(registryJson);
  });

  it("has no generated ABI files for contracts that are no longer exported", () => {
    const onDisk = [
      ...readdirSync(join(rootDir, "abi"))
        .filter((name) => name.endsWith(".json"))
        .map((name) => `abi/${name}`),
      ...readdirSync(join(rootDir, "src/abi")).map((name) => `src/abi/${name}`),
    ].sort();
    const expected = renderAbiFiles()
      .map((file) => file.path)
      .sort();
    expect(
      onDisk,
      "Generated ABI files do not match the exported contracts. Remove the leftovers and run `bun run export-abi`.",
    ).to.deep.equal(expected);
  });

  for (const file of renderAbiFiles()) {
    it(`${file.path} is in sync with the compiled artifacts`, () => {
      const path = join(rootDir, file.path);
      const onDisk = existsSync(path) ? readFileSync(path, "utf8") : undefined;
      expect(
        onDisk,
        `${file.path} is stale. Run \`bun run export-abi\` and commit the result.`,
      ).to.equal(file.contents);
    });
  }
});
