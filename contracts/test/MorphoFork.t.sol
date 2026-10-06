// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {StashFactory} from "../src/StashFactory.sol";
import {StashVault} from "../src/StashVault.sol";

/// Save pot candidates on a Base mainnet fork: each curated Morpho USDC vault must work as a
/// StashVault yield adapter (deposit, earn, redeem back into the vault).
/// Skipped unless BASE_RPC_URL is set:
///   BASE_RPC_URL=https://mainnet.base.org forge test --match-contract MorphoForkTest -vv
contract MorphoForkTest is Test {
    IERC20 constant USDC = IERC20(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913);

    address owner = makeAddr("owner");
    address guardian = makeAddr("guardian");
    address treasury = makeAddr("treasury");

    function _candidates() internal pure returns (address[] memory c, string[] memory names) {
        c = new address[](6);
        names = new string[](6);
        (c[0], names[0]) = (0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61, "Gauntlet USDC Prime (V1)");
        (c[1], names[1]) = (0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A, "Spark USDC Vault (V1)");
        (c[2], names[2]) = (0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183, "Steakhouse USDC (V1)");
        (c[3], names[3]) = (0xBEEFE94c8aD530842bfE7d8B397938fFc1cb83b2, "Steakhouse Prime USDC (V1)");
        (c[4], names[4]) = (0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9, "Steakhouse Prime USDC (V2)");
        (c[5], names[5]) = (0x050cE30b927Da55177A4914EC73480238BAD56f0, "Gauntlet USDC Prime (V2)");
    }

    function test_Fork_SavePotCandidates() public {
        string memory rpc = vm.envOr("BASE_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        (address[] memory c, string[] memory names) = _candidates();
        for (uint256 i; i < c.length; ++i) {
            _check(c[i], names[i]);
        }
    }

    function _check(address adapter, string memory name) internal {
        assertEq(IERC4626(adapter).asset(), address(USDC), name);

        address[] memory targets = new address[](1);
        targets[0] = adapter;
        StashFactory factory = new StashFactory(address(this), treasury, 0, targets);
        address[] memory guardians = new address[](1);
        guardians[0] = guardian;
        vm.prank(owner);
        StashVault vault = StashVault(
            factory.createVault(guardians, StashVault.Policy({timelock: 24 hours, dailyLimit: 100e18, largeThreshold: 500e18}))
        );

        uint256 amount = 1_000e6;
        deal(address(USDC), address(vault), amount);

        vm.prank(owner);
        uint256 shares = vault.depositToYield(adapter, amount);
        assertGt(shares, 0, name);
        assertEq(USDC.balanceOf(address(vault)), 0, name);
        assertEq(USDC.allowance(address(vault), adapter), 0, name); // approval reset after deposit

        // Limits count shares at their dollar value (shares are worth more than $1 after interest).
        uint256 worth101 = IERC4626(adapter).convertToShares(101e6);
        vm.prank(owner);
        vm.expectRevert(StashVault.DailyLimitExceeded.selector);
        vault.withdraw(adapter, treasury, worth101);

        skip(7 days); // let interest accrue
        vm.prank(owner);
        uint256 back = vault.redeemFromYield(adapter, shares);
        assertEq(USDC.balanceOf(address(vault)), back, name);
        assertGe(back + 1, amount, name); // at most 1 unit of rounding

        console.log(name);
        console.log("  share decimals ", IERC4626(adapter).decimals());
        console.log("  $1000 after 7 days, in USDC units", back);
    }
}
