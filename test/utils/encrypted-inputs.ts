import type { HardhatFhevmRuntimeEnvironment } from "@fhevm/hardhat-plugin-v3";

/** A ciphertext handle as the plugin helpers take it. */
export type Handle = `0x${string}`;

type EncryptionTarget = {
  contractAddress: string;
  userAddress: string;
};

/**
 * Encrypts the four identity attributes under one input proof, in the order
 * `IdentityRegistry.attestWithPermit` reads them.
 */
export async function encryptIdentityAttributes(
  fhevm: HardhatFhevmRuntimeEnvironment,
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
  const { encryptedValues, inputProof } = await fhevm.client.encryptValues({
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
  fhevm: HardhatFhevmRuntimeEnvironment,
  { contractAddress, userAddress, amount }: EncryptionTarget & { amount: bigint },
) {
  const { externalEuint64, inputProof } = await fhevm.helpers.encryptUint64({
    value: amount,
    contractAddress,
    userAddress,
  });
  return { amount: externalEuint64, inputProof };
}
