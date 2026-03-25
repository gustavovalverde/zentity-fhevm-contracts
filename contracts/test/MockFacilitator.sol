// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/// @title MockFacilitator
/// @notice Simulates an x402 facilitator verifying compliance before settlement
/// @dev Demonstrates the checkCompliance + FHE.select pattern for x402 integration
contract MockFacilitator is ZamaEthereumConfig {
    IIdentityRegistry public immutable registry;
    uint8 public requiredLevel;

    /// @notice Result of the last settlement attempt
    mapping(address payer => ebool result) public settlementResults;

    event SettlementAttempted(address indexed payer);

    constructor(address _registry, uint8 _requiredLevel) {
        registry = IIdentityRegistry(_registry);
        requiredLevel = _requiredLevel;
    }

    /// @notice Simulates x402 settlement with inline compliance check
    /// @dev This is the pattern x402 facilitators would use:
    ///      1. Check compliance via registry
    ///      2. Use FHE.select to conditionally process the amount
    function settleWithCompliance(address payer) external returns (ebool) {
        ebool compliant = registry.checkCompliance(payer, requiredLevel);

        // Store result for test verification
        settlementResults[payer] = compliant;
        FHE.allowThis(compliant);
        FHE.allow(compliant, msg.sender);

        emit SettlementAttempted(payer);
        return compliant;
    }
}
