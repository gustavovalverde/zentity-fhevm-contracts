import hre from "hardhat";
import {
  type ContractName,
  confidentialContractNames,
  contractNames,
  isNetworkName,
  mirrorContractNames,
  type NetworkName,
} from "../src/contract-names";

const LOCAL_NETWORKS = new Set<NetworkName>(["hardhat", "localhost"]);
const shouldRunWriteChecks = process.env.DEPLOYMENT_VALIDATION_WRITES === "true";

type DeploymentRecord = {
  address: string;
};

type DeploymentRecords = Partial<Record<ContractName, DeploymentRecord>>;

function requireNetworkName(networkName: string): NetworkName {
  if (!isNetworkName(networkName)) {
    throw new Error(`Unsupported deployment validation network: ${networkName}`);
  }
  return networkName;
}

function getExpectedContractNames(network: NetworkName): readonly ContractName[] {
  if (LOCAL_NETWORKS.has(network)) {
    return contractNames;
  }
  if (network === "baseSepolia") {
    return mirrorContractNames;
  }
  return confidentialContractNames;
}

function requireDeploymentRecord(
  deployments: DeploymentRecords,
  contractName: ContractName,
): DeploymentRecord {
  const deployment = deployments[contractName];
  if (!deployment) {
    throw new Error(`Missing deployment artifact for ${contractName}`);
  }
  return deployment;
}

async function requireDeployedBytecode(contractName: ContractName, address: string): Promise<void> {
  const bytecode = await hre.ethers.provider.getCode(address);
  if (bytecode === "0x") {
    throw new Error(`${contractName} has no bytecode at ${address}`);
  }
}

async function readDeploymentRecords(
  expectedContractNames: readonly ContractName[],
): Promise<DeploymentRecords> {
  const deployments: DeploymentRecords = {};

  for (const contractName of expectedContractNames) {
    const deployment = await hre.deployments.getOrNull(contractName);
    if (!deployment) {
      continue;
    }
    deployments[contractName] = { address: deployment.address };
    await requireDeployedBytecode(contractName, deployment.address);
    console.log(`  ${contractName}: ${deployment.address}`);
  }

  for (const contractName of expectedContractNames) {
    requireDeploymentRecord(deployments, contractName);
  }

  return deployments;
}

async function validateIdentityRegistryDeployment(
  deployments: DeploymentRecords,
  network: NetworkName,
): Promise<void> {
  const registryDeployment = deployments.IdentityRegistry;
  if (!registryDeployment) {
    return;
  }

  const registry = await hre.ethers.getContractAt("IdentityRegistry", registryDeployment.address);
  const owner = await registry.owner();
  if (owner === hre.ethers.ZeroAddress) {
    throw new Error("IdentityRegistry owner is the zero address");
  }

  if (LOCAL_NETWORKS.has(network)) {
    const { deployer } = await hre.getNamedAccounts();
    const isDeployerRegistrar = await registry.registrars(deployer);
    if (!isDeployerRegistrar) {
      throw new Error(`IdentityRegistry deployer is not an authorized registrar: ${deployer}`);
    }
  }
}

async function validateComplianceRulesDeployment(deployments: DeploymentRecords): Promise<void> {
  const rulesDeployment = deployments.ComplianceRules;
  if (!rulesDeployment) {
    return;
  }

  const registryDeployment = requireDeploymentRecord(deployments, "IdentityRegistry");
  const rules = await hre.ethers.getContractAt("ComplianceRules", rulesDeployment.address);

  const registryAddress = await rules.identityRegistry();
  if (registryAddress !== registryDeployment.address) {
    throw new Error(
      `ComplianceRules points at ${registryAddress}, expected ${registryDeployment.address}`,
    );
  }

  const minComplianceLevel = await rules.minComplianceLevel();
  if (minComplianceLevel !== 1n) {
    throw new Error(`ComplianceRules minComplianceLevel is ${minComplianceLevel}, expected 1`);
  }

  const tokenDeployment = deployments.CompliantERC20;
  if (tokenDeployment) {
    const isTokenAuthorized = await rules.authorizedCallers(tokenDeployment.address);
    if (!isTokenAuthorized) {
      throw new Error(
        `CompliantERC20 is not authorized on ComplianceRules: ${tokenDeployment.address}`,
      );
    }
  }
}

async function validateCompliantErc20Deployment(deployments: DeploymentRecords): Promise<void> {
  const tokenDeployment = deployments.CompliantERC20;
  if (!tokenDeployment) {
    return;
  }

  const rulesDeployment = requireDeploymentRecord(deployments, "ComplianceRules");
  const token = await hre.ethers.getContractAt("CompliantERC20", tokenDeployment.address);

  const [tokenName, tokenSymbol, complianceChecker] = await Promise.all([
    token.name(),
    token.symbol(),
    token.complianceChecker(),
  ]);

  if (tokenName !== "Zentity Token") {
    throw new Error(`CompliantERC20 name is "${tokenName}", expected "Zentity Token"`);
  }
  if (tokenSymbol !== "ZTY") {
    throw new Error(`CompliantERC20 symbol is "${tokenSymbol}", expected "ZTY"`);
  }
  if (complianceChecker !== rulesDeployment.address) {
    throw new Error(
      `CompliantERC20 complianceChecker is ${complianceChecker}, expected ${rulesDeployment.address}`,
    );
  }
}

