import { contracts, MockFhevmInstance, userDecryptHandleBytes32 } from "@fhevm/mock-utils";
import type { Provider, Signer } from "ethers";

export type RelayerProvider = Provider & {
  send: (method: string, params: unknown[]) => Promise<unknown>;
};

export type HandleContractPair = {
  handleBytes32: `0x${string}`;
  contractAddress: `0x${string}`;
};

type RelayerMetadata = {
  ACLAddress: `0x${string}`;
  InputVerifierAddress: `0x${string}`;
  KMSVerifierAddress: `0x${string}`;
};

export async function buildMockFhevmInstance(
  provider: RelayerProvider,
): Promise<MockFhevmInstance> {
  const metadata = (await provider.send("fhevm_relayer_metadata", [])) as RelayerMetadata;

  const [inputVerifier, kmsVerifier] = await Promise.all([
    contracts.InputVerifier.create(provider, metadata.InputVerifierAddress),
    contracts.KMSVerifier.create(provider, metadata.KMSVerifierAddress),
  ]);

  const inputDomain = inputVerifier.inputVerifierProperties.eip712Domain;
  const kmsDomain = kmsVerifier.kmsVerifierProperties.eip712Domain;
  if (!inputDomain || !kmsDomain) {
    throw new Error("Missing EIP-712 domain info for mock relayer");
  }

  const network = await provider.getNetwork();

  return MockFhevmInstance.create(
    provider,
    provider,
    {
      aclContractAddress: metadata.ACLAddress,
      chainId: Number(network.chainId),
      gatewayChainId: Number(inputDomain.chainId),
      inputVerifierContractAddress: metadata.InputVerifierAddress,
      kmsContractAddress: metadata.KMSVerifierAddress,
      verifyingContractAddressDecryption: kmsDomain.verifyingContract as `0x${string}`,
      verifyingContractAddressInputVerification: inputDomain.verifyingContract as `0x${string}`,
    },
    {
      inputVerifierProperties: inputVerifier.inputVerifierProperties,
      kmsVerifierProperties: kmsVerifier.kmsVerifierProperties,
    },
  );
}

export async function decryptHandles(
  instance: MockFhevmInstance,
  handles: HandleContractPair[],
  user: Signer,
): Promise<Awaited<ReturnType<typeof userDecryptHandleBytes32>>> {
  return userDecryptHandleBytes32(instance, handles, user);
}
