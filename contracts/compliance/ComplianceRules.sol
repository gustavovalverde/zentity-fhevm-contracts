// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {IComplianceRules} from "../interfaces/IComplianceRules.sol";

/// @title ComplianceRules
/// @author Gustavo Valverde
/// @notice Compliance aggregation contract combining registry checks via FHE.and()
/// @dev Not proxied — can be redeployed independently. Delegates to the registry's
///      combined checkCompliance() for the standard case, and composes individual
///      checks for country-restricted scenarios.
contract ComplianceRules is IComplianceRules, Ownable2Step, ZamaEthereumConfig {
    IIdentityRegistry public immutable identityRegistry;

    uint8 public minComplianceLevel;

    mapping(address user => ebool result) private complianceResults;
    mapping(address caller => bool authorized) public authorizedCallers;

    modifier onlyAuthorizedOrSelf(address user) {
        if (msg.sender != user && !authorizedCallers[msg.sender]) {
            revert CallerNotAuthorized();
        }
        _;
    }

    constructor(
        address registry,
        uint8 initialMinComplianceLevel
    ) Ownable(msg.sender) {
        if (registry == address(0)) revert CallerNotAuthorized();
        identityRegistry = IIdentityRegistry(registry);
        minComplianceLevel = initialMinComplianceLevel;
    }

    // ============ Admin ============

    function setMinComplianceLevel(uint8 newLevel) external onlyOwner {
        minComplianceLevel = newLevel;
        emit MinComplianceLevelUpdated(newLevel);
    }

    function setAuthorizedCaller(address caller, bool allowed) external onlyOwner {
        authorizedCallers[caller] = allowed;
        emit AuthorizedCallerUpdated(caller, allowed);
    }

    // ============ Compliance Checks ============

    /// @inheritdoc IComplianceRules
    function checkCompliance(address user) external onlyAuthorizedOrSelf(user) returns (ebool) {
        if (!identityRegistry.isAttested(user)) {
            return _storeResult(user, FHE.asEbool(false));
        }

        // Delegate to registry's combined check (level + blacklist)
        ebool result = identityRegistry.checkCompliance(user, minComplianceLevel);

        return _storeResult(user, result);
    }

    /// @inheritdoc IComplianceRules
    function checkComplianceWithCountry(
        address user,
        uint16 allowedCountry
    ) external onlyAuthorizedOrSelf(user) returns (ebool) {
        if (!identityRegistry.isAttested(user)) {
            return _storeResult(user, FHE.asEbool(false));
        }

        // Combined level + blacklist check
        ebool baseCompliance = identityRegistry.checkCompliance(user, minComplianceLevel);
        // Additional country restriction
        ebool isFromAllowedCountry = identityRegistry.isFromCountry(user, allowedCountry);

        ebool result = FHE.and(baseCompliance, isFromAllowedCountry);

        return _storeResult(user, result);
    }

    /// @inheritdoc IComplianceRules
    function getComplianceResult(address user) external view returns (ebool) {
        ebool result = complianceResults[user];
        if (!FHE.isSenderAllowed(result)) revert AccessProhibited();
        return result;
    }

    /// @inheritdoc IComplianceRules
    function hasComplianceResult(address user) external view returns (bool) {
        return FHE.isInitialized(complianceResults[user]);
    }

    // ============ Internal ============

    function _storeResult(address user, ebool result) internal returns (ebool) {
        complianceResults[user] = result;
        FHE.allowThis(result);
        FHE.allow(result, msg.sender);
        emit ComplianceChecked(user);
        return result;
    }
}
