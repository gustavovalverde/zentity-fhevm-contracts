// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase
pragma solidity ^0.8.27;

import {FHE, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title CompliantERC20
 * @author Gustavo Valverde
 * @notice ERC20-like token with encrypted balances and compliance checks
 * @dev Part of zentity-fhevm-contracts - Builder Track
 *
 * @custom:category token
 * @custom:concept FHE.select() for branch-free compliant transfers
 * @custom:difficulty advanced
 *
 * This contract implements a compliant token with encrypted balances.
 * Transfers only succeed if both parties pass compliance checks, but
 * failures are handled silently (transfer of 0) to prevent information leakage.
 *
 * Key patterns demonstrated:
 * 1. FHE.select() for branch-free conditional logic
 * 2. Combining multiple encrypted conditions with FHE.and()
 * 3. Encrypted balance management
 * 4. No-revert compliance (privacy-preserving failure handling)
 * 5. Integration with external compliance checker
 */
contract CompliantERC20 is ZamaEthereumConfig {
    // ============ Token Metadata ============

    /// @notice Token name
    string public name;

    /// @notice Token symbol
    string public symbol;

    /// @notice Token decimals
    uint8 public constant DECIMALS = 18;

    /// @notice Total supply (public for transparency)
    uint256 public totalSupply;

    // ============ Token State ============

    /// @notice Encrypted balances
    mapping(address account => euint64 balance) private balances;

    /// @notice Encrypted allowances
    mapping(address owner => mapping(address spender => euint64 allowance)) private allowances;

    // ============ Compliance State ============

    /// @notice Compliance checker interface (can be ComplianceRules or custom)
    IComplianceChecker public complianceChecker;

    /// @notice Owner/admin
    address public owner;
    /// @notice Pending owner for two-step ownership transfer
    address public pendingOwner;

    // ============ Events ============

    /// @notice Emitted on token transfers (indexed for efficient filtering)
    /// @param from Address tokens are transferred from
    /// @param to Address tokens are transferred to
    event Transfer(address indexed from, address indexed to);

    /// @notice Emitted when spending allowance is set
    /// @param owner Address of the token owner
    /// @param spender Address authorized to spend
    event Approval(address indexed owner, address indexed spender);

    /// @notice Emitted when new tokens are minted
    /// @param to Address receiving the minted tokens
    /// @param amount Number of tokens minted
    event Mint(address indexed to, uint256 indexed amount);

    /// @notice Emitted when the compliance checker contract is updated
    /// @param newChecker Address of the new compliance checker
    event ComplianceCheckerUpdated(address indexed newChecker);

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

    /// @notice Thrown when compliance checker is required but not set
    error ComplianceCheckerNotSet();
    /// @notice Thrown when caller supplies an unauthorized ciphertext handle
    error UnauthorizedCiphertext();
    /// @notice Thrown when mint amount would exceed uint64 accounting bounds
    error TotalSupplyOverflow();

    // ============ Constructor ============

    /**
     * @notice Initialize the token
     * @param tokenName Token name
     * @param tokenSymbol Token symbol
     * @param checker Address of the compliance checker contract
     */
    constructor(string memory tokenName, string memory tokenSymbol, address checker) {
        name = tokenName;
        symbol = tokenSymbol;
        owner = msg.sender;
        if (checker != address(0)) {
            complianceChecker = IComplianceChecker(checker);
        }
    }

    // ============ Admin Functions ============

    /**
     * @notice Set the compliance checker contract
     * @param checker Address of the compliance checker
     */
    function setComplianceChecker(address checker) external {
        if (msg.sender != owner) revert OnlyOwner();
        complianceChecker = IComplianceChecker(checker);
        emit ComplianceCheckerUpdated(checker);
    }

    /**
     * @notice Initiate transfer of contract ownership
     * @param newOwner Address that can accept ownership
     */
    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert OnlyOwner();
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

    /**
     * @notice Mint tokens to an address
     * @dev Only owner can mint. Compliance is NOT checked on mint.
     * @param to Recipient address
     * @param amount Amount to mint (plaintext)
     */
    function mint(address to, uint256 amount) external {
        if (msg.sender != owner) revert OnlyOwner();
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

    /**
     * @notice Transfer tokens with encrypted amount
     * @dev Branch-free transfer with compliance checks
     * @param to Recipient address
     * @param encryptedAmount Encrypted amount to transfer
     * @param inputProof Proof for encrypted input
     * @return success Always returns true (actual transfer amount may be 0)
     *
     * Key insight: We never revert on failed compliance. Instead:
     * - If compliant: transfer the requested amount
     * - If not compliant: transfer 0 (no state change, no info leak)
     */
    function transfer(
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (bool success) {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        return _transfer(msg.sender, to, amount);
    }

    /**
     * @notice Transfer with euint64 amount (for approved callers)
     * @param to Recipient
     * @param amount Encrypted amount
     * @return success Always true
     */
    function transfer(address to, euint64 amount) external returns (bool success) {
        if (!FHE.isSenderAllowed(amount)) revert UnauthorizedCiphertext();
        return _transfer(msg.sender, to, amount);
    }

    /**
     * @notice Approve spender to transfer tokens
     * @param spender Address to approve
     * @param encryptedAmount Encrypted allowance amount
     * @param inputProof Proof for encrypted input
     * @return success Always true
     */
    function approve(
        address spender,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (bool success) {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        allowances[msg.sender][spender] = amount;
        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender);
        FHE.allow(amount, spender);

        emit Approval(msg.sender, spender);
        return true;
    }

    /**
     * @notice Transfer from another account (requires approval)
     * @param from Source address
     * @param to Destination address
     * @param encryptedAmount Encrypted amount
     * @param inputProof Proof for encrypted input
     * @return success Always true
     */
    function transferFrom(
        address from,
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (bool success) {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        // Check allowance
        ebool hasAllowance = FHE.le(amount, allowances[from][msg.sender]);

        // Reduce allowance (branch-free)
        euint64 newAllowance = FHE.select(
            hasAllowance,
            FHE.sub(allowances[from][msg.sender], amount),
            allowances[from][msg.sender]
        );
        allowances[from][msg.sender] = newAllowance;
        FHE.allowThis(newAllowance);
        FHE.allow(newAllowance, from);
        FHE.allow(newAllowance, msg.sender);

        // Only transfer if allowance was sufficient
        euint64 actualAmount = FHE.select(hasAllowance, amount, FHE.asEuint64(0));

        return _transfer(from, to, actualAmount);
    }

    // ============ View Functions ============

    /**
     * @notice Get encrypted balance
     * @param account Address to query
     * @return Encrypted balance
     */
    function balanceOf(address account) external view returns (euint64) {
        return balances[account];
    }

    /**
     * @notice Get encrypted allowance
     * @param account Owner address
     * @param spender Spender address
     * @return Encrypted allowance
     */
    function allowance(address account, address spender) external view returns (euint64) {
        return allowances[account][spender];
    }

    /**
     * @notice Get decimals
     * @return Token decimals
     */
    function decimals() external pure returns (uint8) {
        return DECIMALS;
    }

    // ============ Internal Functions ============

    /**
     * @notice Internal transfer implementation
     * @dev The heart of branch-free compliance
     *
     * Logic flow:
     * 1. Check sender compliance (if checker is set)
     * 2. Check recipient compliance (if checker is set)
     * 3. Check sender has sufficient balance
     * 4. Combine all checks with FHE.and()
     * 5. Use FHE.select() to set transfer amount:
     *    - If all checks pass: transfer requested amount
     *    - If any check fails: transfer 0
     * 6. Update balances (even if amount is 0)
     *
     * @param from Source address
     * @param to Destination address
     * @param amount Encrypted amount to transfer
     * @return success Always returns true (actual transfer may be 0)
     */
    function _transfer(
        address from,
        address to,
        euint64 amount
    ) internal returns (bool success) {
        ebool canTransfer;

        // Check compliance if checker is set
        if (address(complianceChecker) != address(0)) {
            ebool senderCompliant = complianceChecker.checkCompliance(from);
            ebool recipientCompliant = complianceChecker.checkCompliance(to);
            ebool bothCompliant = FHE.and(senderCompliant, recipientCompliant);

            // Check sufficient balance
            ebool hasSufficientBalance = FHE.le(amount, balances[from]);

            // Combine all conditions
            canTransfer = FHE.and(bothCompliant, hasSufficientBalance);
        } else {
            // No compliance checker, only check balance
            canTransfer = FHE.le(amount, balances[from]);
        }

        // Branch-free: select actual amount or 0
        euint64 actualAmount = FHE.select(canTransfer, amount, FHE.asEuint64(0));

        // Update balances
        euint64 newFromBalance = FHE.sub(balances[from], actualAmount);
        euint64 newToBalance = FHE.add(balances[to], actualAmount);

        balances[from] = newFromBalance;
        balances[to] = newToBalance;

        // Set permissions
        FHE.allowThis(newFromBalance);
        FHE.allowThis(newToBalance);
        FHE.allow(newFromBalance, from);
        FHE.allow(newToBalance, to);

        // Always emit (hides success/failure)
        emit Transfer(from, to);

        return true;
    }
}

/**
 * @title IComplianceChecker
 * @author Gustavo Valverde
 * @notice Interface for compliance checking contracts
 */
interface IComplianceChecker {
    /// @notice Check if a user passes compliance requirements
    /// @param user Address to check compliance for
    /// @return Encrypted boolean indicating compliance status
    function checkCompliance(address user) external returns (ebool);
}