function getExpectedMirrorRegistrar(network: NetworkName, deployer: string): string {
  if (network !== "baseSepolia") {
    return deployer;
  }
  const registrar = process.env.BASE_SEPOLIA_REGISTRAR_ADDRESS;
  if (!registrar) {
    throw new Error("BASE_SEPOLIA_REGISTRAR_ADDRESS is required to validate Base Sepolia");
  }
  return registrar;
}

async function validateMirrorWritePath(
  mirrorAddress: string,
  registrarAddress: string,
): Promise<void> {
  const mirror = await hre.ethers.getContractAt("IdentityRegistryMirror", mirrorAddress);
  const registrar = await hre.ethers.getSigner(registrarAddress);
  const validationUser = (await hre.ethers.getSigners())[8];

  if (await mirror.isAttested(validationUser.address)) {
    await mirror.connect(registrar).revokeAttestation(validationUser.address);
  }

  await mirror.connect(registrar).recordCompliance(validationUser.address, 2);
  const initialMirrorAttestationId = await mirror.currentMirrorAttestationId(
    validationUser.address,
  );

  if (!(await mirror.isAttested(validationUser.address))) {
    throw new Error("IdentityRegistryMirror did not mark the validation user as attested");
  }
  if ((await mirror.currentLevel(validationUser.address)) !== 2n) {
    throw new Error("IdentityRegistryMirror did not store compliance level 2");
  }
  if (!(await mirror.isCompliant(validationUser.address, 2))) {
    throw new Error("IdentityRegistryMirror did not satisfy the level 2 compliance threshold");
  }
  if (await mirror.isCompliant(validationUser.address, 3)) {
    throw new Error(
      "IdentityRegistryMirror incorrectly satisfied the level 3 compliance threshold",
    );
  }

  await mirror.connect(registrar).recordCompliance(validationUser.address, 4);
  const updatedMirrorAttestationId = await mirror.currentMirrorAttestationId(
    validationUser.address,
  );
  if (updatedMirrorAttestationId !== initialMirrorAttestationId) {
    throw new Error("IdentityRegistryMirror changed the attestation ID during a level update");
  }

  await mirror.connect(registrar).revokeAttestation(validationUser.address);
  if (await mirror.isAttested(validationUser.address)) {
    throw new Error("IdentityRegistryMirror did not revoke the validation user");
  }
}

async function validateIdentityRegistryMirrorDeployment(
  deployments: DeploymentRecords,
  network: NetworkName,
): Promise<void> {
  const mirrorDeployment = deployments.IdentityRegistryMirror;
  if (!mirrorDeployment) {
    return;
  }

  const mirror = await hre.ethers.getContractAt("IdentityRegistryMirror", mirrorDeployment.address);
  const { deployer } = await hre.getNamedAccounts();
  const expectedRegistrar = getExpectedMirrorRegistrar(network, deployer);

  const [owner, minComplianceLevel, maxComplianceLevel, isExpectedRegistrar] = await Promise.all([
    mirror.owner(),
    mirror.MIN_COMPLIANCE_LEVEL(),
    mirror.MAX_COMPLIANCE_LEVEL(),
    mirror.registrars(expectedRegistrar),
  ]);

  if (owner === hre.ethers.ZeroAddress) {
    throw new Error("IdentityRegistryMirror owner is the zero address");
  }
  if (minComplianceLevel !== 1n) {
    throw new Error(
      `IdentityRegistryMirror MIN_COMPLIANCE_LEVEL is ${minComplianceLevel}, expected 1`,
    );
  }
  if (maxComplianceLevel !== 4n) {
    throw new Error(
      `IdentityRegistryMirror MAX_COMPLIANCE_LEVEL is ${maxComplianceLevel}, expected 4`,
    );
  }
  if (!isExpectedRegistrar) {
    throw new Error(`IdentityRegistryMirror registrar is not authorized: ${expectedRegistrar}`);
  }

  if (shouldRunWriteChecks) {
    if (!LOCAL_NETWORKS.has(network)) {
      throw new Error("Write validation is only allowed on local Hardhat networks");
    }
    await validateMirrorWritePath(mirrorDeployment.address, expectedRegistrar);
  }
}

async function runDeploymentValidation(): Promise<void> {
  const network = requireNetworkName(hre.network.name);
  const expectedContractNames = getExpectedContractNames(network);

  console.log(`Validating ${network} deployments`);
  const deployments = await readDeploymentRecords(expectedContractNames);

  await validateIdentityRegistryDeployment(deployments, network);
  await validateComplianceRulesDeployment(deployments);
  await validateCompliantErc20Deployment(deployments);
  await validateIdentityRegistryMirrorDeployment(deployments, network);

  console.log(`Deployment validation passed for ${network}`);
}

runDeploymentValidation().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
