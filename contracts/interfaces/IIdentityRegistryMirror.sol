// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IIdentityRegistryMirror
/// @author Zentity
/// @notice Plaintext compliance mirror for public, low-latency reads on Base.
interface IIdentityRegistryMirror {
    /// @notice Emitted when an identity is first mirrored.
    /// @param user Wallet address whose compliance was mirrored.
    event IdentityAttested(address indexed user);

    /// @notice Emitted when a mirrored identity is revoked.
    /// @param user Wallet address whose mirrored compliance was revoked.
    event IdentityRevoked(address indexed user);

    /// @notice Emitted when a mirrored identity's compliance level changes.
    /// @dev Revocation also emits this event with `newLevel = 0` so level-only
    ///      indexers can stay consistent without subscribing to lifecycle events.
    /// @param user Wallet address whose level changed.
    /// @param previousLevel Previous public compliance level.
    /// @param newLevel New public compliance level.
    event LevelUpdated(address indexed user, uint8 previousLevel, uint8 indexed newLevel);

    /// @notice Emitted when a registrar is added or removed.
    /// @param registrar Address whose registrar status changed.
    /// @param status True when the address can write mirrored compliance.
    event RegistrarUpdated(address indexed registrar, bool status);

    /// @notice Thrown when caller is not an authorized registrar.
    error OnlyRegistrar();

    /// @notice Thrown when an address argument is the zero address.
    error ZeroAddress();

    /// @notice Thrown when attempting to mirror an unsupported compliance level.
    error InvalidComplianceLevel(uint8 level);

    /// @notice Record or update a user's public compliance level.
    /// @param user Wallet address receiving mirrored compliance.
    /// @param level Public compliance level in the Zentity tier scale.
    function recordCompliance(address user, uint8 level) external;

    /// @notice Revoke a user's mirrored attestation.
    /// @param user Wallet address whose mirrored compliance should be revoked.
    function revokeAttestation(address user) external;

    /// @notice Return whether a user is attested and meets the requested level.
    /// @param user Wallet address to check.
    /// @param minLevel Minimum compliance level required. Level 0 checks only attestation presence.
    /// @return compliant True when the wallet has a current mirrored attestation at or above the level.
    function isCompliant(address user, uint8 minLevel) external view returns (bool);

    /// @notice Add or remove a registrar.
    /// @param registrar Address allowed or disallowed to write mirrored compliance.
    /// @param status True to authorize, false to remove authorization.
    function setRegistrar(address registrar, bool status) external;

    /// @notice Check if a user has a mirrored attestation.
    /// @param user Wallet address to check.
    /// @return attested True when the wallet has a current mirrored attestation.
    function isAttested(address user) external view returns (bool);

    /// @notice Current public compliance level, or 0 when not attested.
    /// @param user Wallet address to inspect.
    /// @return level Current mirrored compliance level, or 0 when absent.
    function currentLevel(address user) external view returns (uint8);

    /// @notice Current mirror-local attestation ID, or 0 when not attested.
    /// @dev This is a public mirror marker, not the encrypted fhEVM registry revision.
    /// @param user Wallet address to inspect.
    /// @return mirrorAttestationId Current mirror-local attestation ID, or 0 when absent.
    function currentMirrorAttestationId(address user) external view returns (uint256);

    /// @notice Latest mirror-local attestation ID assigned by this mirror.
    /// @dev This counter is independent from the encrypted fhEVM registry counter.
    /// @return mirrorAttestationId Latest mirror-local attestation ID.
    function latestMirrorAttestationId() external view returns (uint256);

    /// @notice Check if an address is an authorized registrar.
    /// @param registrar Address to check.
    /// @return authorized True when the address can write mirrored compliance.
    function registrars(address registrar) external view returns (bool);
}
