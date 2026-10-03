// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StashFactory} from "../src/StashFactory.sol";

/// TESTNET ONLY: a plain ERC-4626 vault over USDC that stands in for the curated Morpho vault,
/// which has no reliable Base Sepolia deployment. It earns nothing; it exercises the same
/// depositToYield / redeemFromYield path the mainnet Save pot uses.
contract TestnetSaveVault is ERC4626 {
    constructor(IERC20 usdc) ERC4626(usdc) ERC20("Stash Testnet Save USDC", "tsUSDC") {}
}

/// Deploys the stand-in Save vault and a StashFactory that allowlists it.
///   forge script script/DeployTestnetSavePot.s.sol --rpc-url base_sepolia --broadcast --account deployer
/// Env: FACTORY_OWNER, TREASURY, USDC (Base Sepolia USDC).
contract DeployTestnetSavePot is Script {
    function run() external returns (StashFactory factory, TestnetSaveVault saveVault) {
        address factoryOwner = vm.envAddress("FACTORY_OWNER");
        address treasury = vm.envAddress("TREASURY");
        IERC20 usdc = IERC20(vm.envAddress("USDC"));

        vm.startBroadcast();
        saveVault = new TestnetSaveVault(usdc);
        address[] memory targets = new address[](1);
        targets[0] = address(saveVault);
        factory = new StashFactory(factoryOwner, treasury, targets);
        vm.stopBroadcast();

        console.log("chain id        ", block.chainid);
        console.log("Save vault      ", address(saveVault));
        console.log("StashFactory    ", address(factory));
    }
}
