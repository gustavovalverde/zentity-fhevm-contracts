// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {IIdentityRegistryMirror} from "../interfaces/IIdentityRegistryMirror.sol";

/// @title IdentityRegistryMirror
/// @notice Plaintext compliance mirror for Base x402 and resource-server reads.
/// @dev The encrypted fhEVM registry remains the private source of truth. This
///      mirror stores only the externally intentional compliance level.
contract IdentityRegistryMirror is
    IIdentityRegistryMirror,
    Initializable,
    UUPSUpgradeable,
    Ownable2StepUpgradeable
{
    uint8 public constant MIN_COMPLIANCE_LEVEL = 1;
    uint8 public constant MAX_COMPLIANCE_LEVEL = 4;

    mapping(address user => uint256 id) public currentMirrorAttestationId;
    mapping(address user => uint8 level) public currentLevel;
    mapping(address registrar => bool authorized) public registrars;

    uint256 public latestMirrorAttestationId;

    uint256[46] private __gap;

    modifier onlyRegistrar() {
        if (!registrars[msg.sender]) revert OnlyRegistrar();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the mirror through an ERC1967 proxy.
    /// @param initialOwner Address that owns upgrades and registrar management.
    /// @param initialRegistrar Address allowed to write mirrored compliance.
    function initialize(address initialOwner, address initialRegistrar) external initializer {
        if (initialOwner == address(0) || initialRegistrar == address(0)) revert ZeroAddress();

        __UUPSUpgradeable_init();
        __Ownable2Step_init();
        __Ownable_init(initialOwner);

        registrars[initialRegistrar] = true;
        emit RegistrarUpdated(initialRegistrar, true);
    }

    /// @inheritdoc IIdentityRegistryMirror
    function recordCompliance(address user, uint8 level) external onlyRegistrar {
        if (user == address(0)) revert ZeroAddress();
        if (level < MIN_COMPLIANCE_LEVEL || level > MAX_COMPLIANCE_LEVEL) {
            revert InvalidComplianceLevel(level);
        }

        uint256 mirrorAttestationId = currentMirrorAttestationId[user];
        uint8 previousLevel = currentLevel[user];

        if (mirrorAttestationId == 0) {
            uint256 nextId = latestMirrorAttestationId + 1;
            latestMirrorAttestationId = nextId;
            currentMirrorAttestationId[user] = nextId;
            emit IdentityAttested(user);
        }

        if (previousLevel != level) {
            currentLevel[user] = level;
            emit LevelUpdated(user, previousLevel, level);
        }
    }

    /// @inheritdoc IIdentityRegistryMirror
    function revokeAttestation(address user) external onlyRegistrar {
        if (user == address(0)) revert ZeroAddress();

        uint256 mirrorAttestationId = currentMirrorAttestationId[user];
        if (mirrorAttestationId == 0) {
            return;
        }

        uint8 previousLevel = currentLevel[user];
        delete currentMirrorAttestationId[user];
        delete currentLevel[user];

        emit IdentityRevoked(user);
        // Keep lifecycle and level-only indexers independently consistent.
        if (previousLevel != 0) {
            emit LevelUpdated(user, previousLevel, 0);
        }
    }

    /// @inheritdoc IIdentityRegistryMirror
    function isCompliant(address user, uint8 minLevel) external view returns (bool) {
        if (currentMirrorAttestationId[user] == 0) {
            return false;
        }
        return currentLevel[user] >= minLevel;
    }

    /// @inheritdoc IIdentityRegistryMirror
    function setRegistrar(address registrar, bool status) external onlyOwner {
        if (registrar == address(0)) revert ZeroAddress();
        registrars[registrar] = status;
        emit RegistrarUpdated(registrar, status);
    }

    /// @inheritdoc IIdentityRegistryMirror
    function isAttested(address user) external view returns (bool) {
        return currentMirrorAttestationId[user] != 0;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
