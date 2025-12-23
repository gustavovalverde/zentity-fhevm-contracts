// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/**
 * @title ComplianceRules
 * @author Gustavo Valverde
 * @notice Combines multiple compliance checks using FHE operations
 * @dev Part of zentity-fhevm-contracts - Builder Track
 *
 * @custom:category compliance
 * @custom:concept Combining encrypted compliance checks with FHE.and()
 * @custom:difficulty intermediate
 *
 * This contract aggregates compliance checks from IdentityRegistry and returns
 * encrypted boolean results. Consumer contracts (like CompliantERC20) can use
 * these results with FHE.select() for branch-free logic.
 *
 * Key patterns demonstrated:
 * 1. FHE.and() for combining multiple encrypted conditions
 * 2. Integration with IdentityRegistry
 * 3. Configurable compliance parameters
 * 4. Encrypted result caching
 */
contract ComplianceRules is ZamaEthereumConfig {
    // ============ State ============

    /// @notice Reference to the identity registry
    IIdentityRegistry public immutable identityRegistry;

    /// @notice Owner/admin
    address public owner;
    /// @notice Pending owner for two-step ownership transfer
    address public pendingOwner;

    /// @notice Minimum KYC level required for compliance
    uint8 public minKycLevel;

    /// @notice Store last compliance check result for each user
    mapping(address user => ebool result) private complianceResults;

    /// @notice Authorized callers that can request compliance checks for others
    mapping(address caller => bool authorized) public authorizedCallers;

    // ============ Events ============

    /// @notice Emitted when the minimum KYC level requirement is updated
    /// @param newLevel The new minimum KYC level required for compliance
    event MinKycLevelUpdated(uint8 indexed newLevel);

    /// @notice Emitted when a compliance check is performed for a user
    /// @param user Address of the user whose compliance was checked
    event ComplianceChecked(address indexed user);

    /// @notice Emitted when a caller's authorization is updated
    /// @param caller Address being authorized or revoked
    /// @param allowed Whether the caller is allowed
    event AuthorizedCallerUpdated(address indexed caller, bool indexed allowed);

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

    /// @notice Thrown when registry address is zero
    error RegistryNotSet();

    /// @notice Thrown when caller is not authorized to check another user
    error CallerNotAuthorized();

    /// @notice Thrown when caller lacks permission for encrypted result
    error AccessProhibited();

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyAuthorizedOrSelf(address user) {
        if (msg.sender != user && !authorizedCallers[msg.sender]) {
            revert CallerNotAuthorized();
        }
        _;
    }

    // ============ Constructor ============

    /**
     * @notice Initialize with identity registry reference
     * @param registry Address of the IdentityRegistry contract
     * @param initialMinKycLevel Initial minimum KYC level (default: 1)
     */
    constructor(address registry, uint8 initialMinKycLevel) {
        if (registry == address(0)) revert RegistryNotSet();
        identityRegistry = IIdentityRegistry(registry);
        owner = msg.sender;
        minKycLevel = initialMinKycLevel;
    }

    // ============ Admin Functions ============

    /**
     * @notice Update minimum KYC level
     * @param newLevel New minimum level
     */
    function setMinKycLevel(uint8 newLevel) external onlyOwner {
        minKycLevel = newLevel;
        emit MinKycLevelUpdated(newLevel);
    }

    /**
     * @notice Allow or revoke a caller to check compliance for other users
     * @param caller Address to update
     * @param allowed Whether the caller is allowed
     */
    function setAuthorizedCaller(address caller, bool allowed) external onlyOwner {
        authorizedCallers[caller] = allowed;
        emit AuthorizedCallerUpdated(caller, allowed);
    }

    /**
     * @notice Initiate transfer of contract ownership
     * @param newOwner Address that can accept ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /**
     * @notice Accept ownership transfer
     */
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert OnlyPendingOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    // ============ Compliance Checks ============

    /**
     * @notice Check if user passes all compliance requirements
     * @dev Combines: hasMinKycLevel AND isNotBlacklisted
     * @param user Address to check
     * @return Encrypted boolean indicating compliance status
     *
     * Note: This function makes external calls to IdentityRegistry which
     * computes and stores verification results. The combined result is
     * stored locally for later retrieval.
     */
    function checkCompliance(address user) external onlyAuthorizedOrSelf(user) returns (ebool) {
        // Check if user is attested
        if (!identityRegistry.isAttested(user)) {
            ebool notAttestedResult = FHE.asEbool(false);
            FHE.allowThis(notAttestedResult);
            FHE.allow(notAttestedResult, msg.sender);
            complianceResults[user] = notAttestedResult;
            return notAttestedResult;
        }

        // Get individual compliance checks
        ebool hasKyc = identityRegistry.hasMinKycLevel(user, minKycLevel);
        ebool notBlacklisted = identityRegistry.isNotBlacklisted(user);

        // Combine all conditions
        ebool result = FHE.and(hasKyc, notBlacklisted);

        // Store and grant permissions
        complianceResults[user] = result;
        FHE.allowThis(result);
        FHE.allow(result, msg.sender);

        emit ComplianceChecked(user);

        return result;
    }

    /**
     * @notice Check compliance with additional country restriction
     * @param user Address to check
     * @param allowedCountry Country code that is allowed
     * @return Encrypted boolean indicating compliance status
     */
    function checkComplianceWithCountry(
        address user,
        uint16 allowedCountry
    ) external onlyAuthorizedOrSelf(user) returns (ebool) {
        // Check if user is attested
        if (!identityRegistry.isAttested(user)) {
            ebool notAttestedResult = FHE.asEbool(false);
            FHE.allowThis(notAttestedResult);
            FHE.allow(notAttestedResult, msg.sender);
            return notAttestedResult;
        }

        // Get individual compliance checks
        ebool hasKyc = identityRegistry.hasMinKycLevel(user, minKycLevel);
        ebool notBlacklisted = identityRegistry.isNotBlacklisted(user);
        ebool isFromAllowedCountry = identityRegistry.isFromCountry(user, allowedCountry);

        // Combine all conditions
        ebool result = FHE.and(FHE.and(hasKyc, notBlacklisted), isFromAllowedCountry);

        // Grant permissions
        FHE.allowThis(result);
        FHE.allow(result, msg.sender);

        emit ComplianceChecked(user);

        return result;
    }

    /**
     * @notice Get the last compliance check result for a user
     * @dev Call checkCompliance first to compute and store the result
     * @param user Address to get result for
     * @return Encrypted boolean result
     */
    function getComplianceResult(address user) external view returns (ebool) {
        ebool result = complianceResults[user];
        if (!FHE.isSenderAllowed(result)) revert AccessProhibited();
        return result;
    }

    /**
     * @notice Check if compliance result exists for user
     * @param user Address to check
     * @return Whether a cached result exists
     */
    function hasComplianceResult(address user) external view returns (bool) {
        return FHE.isInitialized(complianceResults[user]);
    }
}
