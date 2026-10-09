// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {StashVault} from "./StashVault.sol";

/// @title StashFactory
/// @notice Deploys one StashVault clone per user at a predictable address.
/// @dev The factory owner (a multisig in production) can only change where goal break fees go
///      and the beta deposit cap, which can only block new deposits. It has no way to touch
///      funds held in any vault. The yield-adapter allowlist every new
///      vault starts with is fixed at deploy; vault owners can add more only through a timelock.
contract StashFactory is Ownable2Step {
    address public immutable implementation;
    address public treasury;
    /// @notice Max net USD (18 decimals) each vault accepts through its deposit functions; 0 = no cap.
    uint256 public depositCapUsd;
    address[] internal _defaultYieldTargets;
    mapping(address owner => address vault) public vaultOf;

    event VaultCreated(address indexed owner, address indexed vault);
    event TreasuryUpdated(address treasury);
    event DepositCapUpdated(uint256 capUsd);
    event VaultOwnerChanged(address indexed vault, address indexed oldOwner, address indexed newOwner);

    error VaultExists();
    error NotVault();

    constructor(address initialOwner, address treasury_, uint256 depositCapUsd_, address[] memory defaultYieldTargets_)
        Ownable(initialOwner)
    {
        implementation = address(new StashVault());
        treasury = treasury_;
        depositCapUsd = depositCapUsd_;
        _defaultYieldTargets = defaultYieldTargets_;
        emit TreasuryUpdated(treasury_);
        emit DepositCapUpdated(depositCapUsd_);
    }

    /// @param guardians 1–3 guardians; the app passes the Stash guardian plus any the user adds.
    function createVault(address[] calldata guardians, StashVault.Policy calldata policy)
        external
        returns (address vault)
    {
        if (vaultOf[msg.sender] != address(0)) revert VaultExists();
        vault = Clones.cloneDeterministic(implementation, _salt(msg.sender));
        vaultOf[msg.sender] = vault;
        StashVault(vault).initialize(msg.sender, guardians, policy, _defaultYieldTargets);
        emit VaultCreated(msg.sender, vault);
    }

    /// @notice Address a user's vault will have, so the app can show deposit details before it exists.
    function predictVault(address owner_) external view returns (address) {
        return Clones.predictDeterministicAddress(implementation, _salt(owner_));
    }

    function defaultYieldTargets() external view returns (address[] memory) {
        return _defaultYieldTargets;
    }

    function setTreasury(address treasury_) external onlyOwner {
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    /// @notice Called by a vault when its owner key changes, so `vaultOf` follows the new owner.
    ///         Only the vault currently recorded for `oldOwner` can move its own entry.
    function vaultOwnerChanged(address oldOwner, address newOwner) external {
        if (vaultOf[oldOwner] != msg.sender) revert NotVault();
        if (vaultOf[newOwner] != address(0)) revert VaultExists();
        delete vaultOf[oldOwner];
        vaultOf[newOwner] = msg.sender;
        emit VaultOwnerChanged(msg.sender, oldOwner, newOwner);
    }

    function setDepositCap(uint256 capUsd) external onlyOwner {
        depositCapUsd = capUsd;
        emit DepositCapUpdated(capUsd);
    }

    function _salt(address owner_) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(owner_)));
    }
}
