import type { HardhatFhevmRuntimeEnvironment } from "@fhevm/hardhat-plugin-v3";
import { mainnet, polygon, polygonAmoy, sepolia } from "@fhevm/sdk/chains";
import {
  createFhevmEncryptClient,
  hasFhevmRuntimeConfig,
  setFhevmRuntimeConfig,
} from "@fhevm/sdk/ethers";
import type { FhevmEncryptClient } from "@fhevm/sdk/types";
import type { HardhatEthers } from "@nomicfoundation/hardhat-ethers/types";

/** A ciphertext handle as the plugin helpers take it. */
export type Handle = `0x${string}`;

type Encryptor = Pick<FhevmEncryptClient, "encryptValues">;

type EncryptionTarget = {
  contractAddress: string;
  userAddress: string;
};

const PUBLIC_FHEVM_CHAINS = [mainnet, sepolia, polygon, polygonAmoy];

/**
 * Returns the encryption client for a connection: the plugin's cleartext client on a
 * development network, or an `@fhevm/sdk` client backed by the Zama relayer on a public
 * FHEVM network, where `@fhevm/hardhat-plugin-v3` provides no client.
 */
export async function connectEncryptor({
  ethers,
  fhevm,
}: {
  ethers: HardhatEthers;
  fhevm: HardhatFhevmRuntimeEnvironment;
}): Promise<Encryptor> {
  if (fhevm.isDevelopment) {
    return fhevm.client;
  }
  const chain = PUBLIC_FHEVM_CHAINS.find(({ id }) => id === fhevm.network.chainId);
  if (chain === undefined) {
    throw new Error(`No FHEVM deployment is known for chain ${fhevm.network.chainId}`);
  }
  if (!hasFhevmRuntimeConfig()) {
    // The multi-threaded WASM runtime keeps worker threads alive, so `hardhat test` never exits.
    setFhevmRuntimeConfig({ singleThread: true });
  }
  const client = createFhevmEncryptClient({ provider: ethers.provider, chain });
  await client.ready;
  return client;
}

/**
 * Encrypts the four identity attributes under one input proof, in the order
 * `IdentityRegistry.attestWithPermit` reads them.
 */
export async function encryptIdentityAttributes(
  encryptor: Encryptor,
  {
    contractAddress,
    userAddress,
    birthYearOffset,
    countryCode,
    complianceLevel,
    isBlacklisted,
  }: EncryptionTarget & {
    birthYearOffset: number;
    countryCode: number;
    complianceLevel: number;
    isBlacklisted: boolean;
  },
) {
  const { encryptedValues, inputProof } = await encryptor.encryptValues({
    values: [
      { type: "euint8", value: birthYearOffset },
      { type: "euint16", value: countryCode },
      { type: "euint8", value: complianceLevel },
      { type: "ebool", value: isBlacklisted },
    ],
    contractAddress,
    userAddress,
  });
  return {
    birthYearOffset: encryptedValues[0],
    countryCode: encryptedValues[1],
    complianceLevel: encryptedValues[2],
    isBlacklisted: encryptedValues[3],
    inputProof,
  };
}

/** Encrypts a token amount for `CompliantERC20.transferConfidential`. */
export async function encryptTokenAmount(
  encryptor: Encryptor,
  { contractAddress, userAddress, amount }: EncryptionTarget & { amount: bigint },
) {
  const { encryptedValues, inputProof } = await encryptor.encryptValues({
    values: [{ type: "euint64", value: amount }],
    contractAddress,
    userAddress,
  });
  return { amount: encryptedValues[0], inputProof };
}
