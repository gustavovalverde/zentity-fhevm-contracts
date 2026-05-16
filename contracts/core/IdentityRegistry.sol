// SPDX-License-Identifier: MIT
// solhint-disable not-rely-on-time
pragma solidity ^0.8.27;

import {FHE, euint8, euint16, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/// @title IdentityRegistry
/// @author Gustavo Valverde
/// @notice On-chain encrypted identity registry with revision-scoped grants,
///         consent receipts, policy-authorized predicates, and x402 oracle surface.
/// @dev UUPS-upgradeable.
contract IdentityRegistry is
    IIdentityRegistry,
    Initializable,
    UUPSUpgradeable,
    Ownable2StepUpgradeable,
    EIP712Upgradeable
{
    // ============ Constants ============

    uint8 public constant ATTR_BIRTH_YEAR = 0x01;
    uint8 public constant ATTR_COUNTRY = 0x02;
    uint8 public constant ATTR_COMPLIANCE = 0x04;
    uint8 public constant ATTR_BLACKLIST = 0x08;
    uint8 public constant ATTR_ALL = 0x0F;

    /// @dev EIP-712 typehash for the attestation permit
    bytes32 public constant ATTEST_PERMIT_TYPEHASH = keccak256(
        "AttestPermit(address user,uint8 birthYearOffset,uint16 countryCode,uint8 complianceLevel,bool isBlacklisted,bytes32 proofSetHash,uint32 policyVersion,uint256 nonce,uint256 deadline)"
    );

    /// @dev EIP-712 typehash for user consent receipt
    bytes32 public constant CONSENT_TYPEHASH = keccak256(
        "UserConsent(address user,uint8 attributeMask,uint256 chainId,uint256 revision,uint256 deadline)"
    );

    // ============ Encrypted Identity Attributes ============

    mapping(address user => euint8 offset) private birthYearOffsets;
    mapping(address user => euint16 code) private countryCodes;
    mapping(address user => euint8 level) private complianceLevels;
    mapping(address user => ebool status) private blacklistStatuses;

    // ============ Attestation Metadata ============

    mapping(address user => uint256 id) public currentAttestationId;
    mapping(address user => uint256 ts) public attestationTimestamp;
    mapping(address user => bytes32 hash) public proofSetHashes;
    mapping(address user => uint32 version) public policyVersions;
    uint256 public latestAttestationId;

    // ============ Access Control ============

    mapping(address registrar => bool authorized) public registrars;
    mapping(address user => uint256 nonce) public nonces;

    // ============ Per-Attribute Grants ============

    /// @dev keccak256(user, grantee, revision) — grants scoped to attestation revision
    mapping(bytes32 grantKey => uint8 mask) private attributeGrants;

    // ============ Verification Results ============

    mapping(bytes32 key => ebool result) private verificationResults;

    // ============ Revision & Policy ============

    /// @dev Per-user revision counter. Increments on every revocation.
    ///      Grants and cache keys are scoped by revision.
    mapping(address user => uint256 rev) public revisions;

    /// @dev Authorized policy contracts that may call compliance predicates.
    mapping(address policy => bool authorized) public authorizedPolicies;

    // ============ Upgrade Safety ============

    /// @dev Reserved storage gap for future upgrades
    uint256[48] private __gap;

    // ============ Events ============

    /// @notice Emitted when a policy contract is authorized or deauthorized
    event PolicyUpdated(address indexed policy, bool status);

    // ============ Modifiers ============

    modifier onlyRegistrar() {
        if (!registrars[msg.sender]) revert OnlyRegistrar();
        _;
    }

    modifier whenAttested(address user) {
        if (currentAttestationId[user] == 0) revert NotAttested();
        _;
    }

    modifier onlyAuthorizedPolicy() {
        if (!authorizedPolicies[msg.sender]) revert UnauthorizedPolicy();
        _;
    }

    // ============ Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the registry (called once via proxy)
    /// @param initialOwner Address that becomes owner and first registrar
    function initialize(address initialOwner) external initializer {
        if (initialOwner == address(0)) revert ZeroAddress();

        __UUPSUpgradeable_init();
        __Ownable2Step_init();
        __Ownable_init(initialOwner);
        __EIP712_init("ZentityIdentityRegistry", "2");

        // Set up FHEVM coprocessor (replaces ZamaEthereumConfig constructor)
        FHE.setCoprocessor(ZamaConfig.getEthereumCoprocessorConfig());

        registrars[initialOwner] = true;
        emit RegistrarUpdated(initialOwner, true);
    }

    // ============ Attestation with EIP-712 Permit + Consent ============

    /// @notice Attest identity with registrar permit and user consent
    ///      If already attested, increments revision and overwrites (re-attestation).
    /// @param permit Registrar-signed permit with plaintext values
    /// @param consentV User consent EIP-712 signature v component (0 to skip)
    /// @param consentR User consent EIP-712 signature r component
    /// @param consentS User consent EIP-712 signature s component
    /// @param consentAttributeMask Attribute bitmask the user consented to disclose
    /// @param consentDeadline Consent expiry timestamp
    /// @dev Consent is verified against the target attestation revision:
    ///      the current revision for first attestation, or current revision + 1 for re-attestation.
    function attestWithPermit(
        AttestPermitData calldata permit,
        uint8 consentV,
        bytes32 consentR,
        bytes32 consentS,
        uint8 consentAttributeMask,
        uint256 consentDeadline,
        EncryptedIdentityAttributes calldata encryptedAttributes
    ) external {
        if (block.timestamp > permit.deadline) revert PermitExpired();

        uint256 targetRevision = _getTargetRevision(msg.sender);

        // Verify registrar signature over plaintext values
        _verifyPermit(permit);

        // Verify user consent if provided (v != 0 signals consent is present)
        if (consentV != 0) {
            _verifyConsent(consentV, consentR, consentS, consentAttributeMask, consentDeadline, targetRevision);
        }

        revisions[msg.sender] = targetRevision;

        // Convert and store FHE-encrypted values
        _storeEncryptedValues(encryptedAttributes);

        // Store attestation metadata
        latestAttestationId++;
        currentAttestationId[msg.sender] = latestAttestationId;
        attestationTimestamp[msg.sender] = block.timestamp;
        proofSetHashes[msg.sender] = permit.proofSetHash;
        policyVersions[msg.sender] = permit.policyVersion;

        emit IdentityAttested(msg.sender);
    }

    /// @dev Returns the revision that a new attestation will occupy.
    function _getTargetRevision(address user) internal view returns (uint256) {
        uint256 currentRevision = revisions[user];
        if (currentAttestationId[user] != 0) {
            return currentRevision + 1;
        }
        return currentRevision;
    }

    /// @dev Verify the registrar's EIP-712 signature and increment nonce
    function _verifyPermit(AttestPermitData calldata permit) internal {
        uint256 currentNonce = nonces[msg.sender];
        bytes32 structHash = keccak256(
            abi.encode(
                ATTEST_PERMIT_TYPEHASH,
                msg.sender,
                permit.birthYearOffset,
                permit.countryCode,
                permit.complianceLevel,
                permit.isBlacklisted,
                permit.proofSetHash,
                permit.policyVersion,
                currentNonce,
                permit.deadline
            )
        );

        address signer = ECDSA.recover(_hashTypedDataV4(structHash), permit.v, permit.r, permit.s);
        if (!registrars[signer]) revert InvalidPermit();

        nonces[msg.sender] = currentNonce + 1;
    }

    /// @dev Verify the user's EIP-712 consent signature
    function _verifyConsent(
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint8 attributeMask,
        uint256 deadline,
        uint256 revision
    ) internal view {
        if (block.timestamp > deadline) revert PermitExpired();

        bytes32 structHash = keccak256(
            abi.encode(
                CONSENT_TYPEHASH,
                msg.sender,
                attributeMask,
                block.chainid,
                revision,
                deadline
            )
        );

        address signer = ECDSA.recover(_hashTypedDataV4(structHash), v, r, s);
        if (signer != msg.sender) revert InvalidPermit();
    }

    /// @dev Convert external encrypted inputs, store, and grant ACL permissions
    function _storeEncryptedValues(EncryptedIdentityAttributes calldata encryptedAttributes) internal {
        euint8 encByo = FHE.fromExternal(
            encryptedAttributes.birthYearOffset,
            encryptedAttributes.inputProof
        );
        euint16 encCc = FHE.fromExternal(encryptedAttributes.countryCode, encryptedAttributes.inputProof);
        euint8 encCl = FHE.fromExternal(
            encryptedAttributes.complianceLevel,
            encryptedAttributes.inputProof
        );
        ebool encBl = FHE.fromExternal(encryptedAttributes.isBlacklisted, encryptedAttributes.inputProof);

        birthYearOffsets[msg.sender] = encByo;
        countryCodes[msg.sender] = encCc;
        complianceLevels[msg.sender] = encCl;
        blacklistStatuses[msg.sender] = encBl;

        FHE.allowThis(encByo);
        FHE.allowThis(encCc);
        FHE.allowThis(encCl);
        FHE.allowThis(encBl);
        FHE.allow(encByo, msg.sender);
        FHE.allow(encCc, msg.sender);
        FHE.allow(encCl, msg.sender);
        FHE.allow(encBl, msg.sender);
    }

    // ============ Bidirectional Revocation ============

    /// @inheritdoc IIdentityRegistry
    function revokeIdentity() external {
        _revokeIdentity(msg.sender);
    }

    /// @inheritdoc IIdentityRegistry
    function revokeIdentityFor(address user) external onlyRegistrar {
        _revokeIdentity(user);
    }

    function _revokeIdentity(address user) internal {
        if (currentAttestationId[user] == 0) revert NotAttested();

        // Increment revision and nonce — invalidates grants, cached results, and any pending permits
        revisions[user]++;
        nonces[user]++;

        // Zero out encrypted values (new ciphertext handles)
        birthYearOffsets[user] = FHE.asEuint8(0);
        countryCodes[user] = FHE.asEuint16(0);
        complianceLevels[user] = FHE.asEuint8(0);
        blacklistStatuses[user] = FHE.asEbool(false);

        // Clear metadata
        currentAttestationId[user] = 0;
        attestationTimestamp[user] = 0;
        proofSetHashes[user] = bytes32(0);
        policyVersions[user] = 0;

        emit IdentityRevoked(user);
    }

    // ============ Revision-Scoped Grants ============

    /// @inheritdoc IIdentityRegistry
    function grantAttributeAccess(
        address grantee,
        uint8 attributeMask,
        Purpose purpose
    ) external whenAttested(msg.sender) {
        if (grantee == address(0)) revert ZeroAddress();

        // Grants are scoped to the current attestation revision
        bytes32 grantKey = keccak256(abi.encodePacked(msg.sender, grantee, revisions[msg.sender]));
        attributeGrants[grantKey] |= attributeMask;

        // Grant FHE ACL per selected attribute
        if (attributeMask & ATTR_BIRTH_YEAR != 0) {
            FHE.allow(birthYearOffsets[msg.sender], grantee);
        }
        if (attributeMask & ATTR_COUNTRY != 0) {
            FHE.allow(countryCodes[msg.sender], grantee);
        }
        if (attributeMask & ATTR_COMPLIANCE != 0) {
            FHE.allow(complianceLevels[msg.sender], grantee);
        }
        if (attributeMask & ATTR_BLACKLIST != 0) {
            FHE.allow(blacklistStatuses[msg.sender], grantee);
        }

        emit AttributeAccessGranted(msg.sender, grantee, attributeMask, purpose);
    }

    /// @inheritdoc IIdentityRegistry
    function grantAccessTo(address grantee) external whenAttested(msg.sender) {
        if (grantee == address(0)) revert ZeroAddress();

        bytes32 grantKey = keccak256(abi.encodePacked(msg.sender, grantee, revisions[msg.sender]));
        attributeGrants[grantKey] = ATTR_ALL;

        FHE.allow(birthYearOffsets[msg.sender], grantee);
        FHE.allow(countryCodes[msg.sender], grantee);
        FHE.allow(complianceLevels[msg.sender], grantee);
        FHE.allow(blacklistStatuses[msg.sender], grantee);

        emit AttributeAccessGranted(msg.sender, grantee, ATTR_ALL, Purpose.COMPLIANCE_CHECK);
    }

    // ============ Policy-Authorized Compliance Checks ============

    /// @inheritdoc IIdentityRegistry
    function checkCompliance(
        address user,
        uint8 minLevel
    ) external whenAttested(user) onlyAuthorizedPolicy returns (ebool) {
        euint8 encMinLevel = FHE.asEuint8(minLevel);
        ebool meetsLevel = FHE.ge(complianceLevels[user], encMinLevel);
        ebool notBlocked = FHE.not(blacklistStatuses[user]);
        ebool result = FHE.and(meetsLevel, notBlocked);

        // Cache key includes revision to prevent stale results
        bytes32 key = keccak256(abi.encodePacked(user, "compliance", minLevel, revisions[user]));
        verificationResults[key] = result;
        FHE.allowThis(result);
        FHE.allow(result, msg.sender);

        return result;
    }

    /// @inheritdoc IIdentityRegistry
    function hasMinComplianceLevel(
        address user,
        uint8 minLevel
    ) external whenAttested(user) onlyAuthorizedPolicy returns (ebool) {
        ebool result = FHE.ge(complianceLevels[user], FHE.asEuint8(minLevel));

        bytes32 key = keccak256(abi.encodePacked(user, "minLevel", minLevel, revisions[user]));
        verificationResults[key] = result;
        FHE.allowThis(result);
        FHE.allow(result, msg.sender);

        return result;
    }

    /// @inheritdoc IIdentityRegistry
    function isFromCountry(
        address user,
        uint16 country
    ) external whenAttested(user) onlyAuthorizedPolicy returns (ebool) {
        ebool result = FHE.eq(countryCodes[user], FHE.asEuint16(country));

        bytes32 key = keccak256(abi.encodePacked(user, "country", country, revisions[user]));
        verificationResults[key] = result;
        FHE.allowThis(result);
        FHE.allow(result, msg.sender);

        return result;
    }

    /// @inheritdoc IIdentityRegistry
    function isNotBlacklisted(address user) external whenAttested(user) onlyAuthorizedPolicy returns (ebool) {
        ebool result = FHE.not(blacklistStatuses[user]);

        bytes32 key = keccak256(abi.encodePacked(user, "notBlacklisted", revisions[user]));
        verificationResults[key] = result;
        FHE.allowThis(result);
        FHE.allow(result, msg.sender);

        return result;
    }

    // ============ Encrypted Attribute Getters ============

    /// @inheritdoc IIdentityRegistry
    function getBirthYearOffset(address user) external view whenAttested(user) returns (euint8) {
        if (!FHE.isSenderAllowed(birthYearOffsets[user])) revert AccessProhibited();
        return birthYearOffsets[user];
    }

    /// @inheritdoc IIdentityRegistry
    function getCountryCode(address user) external view whenAttested(user) returns (euint16) {
        if (!FHE.isSenderAllowed(countryCodes[user])) revert AccessProhibited();
        return countryCodes[user];
    }

    /// @inheritdoc IIdentityRegistry
    function getComplianceLevel(address user) external view whenAttested(user) returns (euint8) {
        if (!FHE.isSenderAllowed(complianceLevels[user])) revert AccessProhibited();
        return complianceLevels[user];
    }

    /// @inheritdoc IIdentityRegistry
    function getBlacklistStatus(address user) external view whenAttested(user) returns (ebool) {
        if (!FHE.isSenderAllowed(blacklistStatuses[user])) revert AccessProhibited();
        return blacklistStatuses[user];
    }

    // ============ Metadata Getters ============

    /// @inheritdoc IIdentityRegistry
    function isAttested(address user) external view returns (bool) {
        return currentAttestationId[user] != 0;
    }

    /// @inheritdoc IIdentityRegistry
    function getProofSetHash(address user) external view returns (bytes32) {
        return proofSetHashes[user];
    }

    /// @inheritdoc IIdentityRegistry
    function getPolicyVersion(address user) external view returns (uint32) {
        return policyVersions[user];
    }

    /// @dev Grant lookup includes the current revision
    function getGrantedAttributes(address user, address grantee) external view returns (uint8) {
        return attributeGrants[keccak256(abi.encodePacked(user, grantee, revisions[user]))];
    }

    /// @inheritdoc IIdentityRegistry
    function getVerificationResult(bytes32 key) external view returns (ebool) {
        ebool result = verificationResults[key];
        if (!FHE.isSenderAllowed(result)) revert AccessProhibited();
        return result;
    }

    // ============ Admin ============

    /// @notice Add or remove a registrar
    function setRegistrar(address registrar, bool status) external onlyOwner {
        if (registrar == address(0)) revert ZeroAddress();
        registrars[registrar] = status;
        emit RegistrarUpdated(registrar, status);
    }

    /// @notice Authorize or deauthorize a policy contract for predicate calls
    function setAuthorizedPolicy(address policy, bool status) external onlyOwner {
        if (policy == address(0)) revert ZeroAddress();
        authorizedPolicies[policy] = status;
        emit PolicyUpdated(policy, status);
    }

    // ============ UUPS ============

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
