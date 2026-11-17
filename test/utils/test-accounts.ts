import type { HardhatEthers, HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";

// Covers every transaction one FullFlow account sends on a public network.
const GAS_BUDGET_PER_ACCOUNT = 10_000_000n;
const SWEEP_GAS_LIMIT = 21_000n;

/**
 * Returns `count` signers. A development network has them already. A public
 * network configures only the deployer, so the rest are fresh wallets that the
 * deployer funds; `release` sends their remaining balance back to it.
 */
export async function testAccounts(ethers: HardhatEthers, count: number) {
  const configured = await ethers.getSigners();
  if (configured.length >= count) {
    return { signers: configured.slice(0, count), release: async () => {} };
  }

  const [deployer] = configured;
  if (deployer === undefined) {
    throw new Error("The network configures no account to fund the test accounts");
  }
  const feeData = await ethers.provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (maxFeePerGas === null) {
    throw new Error("The network reported no gas price");
  }

  const wallets = Array.from({ length: count - 1 }, () =>
    ethers.Wallet.createRandom().connect(ethers.provider),
  );
  for (const wallet of wallets) {
    const funding = await deployer.sendTransaction({
      to: wallet.address,
      value: GAS_BUDGET_PER_ACCOUNT * maxFeePerGas,
    });
    await funding.wait();
  }

  const release = async () => {
    const { gasPrice } = await ethers.provider.getFeeData();
    if (gasPrice === null) {
      return;
    }
    for (const wallet of wallets) {
      const balance = await ethers.provider.getBalance(wallet.address);
      const value = balance - SWEEP_GAS_LIMIT * gasPrice;
      if (value > 0n) {
        const sweep = await wallet.sendTransaction({
          to: deployer.address,
          value,
          gasLimit: SWEEP_GAS_LIMIT,
          gasPrice,
        });
        await sweep.wait();
      }
    }
  };

  return { signers: [deployer, ...wallets] as HardhatEthersSigner[], release };
}
