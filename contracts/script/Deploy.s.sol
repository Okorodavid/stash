// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {StashFactory} from "../src/StashFactory.sol";

/// Deploys StashFactory (which deploys the StashVault implementation).
/// Same script for Tempo and Base:
///   forge script script/Deploy.s.sol --rpc-url moderato --broadcast --account deployer
///   forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --account deployer
/// Env: FACTORY_OWNER (multisig in production), TREASURY (receives goal break fees),
///      DEPOSIT_CAP_USD (whole dollars per vault, e.g. 500; 0 or unset = no cap; the owner can change it later),
///      DEFAULT_YIELD_TARGETS (optional, comma-separated ERC-4626 adapters, e.g. the curated Morpho vault on Base).
contract Deploy is Script {
    function run() external returns (StashFactory factory) {
        address factoryOwner = vm.envAddress("FACTORY_OWNER");
        address treasury = vm.envAddress("TREASURY");
        uint256 depositCapUsd = vm.envOr("DEPOSIT_CAP_USD", uint256(0)) * 1e18;
        address[] memory yieldTargets = vm.envOr("DEFAULT_YIELD_TARGETS", ",", new address[](0));

        vm.startBroadcast();
        factory = new StashFactory(factoryOwner, treasury, depositCapUsd, yieldTargets);
        vm.stopBroadcast();

        console.log("chain id      ", block.chainid);
        console.log("StashFactory  ", address(factory));
        console.log("StashVault impl", factory.implementation());
        console.log("deposit cap USD", depositCapUsd / 1e18);
    }
}
