// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase
pragma solidity ^0.8.27;

import {euint8, euint16, ebool, externalEuint8, externalEuint16, externalEbool} from "@fhevm/solidity/lib/FHE.sol";

/// @title IIdentityRegistry
/// @author Gustavo Valverde
/// @notice Interface for the on-chain encrypted identity registry with EIP-712 permits,
///         per-attribute selective grants, and x402 compliance oracle surface
interface IIdentityRegistry {
    // ============ Enums ============

    /// @notice Purpose of an attribute access grant (on-chain equivalent of OAuth scopes)
    enum Purpose {
        COMPLIANCE_CHECK,
        AGE_VERIFICATION,
        NATIONALITY_CHECK,
        TRANSFER_GATING,
        AUDIT
    }

    // ============ Events ============

    /// @notice Emitted when an identity is attested via registrar permit
    event IdentityAttested(address indexed user);

    /// @notice Emitted when an identity attestation is revoked
    event IdentityRevoked(address indexed user);

    /// @notice Emitted when a user grants per-attribute access to a grantee
    event AttributeAccessGranted(
        address indexed user,
        address indexed grantee,
        uint8 attributeMask,
        Purpose purpose
    );

    /// @notice Emitted when a registrar is added or removed
    event RegistrarUpdated(address indexed registrar, bool status);

    // ============ Structs ============

    /// @notice Registrar-signed permit data for user-submitted attestation
    struct AttestPermitData {
        uint8 birthYearOffset;
        uint16 countryCode;
        uint8 complianceLevel;
        bool isBlacklisted;
        bytes32 proofSetHash;
        uint32 policyVersion;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @notice User-encrypted identity attributes bound to this registry and caller
    struct EncryptedIdentityAttributes {
        externalEuint8 birthYearOffset;
        externalEuint16 countryCode;
        externalEuint8 complianceLevel;
        externalEbool isBlacklisted;
        bytes inputProof;
    }

    // ============ Errors ============

    /// @notice Thrown when caller is not an authorized registrar
    error OnlyRegistrar();

    /// @notice Thrown when querying a user without attestation
    error NotAttested();

    /// @notice Thrown when the EIP-712 permit or consent signature is invalid
    error InvalidPermit();

    /// @notice Thrown when a non-authorized contract calls a compliance predicate
    error UnauthorizedPolicy();

    /// @notice Thrown when the permit deadline has passed
    error PermitExpired();

    /// @notice Thrown when an address argument is the zero address
    error ZeroAddress();

    /// @notice Thrown when caller lacks FHE permission for encrypted data
    error AccessProhibited();

    // ============ Attestation with Permit ============

    /// @notice Attest identity with registrar permit and optional user consent
    /// @dev v3: allows re-attestation (increments revision). Consent signature is
    ///      optional (set consentV=0 to skip). When provided, the contract verifies
    ///      the user signed a consent covering attributeMask, chainId, and the
    ///      target attestation revision (current revision for first attestation,
    ///      current revision + 1 for re-attestation).
    function attestWithPermit(
        AttestPermitData calldata permit,
        uint8 consentV,
        bytes32 consentR,
        bytes32 consentS,
        uint8 consentAttributeMask,
        uint256 consentDeadline,
        EncryptedIdentityAttributes calldata encryptedAttributes
    ) external;

    // ============ Revocation ============

    /// @notice Revoke caller's own attestation (user self-revocation)
    function revokeIdentity() external;

    /// @notice Revoke a user's attestation (registrar-only)
    /// @param user Address of the user to revoke
    function revokeIdentityFor(address user) external;

    // ============ Per-Attribute Access Grants ============

    /// @notice Grant FHE access to specific attributes for a stated purpose
    /// @param grantee Address receiving access permission
    /// @param attributeMask Bitmask: 0x01=birthYear, 0x02=country, 0x04=compliance, 0x08=blacklist
    /// @param purpose Why access is needed (on-chain audit trail)
    function grantAttributeAccess(address grantee, uint8 attributeMask, Purpose purpose) external;

    /// @notice Grant FHE access to all attributes (convenience wrapper)
    /// @param grantee Address receiving access permission
    function grantAccessTo(address grantee) external;

    // ============ Compliance Checks (x402 Oracle Surface) ============

    /// @notice Combined compliance check: level >= minLevel AND not blacklisted
    /// @dev State-mutating (FHE comparisons). Stores and returns encrypted result.
    ///      x402 facilitators compose this inline:
    ///      `euint64 amt = FHE.select(registry.checkCompliance(payer, 2), amount, zero);`
    /// @param user Address to check
    /// @param minLevel Minimum compliance level required
    /// @return Encrypted boolean: true if compliant
    function checkCompliance(address user, uint8 minLevel) external returns (ebool);

    /// @notice Check if user meets minimum compliance level
    /// @param user Address to check
    /// @param minLevel Minimum level required
    /// @return Encrypted boolean result
    function hasMinComplianceLevel(address user, uint8 minLevel) external returns (ebool);

    /// @notice Check if user is from a specific country
    /// @param user Address to check
    /// @param country ISO 3166-1 numeric country code
    /// @return Encrypted boolean result
    function isFromCountry(address user, uint16 country) external returns (ebool);

    /// @notice Check if user is not blacklisted
    /// @param user Address to check
    /// @return Encrypted boolean (true if NOT blacklisted)
    function isNotBlacklisted(address user) external returns (ebool);

    // ============ View Getters ============

    /// @notice Check if a user has a valid attestation
    function isAttested(address user) external view returns (bool);

    /// @notice Get user's encrypted birth year offset (caller must have FHE ACL access)
    function getBirthYearOffset(address user) external view returns (euint8);

    /// @notice Get user's encrypted country code (caller must have FHE ACL access)
    function getCountryCode(address user) external view returns (euint16);

    /// @notice Get user's encrypted compliance level (caller must have FHE ACL access)
    function getComplianceLevel(address user) external view returns (euint8);

    /// @notice Get user's encrypted blacklist status (caller must have FHE ACL access)
    function getBlacklistStatus(address user) external view returns (ebool);

    /// @notice Get the proof set hash for a user's attestation
    function getProofSetHash(address user) external view returns (bytes32);

    /// @notice Get the policy version for a user's attestation
    function getPolicyVersion(address user) external view returns (uint32);

    /// @notice Get the attribute mask granted to a grantee by a user
    function getGrantedAttributes(address user, address grantee) external view returns (uint8);

    /// @notice Get the current attestation ID for a user (0 if not attested)
    function currentAttestationId(address user) external view returns (uint256);

    /// @notice Get the timestamp when a user was attested
    function attestationTimestamp(address user) external view returns (uint256);

    /// @notice Get the EIP-712 nonce for a user (for permit construction)
    function nonces(address user) external view returns (uint256);

    /// @notice Check if an address is an authorized registrar
    function registrars(address registrar) external view returns (bool);

    /// @notice Get the current attestation revision for a user
    function revisions(address user) external view returns (uint256);

    /// @notice Check if a contract is authorized to call compliance predicates
    function authorizedPolicies(address policy) external view returns (bool);

    /// @notice Get a previously stored verification result
    /// @param key The result key (keccak256 of check parameters + revision)
    function getVerificationResult(bytes32 key) external view returns (ebool);

    // ============ Constants ============

    function ATTR_BIRTH_YEAR() external pure returns (uint8);
    function ATTR_COUNTRY() external pure returns (uint8);
    function ATTR_COMPLIANCE() external pure returns (uint8);
    function ATTR_BLACKLIST() external pure returns (uint8);
    function ATTR_ALL() external pure returns (uint8);
}
