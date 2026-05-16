// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase
pragma solidity ^0.8.27;

import {FHE, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IComplianceRules} from "../interfaces/IComplianceRules.sol";

/// @title CompliantERC20
/// @author Gustavo Valverde
/// @notice ERC20-like token with encrypted balances and branch-free compliance
/// @dev Transfers use FHE.select() — failed compliance silently transfers 0,
///      preventing information leakage about compliance status.
contract CompliantERC20 is Ownable2Step, ZamaEthereumConfig {
    string public name;
    string public symbol;
    uint8 public constant DECIMALS = 18;
    uint256 public totalSupply;

    mapping(address account => euint64 balance) private balances;
    mapping(address owner => mapping(address spender => euint64 allowance)) private allowances;

    IComplianceRules public complianceChecker;

    struct EncryptedTokenAmount {
        externalEuint64 amount;
        bytes inputProof;
    }

    event Transfer(address indexed from, address indexed to);
    event Approval(address indexed owner, address indexed spender);
    event Mint(address indexed to, uint256 indexed amount);
    event ComplianceCheckerUpdated(address indexed newChecker);

    error ComplianceCheckerNotSet();
    error UnauthorizedCiphertext();
    error TotalSupplyOverflow();

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address checker
    ) Ownable(msg.sender) {
        name = tokenName;
        symbol = tokenSymbol;
        if (checker != address(0)) {
            complianceChecker = IComplianceRules(checker);
        }
    }

    // ============ Admin ============

    function setComplianceChecker(address checker) external onlyOwner {
        complianceChecker = IComplianceRules(checker);
        emit ComplianceCheckerUpdated(checker);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        if (amount > type(uint64).max) revert TotalSupplyOverflow();
        if (totalSupply + amount > type(uint64).max) revert TotalSupplyOverflow();

        euint64 mintAmount = FHE.asEuint64(uint64(amount));
        balances[to] = FHE.add(balances[to], mintAmount);
        FHE.allowThis(balances[to]);
        FHE.allow(balances[to], to);

        totalSupply += amount;
        emit Mint(to, amount);
    }

    // ============ Token Functions ============

    function transferConfidential(
        address to,
        EncryptedTokenAmount calldata encryptedAmount
    ) external returns (bool) {
        euint64 amount = FHE.fromExternal(encryptedAmount.amount, encryptedAmount.inputProof);
        return _transfer(msg.sender, to, amount);
    }

    function transfer(address to, euint64 amount) external returns (bool) {
        if (!FHE.isSenderAllowed(amount)) revert UnauthorizedCiphertext();
        return _transfer(msg.sender, to, amount);
    }

    function approveConfidential(
        address spender,
        EncryptedTokenAmount calldata encryptedAmount
    ) external returns (bool) {
        euint64 amount = FHE.fromExternal(encryptedAmount.amount, encryptedAmount.inputProof);
        allowances[msg.sender][spender] = amount;
        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender);
        FHE.allow(amount, spender);
        emit Approval(msg.sender, spender);
        return true;
    }

    function transferFromConfidential(
        address from,
        address to,
        EncryptedTokenAmount calldata encryptedAmount
    ) external returns (bool) {
        euint64 amount = FHE.fromExternal(encryptedAmount.amount, encryptedAmount.inputProof);

        ebool hasAllowance = FHE.le(amount, allowances[from][msg.sender]);
        euint64 newAllowance = FHE.select(
            hasAllowance,
            FHE.sub(allowances[from][msg.sender], amount),
            allowances[from][msg.sender]
        );
        allowances[from][msg.sender] = newAllowance;
        FHE.allowThis(newAllowance);
        FHE.allow(newAllowance, from);
        FHE.allow(newAllowance, msg.sender);

        euint64 actualAmount = FHE.select(hasAllowance, amount, FHE.asEuint64(0));
        return _transfer(from, to, actualAmount);
    }

    // ============ View ============

    function balanceOf(address account) external view returns (euint64) {
        return balances[account];
    }

    function allowance(address account, address spender) external view returns (euint64) {
        return allowances[account][spender];
    }

    function decimals() external pure returns (uint8) {
        return DECIMALS;
    }

    // ============ Internal ============

    /// @dev Branch-free transfer: FHE.select(canTransfer, amount, 0)
    function _transfer(address from, address to, euint64 amount) internal returns (bool) {
        ebool canTransfer;

        if (address(complianceChecker) != address(0)) {
            ebool senderCompliant = complianceChecker.checkCompliance(from);
            ebool recipientCompliant = complianceChecker.checkCompliance(to);
            ebool bothCompliant = FHE.and(senderCompliant, recipientCompliant);
            ebool hasSufficientBalance = FHE.le(amount, balances[from]);
            canTransfer = FHE.and(bothCompliant, hasSufficientBalance);
        } else {
            canTransfer = FHE.le(amount, balances[from]);
        }

        euint64 actualAmount = FHE.select(canTransfer, amount, FHE.asEuint64(0));
        euint64 newFromBalance = FHE.sub(balances[from], actualAmount);
        euint64 newToBalance = FHE.add(balances[to], actualAmount);

        balances[from] = newFromBalance;
        balances[to] = newToBalance;

        FHE.allowThis(newFromBalance);
        FHE.allowThis(newToBalance);
        FHE.allow(newFromBalance, from);
        FHE.allow(newToBalance, to);

        emit Transfer(from, to);
        return true;
    }
}
