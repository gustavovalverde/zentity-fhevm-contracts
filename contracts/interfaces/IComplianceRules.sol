// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ebool} from "@fhevm/solidity/lib/FHE.sol";

/// @title IComplianceRules
/// @notice Interface for the compliance aggregation contract
interface IComplianceRules {
    event MinComplianceLevelUpdated(uint8 indexed newLevel);
    event ComplianceChecked(address indexed user);
    event AuthorizedCallerUpdated(address indexed caller, bool indexed allowed);

    error CallerNotAuthorized();
    error AccessProhibited();

    /// @notice Check if user passes compliance (level + blacklist)
    function checkCompliance(address user) external returns (ebool);

    /// @notice Check compliance with additional country restriction
    function checkComplianceWithCountry(address user, uint16 allowedCountry) external returns (ebool);

    /// @notice Get the last cached compliance result
    function getComplianceResult(address user) external view returns (ebool);

    /// @notice Whether a cached compliance result exists
    function hasComplianceResult(address user) external view returns (bool);

    function minComplianceLevel() external view returns (uint8);
    function authorizedCallers(address caller) external view returns (bool);
}
