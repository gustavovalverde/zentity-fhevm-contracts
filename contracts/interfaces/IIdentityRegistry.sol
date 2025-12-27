// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {euint8, euint16, ebool, externalEuint8, externalEuint16, externalEbool} from "@fhevm/solidity/lib/FHE.sol";

/**
 * @title IIdentityRegistry
 * @author Gustavo Valverde
 * @notice Interface for the IdentityRegistry contract
 * @dev Part of zentity-fhevm-contracts - Builder Track
 *
 * @custom:category identity
 * @custom:concept Interface for encrypted identity storage and verification
 * @custom:difficulty intermediate
 */
interface IIdentityRegistry {
    // ============ Events ============

    /// @notice Emitted when a new registrar is authorized
    /// @param registrar Address of the authorized registrar
    event RegistrarAdded(address indexed registrar);

    /// @notice Emitted when a registrar's authorization is revoked
    /// @param registrar Address of the removed registrar
    event RegistrarRemoved(address indexed registrar);

    /// @notice Emitted when an identity is attested on-chain
    /// @param user Address of the attested user
    /// @param registrar Address of the registrar who performed attestation
    event IdentityAttested(address indexed user, address indexed registrar);

    /// @notice Emitted when an identity is attested on-chain with metadata
    /// @param user Address of the attested user
    /// @param registrar Address of the registrar who performed attestation
    /// @param attestationId Monotonic attestation identifier for the user
    /// @param timestamp Unix timestamp of attestation
    event IdentityAttestedDetailed(
        address indexed user,
        address indexed registrar,
        uint256 indexed attestationId,
        uint256 timestamp
    );

    /// @notice Emitted when an identity attestation is revoked
    /// @param user Address whose attestation was revoked
    event IdentityRevoked(address indexed user);

    /// @notice Emitted when an identity attestation is revoked with metadata
    /// @param user Address whose attestation was revoked
    /// @param registrar Address of the registrar who performed the revocation
    /// @param attestationId Attestation identifier that was revoked
    /// @param timestamp Unix timestamp of revocation
    event IdentityRevokedDetailed(
        address indexed user,
        address indexed registrar,
        uint256 indexed attestationId,
        uint256 timestamp
    );

    /// @notice Emitted when a user grants access to their encrypted data
    /// @param user Address of the user granting access
    /// @param grantee Address receiving access permission
    event AccessGranted(address indexed user, address indexed grantee);

