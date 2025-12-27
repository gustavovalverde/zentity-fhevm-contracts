// SPDX-License-Identifier: MIT
// solhint-disable not-rely-on-time
pragma solidity ^0.8.27;

import {FHE, euint8, euint16, ebool, externalEuint8, externalEuint16, externalEbool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/**
 * @title IdentityRegistry
 * @author Gustavo Valverde
 * @notice On-chain encrypted identity registry for compliance platforms
 * @dev Part of zentity-fhevm-contracts - Builder Track
 *
 * @custom:category identity
 * @custom:concept Storing encrypted identity attributes (euint8, euint16, ebool)
 * @custom:difficulty intermediate
 *
 * This contract maintains an encrypted identity registry where authorized registrars
 * (typically a backend service) can attest to user identity attributes. All sensitive data
 * remains encrypted on-chain.
 *
 * Key patterns demonstrated:
 * 1. Multiple encrypted types (euint8, euint16, ebool)
 * 2. Role-based access control (registrars)
 * 3. Struct-like data storage with mappings
 * 4. FHE permission management (allowThis, allow)
 */
contract IdentityRegistry is IIdentityRegistry, ZamaEthereumConfig {
    // ============ Encrypted Identity Attributes ============

    /// @notice Encrypted birth year offset from 1900
    mapping(address user => euint8 birthYearOffset) private birthYearOffsets;

    /// @notice Encrypted country code (ISO 3166-1 numeric)
    mapping(address user => euint16 countryCode) private countryCodes;

    /// @notice Encrypted compliance verification level (0-5)
    mapping(address user => euint8 complianceLevel) private complianceLevels;

    /// @notice Encrypted blacklist status
    mapping(address user => ebool blacklisted) private isBlacklisted;

    /// @notice Timestamp of last attestation
    mapping(address user => uint256 timestamp) public attestationTimestamp;

    /// @notice Current attestation id for a user (0 if not attested)
    mapping(address user => uint256 attestationId) public currentAttestationId;

    /// @notice Latest attestation id ever issued for a user
    mapping(address user => uint256 attestationId) public latestAttestationId;

    /// @notice Attestation metadata for auditability
    struct AttestationMetadata {
        uint256 timestamp;
        uint256 revokedAt;
        address registrar;
    }

    /// @notice Attestation history by user and attestation id
    mapping(address user => mapping(uint256 attestationId => AttestationMetadata)) private attestationHistory;

    /// @notice Store verification results for external queries
    mapping(bytes32 key => ebool result) private verificationResults;

    // ============ Access Control ============

    /// @notice Owner of the registry
    address public owner;
    /// @notice Pending owner for two-step ownership transfer
    address public pendingOwner;

    /// @notice Authorized registrars who can attest identities
    mapping(address registrar => bool authorized) public registrars;

    /// @notice Thrown when caller lacks permission for encrypted data
    error AccessProhibited();

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyRegistrar() {
        if (!registrars[msg.sender]) revert OnlyRegistrar();
        _;
    }

    // ============ Constructor ============

    /// @notice Initializes the registry with the deployer as owner and initial registrar
    constructor() {
        owner = msg.sender;
        registrars[msg.sender] = true;
        emit RegistrarAdded(msg.sender);
    }

    // ============ Registrar Management ============

    /// @inheritdoc IIdentityRegistry
    function addRegistrar(address registrar) external onlyOwner {
        registrars[registrar] = true;
        emit RegistrarAdded(registrar);
    }

    /// @inheritdoc IIdentityRegistry
    function removeRegistrar(address registrar) external onlyOwner {
        registrars[registrar] = false;
        emit RegistrarRemoved(registrar);
    }

    // ============ Identity Attestation ============

    /// @inheritdoc IIdentityRegistry
    function attestIdentity(
        address user,
        externalEuint8 encBirthYearOffset,
        externalEuint16 encCountryCode,
        externalEuint8 encComplianceLevel,
        externalEbool encIsBlacklisted,
        bytes calldata inputProof
    ) external onlyRegistrar {
        if (currentAttestationId[user] != 0) revert AlreadyAttested();

        // Convert and store encrypted values
        euint8 birthYear = FHE.fromExternal(encBirthYearOffset, inputProof);
        euint16 country = FHE.fromExternal(encCountryCode, inputProof);
        euint8 compliance = FHE.fromExternal(encComplianceLevel, inputProof);
        ebool blacklisted = FHE.fromExternal(encIsBlacklisted, inputProof);

        birthYearOffsets[user] = birthYear;
        countryCodes[user] = country;
        complianceLevels[user] = compliance;
        isBlacklisted[user] = blacklisted;

        // Grant contract permission to all values
        FHE.allowThis(birthYear);
        FHE.allowThis(country);
        FHE.allowThis(compliance);
        FHE.allowThis(blacklisted);

        // Grant user permission to their own data
        FHE.allow(birthYear, user);
        FHE.allow(country, user);
        FHE.allow(compliance, user);
        FHE.allow(blacklisted, user);

        uint256 newAttestationId = latestAttestationId[user] + 1;
        latestAttestationId[user] = newAttestationId;
        currentAttestationId[user] = newAttestationId;
        attestationHistory[user][newAttestationId] = AttestationMetadata({
            timestamp: block.timestamp,
            revokedAt: 0,
            registrar: msg.sender
        });
        attestationTimestamp[user] = block.timestamp;

        emit IdentityAttested(user, msg.sender);
        emit IdentityAttestedDetailed(user, msg.sender, newAttestationId, block.timestamp);
    }

    /// @inheritdoc IIdentityRegistry
    function revokeIdentity(address user) external onlyRegistrar {
        uint256 attestationId = currentAttestationId[user];
        if (attestationId == 0) revert NotAttested();

        // Set encrypted values to encrypted zeros
        birthYearOffsets[user] = FHE.asEuint8(0);
        countryCodes[user] = FHE.asEuint16(0);
        complianceLevels[user] = FHE.asEuint8(0);
        isBlacklisted[user] = FHE.asEbool(false);
        attestationTimestamp[user] = 0;
        currentAttestationId[user] = 0;

        AttestationMetadata storage metadata = attestationHistory[user][attestationId];
        if (metadata.revokedAt == 0) {
            metadata.revokedAt = block.timestamp;
        }

        emit IdentityRevoked(user);
        emit IdentityRevokedDetailed(user, msg.sender, attestationId, block.timestamp);
    }

    // ============ Encrypted Queries ============

    /// @inheritdoc IIdentityRegistry
    function getBirthYearOffset(address user) external view returns (euint8) {
        if (attestationTimestamp[user] == 0) revert NotAttested();
        if (!FHE.isSenderAllowed(birthYearOffsets[user])) revert AccessProhibited();
        return birthYearOffsets[user];
    }

    /// @inheritdoc IIdentityRegistry
    function getCountryCode(address user) external view returns (euint16) {
        if (attestationTimestamp[user] == 0) revert NotAttested();
        if (!FHE.isSenderAllowed(countryCodes[user])) revert AccessProhibited();
        return countryCodes[user];
    }

    /// @inheritdoc IIdentityRegistry
    function getComplianceLevel(address user) external view returns (euint8) {
        if (attestationTimestamp[user] == 0) revert NotAttested();
        if (!FHE.isSenderAllowed(complianceLevels[user])) revert AccessProhibited();
        return complianceLevels[user];
    }

    /// @inheritdoc IIdentityRegistry
    function getBlacklistStatus(address user) external view returns (ebool) {
        if (attestationTimestamp[user] == 0) revert NotAttested();
        if (!FHE.isSenderAllowed(isBlacklisted[user])) revert AccessProhibited();
        return isBlacklisted[user];
    }

    // ============ Verification Helpers ============

    /// @inheritdoc IIdentityRegistry
    function hasMinComplianceLevel(address user, uint8 minLevel) external returns (ebool) {
        if (attestationTimestamp[user] == 0) revert NotAttested();
        if (!FHE.isSenderAllowed(complianceLevels[user])) revert AccessProhibited();
        ebool result = FHE.ge(complianceLevels[user], FHE.asEuint8(minLevel));

        // Store result for later retrieval
        bytes32 key = keccak256(abi.encodePacked(user, uint8(0), uint256(minLevel)));
        verificationResults[key] = result;

        // Grant caller permission to decrypt the result
        FHE.allowThis(result);
        FHE.allow(result, msg.sender);

        return result;
    }

    /// @inheritdoc IIdentityRegistry
    function isFromCountry(address user, uint16 country) external returns (ebool) {
        if (attestationTimestamp[user] == 0) revert NotAttested();
        if (!FHE.isSenderAllowed(countryCodes[user])) revert AccessProhibited();
        ebool result = FHE.eq(countryCodes[user], FHE.asEuint16(country));

        // Store result for later retrieval
        bytes32 key = keccak256(abi.encodePacked(user, uint8(1), uint256(country)));
        verificationResults[key] = result;

        // Grant caller permission to decrypt the result
        FHE.allowThis(result);
        FHE.allow(result, msg.sender);

        return result;
    }

    /// @inheritdoc IIdentityRegistry
    function isNotBlacklisted(address user) external returns (ebool) {
        if (attestationTimestamp[user] == 0) revert NotAttested();
        if (!FHE.isSenderAllowed(isBlacklisted[user])) revert AccessProhibited();
        ebool result = FHE.not(isBlacklisted[user]);

        // Store result for later retrieval
        bytes32 key = keccak256(abi.encodePacked(user, uint8(2), uint256(0)));
        verificationResults[key] = result;

        // Grant caller permission to decrypt the result
        FHE.allowThis(result);
        FHE.allow(result, msg.sender);

        return result;
    }

    // ============ Result Getters ============

    /**
     * @notice Get the last compliance level verification result
     * @param user Address that was checked
     * @param minLevel Level that was checked
     * @return Encrypted boolean result
     */
    function getComplianceLevelResult(address user, uint8 minLevel) external view returns (ebool) {
        bytes32 key = keccak256(abi.encodePacked(user, uint8(0), uint256(minLevel)));
        ebool result = verificationResults[key];
        if (!FHE.isSenderAllowed(result)) revert AccessProhibited();
        return result;
    }

    /**
     * @notice Get the last country verification result
     * @param user Address that was checked
     * @param country Country code that was checked
     * @return Encrypted boolean result
     */
    function getCountryResult(address user, uint16 country) external view returns (ebool) {
        bytes32 key = keccak256(abi.encodePacked(user, uint8(1), uint256(country)));
        ebool result = verificationResults[key];
        if (!FHE.isSenderAllowed(result)) revert AccessProhibited();
        return result;
    }

    /**
     * @notice Get the last blacklist verification result
     * @param user Address that was checked
     * @return Encrypted boolean result
     */
    function getBlacklistResult(address user) external view returns (ebool) {
        bytes32 key = keccak256(abi.encodePacked(user, uint8(2), uint256(0)));
        ebool result = verificationResults[key];
        if (!FHE.isSenderAllowed(result)) revert AccessProhibited();
        return result;
    }

    // ============ Access Control ============

    /// @inheritdoc IIdentityRegistry
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @inheritdoc IIdentityRegistry
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert OnlyPendingOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    /// @inheritdoc IIdentityRegistry
    function grantAccessTo(address grantee) external {
        if (attestationTimestamp[msg.sender] == 0) revert NotAttested();

        FHE.allow(birthYearOffsets[msg.sender], grantee);
        FHE.allow(countryCodes[msg.sender], grantee);
        FHE.allow(complianceLevels[msg.sender], grantee);
        FHE.allow(isBlacklisted[msg.sender], grantee);

        emit AccessGranted(msg.sender, grantee);
    }

    /// @inheritdoc IIdentityRegistry
    function isAttested(address user) external view returns (bool) {
        return currentAttestationId[user] > 0;
    }

    /// @inheritdoc IIdentityRegistry
    function getAttestationMetadata(
        address user,
        uint256 attestationId
    ) external view returns (uint256 timestamp, uint256 revokedAt, address registrar) {
        AttestationMetadata storage metadata = attestationHistory[user][attestationId];
        return (metadata.timestamp, metadata.revokedAt, metadata.registrar);
    }
}
