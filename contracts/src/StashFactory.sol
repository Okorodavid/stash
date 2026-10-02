// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {StashVault} from "./StashVault.sol";

/// @title StashFactory
/// @notice Deploys one StashVault clone per user at a predictable address.
/// @dev The factory owner (a multisig in production) can only change where goal break fees go.
///      It has no way to touch funds held in any vault. The yield-adapter allowlist every new
///      vault starts with is fixed at deploy; vault owners can add more only through a timelock.
contract StashFactory is Ownable2Step {
    address public immutable implementation;
    address public treasury;
    address[] internal _defaultYieldTargets;
    mapping(address owner => address vault) public vaultOf;

    event VaultCreated(address indexed owner, address indexed vault);
    event TreasuryUpdated(address treasury);

    error VaultExists();

    constructor(address initialOwner, address treasury_, address[] memory defaultYieldTargets_) Ownable(initialOwner) {
        implementation = address(new StashVault());
        treasury = treasury_;
        _defaultYieldTargets = defaultYieldTargets_;
        emit TreasuryUpdated(treasury_);
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

    function _salt(address owner_) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(owner_)));
    }
}