    /// @notice Emitted when ownership transfer is initiated
    /// @param currentOwner Current owner address
    /// @param pendingOwner Address that can accept ownership
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);

    /// @notice Emitted when ownership transfer is completed
    /// @param previousOwner Previous owner address
    /// @param newOwner New owner address
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ============ Errors ============

    /// @notice Thrown when caller is not the contract owner
    error OnlyOwner();

    /// @notice Thrown when caller is not the pending owner
    error OnlyPendingOwner();

    /// @notice Thrown when new owner is the zero address
    error InvalidOwner();

    /// @notice Thrown when caller is not an authorized registrar
    error OnlyRegistrar();

    /// @notice Thrown when querying a user without attestation
    error NotAttested();

    /// @notice Thrown when attempting to attest an already-attested user
    error AlreadyAttested();

    // ============ Registrar Management ============

    /// @notice Add a new authorized registrar
    /// @param registrar Address to authorize as registrar
    function addRegistrar(address registrar) external;

    /// @notice Remove an authorized registrar
    /// @param registrar Address to remove from registrars
    function removeRegistrar(address registrar) external;

    // ============ Identity Attestation ============

    /// @notice Attest a user's encrypted identity data on-chain
    /// @param user Address of the user being attested
    /// @param encBirthYearOffset Encrypted birth year offset (years since 1900)
    /// @param encCountryCode Encrypted ISO 3166-1 numeric country code
    /// @param encComplianceLevel Encrypted compliance verification level (0-3)
    /// @param encIsBlacklisted Encrypted blacklist status
    /// @param inputProof FHE proof for encrypted inputs
    function attestIdentity(
        address user,
        externalEuint8 encBirthYearOffset,
        externalEuint16 encCountryCode,
        externalEuint8 encComplianceLevel,
        externalEbool encIsBlacklisted,
        bytes calldata inputProof
    ) external;

    /// @notice Revoke a user's identity attestation
    /// @param user Address of the user to revoke
    function revokeIdentity(address user) external;

    // ============ Encrypted Queries ============

    /// @notice Get user's encrypted birth year offset
    /// @param user Address of the user
    /// @return Encrypted birth year offset (years since 1900)
    function getBirthYearOffset(address user) external view returns (euint8);

    /// @notice Get user's encrypted country code
    /// @param user Address of the user
    /// @return Encrypted ISO 3166-1 numeric country code
    function getCountryCode(address user) external view returns (euint16);

    /// @notice Get user's encrypted compliance level
    /// @param user Address of the user
    /// @return Encrypted compliance (KYC) verification level (0-3)
    function getComplianceLevel(address user) external view returns (euint8);

    /// @notice Get user's encrypted blacklist status
    /// @param user Address of the user
    /// @return Encrypted blacklist status (true if blacklisted)
    function getBlacklistStatus(address user) external view returns (ebool);

    // ============ Verification Helpers ============

    /// @notice Check if user has minimum compliance level (encrypted comparison)
    /// @param user Address of the user
    /// @param minLevel Minimum compliance level required
    /// @return Encrypted boolean result of comparison
    function hasMinComplianceLevel(address user, uint8 minLevel) external returns (ebool);

    /// @notice Check if user is from a specific country (encrypted comparison)
    /// @param user Address of the user
    /// @param country ISO 3166-1 numeric country code to check
    /// @return Encrypted boolean result of comparison
    function isFromCountry(address user, uint16 country) external returns (ebool);

    /// @notice Check if user is not blacklisted (encrypted)
    /// @param user Address of the user
    /// @return Encrypted boolean (true if NOT blacklisted)
    function isNotBlacklisted(address user) external returns (ebool);

    // ============ Access Control ============

    /// @notice Grant a contract access to caller's encrypted identity data
    /// @param grantee Address to grant access to
    function grantAccessTo(address grantee) external;

    /// @notice Check if a user has been attested
    /// @param user Address of the user
    /// @return True if user has valid attestation
    function isAttested(address user) external view returns (bool);

    // ============ Public State ============

    /// @notice Get the contract owner address
    /// @return Owner address
    function owner() external view returns (address);

    /// @notice Get the pending owner address
    /// @return Pending owner address
    function pendingOwner() external view returns (address);

    /// @notice Initiate transfer of contract ownership
    /// @param newOwner Address that can accept ownership
    function transferOwnership(address newOwner) external;

    /// @notice Accept ownership transfer
    function acceptOwnership() external;

    /// @notice Check if an address is an authorized registrar
    /// @param registrar Address to check
    /// @return True if address is authorized registrar
    function registrars(address registrar) external view returns (bool);

    /// @notice Get the timestamp when a user was attested
    /// @param user Address of the user
    /// @return Unix timestamp of attestation (0 if not attested)
    function attestationTimestamp(address user) external view returns (uint256);

    /// @notice Get the current attestation id for a user (0 if not attested)
    /// @param user Address of the user
    /// @return Current attestation id
    function currentAttestationId(address user) external view returns (uint256);

    /// @notice Get the latest attestation id ever issued for a user
    /// @param user Address of the user
    /// @return Latest attestation id
    function latestAttestationId(address user) external view returns (uint256);

    /// @notice Get attestation metadata for a user and attestation id
    /// @param user Address of the user
    /// @param attestationId Attestation identifier to query
    /// @return timestamp Unix timestamp of attestation
    /// @return revokedAt Unix timestamp of revocation (0 if not revoked)
    /// @return registrar Registrar who performed the attestation
    function getAttestationMetadata(
        address user,
        uint256 attestationId
    ) external view returns (uint256 timestamp, uint256 revokedAt, address registrar);
}
