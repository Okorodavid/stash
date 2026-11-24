// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {StashEscrow} from "../src/StashEscrow.sol";

/// Deploys StashEscrow and allows one payment token on it. Same script for Base and BNB Chain:
///   forge script script/DeployEscrow.s.sol --rpc-url base_sepolia --broadcast --account deployer
///   forge script script/DeployEscrow.s.sol --rpc-url bsc_testnet --broadcast --account deployer
/// Env: ESCROW_OWNER (sets fees, tokens and roles; a multisig in production),
///      ESCROW_TREASURY (receives fees), ESCROW_ARBITER (settles disputes; keep it a separate key),
///      ESCROW_TOKEN (USDC on Base, USDT on BNB Chain; its decimals are read from the chain),
///      ESCROW_MIN_FEE_USD (whole dollars, default 1), ESCROW_CAP_USD (whole dollars per deal, default 5000).
/// The deployer owns the contract only long enough to allow the token, then hands it to ESCROW_OWNER,
/// who must call acceptOwnership().
contract DeployEscrow is Script {
    uint16 constant FEE_BPS = 250; // 2.5%
    uint32 constant DELIVER_WINDOW = 7 days;
    uint32 constant REVIEW_WINDOW = 3 days;

    function run() external returns (StashEscrow escrow) {
        address owner = vm.envAddress("ESCROW_OWNER");
        address treasury = vm.envAddress("ESCROW_TREASURY");
        address arbiter = vm.envAddress("ESCROW_ARBITER");
        address token = vm.envAddress("ESCROW_TOKEN");
        uint256 unit = 10 ** IERC20Metadata(token).decimals();
        uint128 minFee = uint128(vm.envOr("ESCROW_MIN_FEE_USD", uint256(1)) * unit);
        uint128 cap = uint128(vm.envOr("ESCROW_CAP_USD", uint256(5000)) * unit);

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        escrow = new StashEscrow(deployer, treasury, arbiter, FEE_BPS, DELIVER_WINDOW, REVIEW_WINDOW);
        escrow.setToken(token, true, minFee, cap);
        if (owner != deployer) escrow.transferOwnership(owner);
        vm.stopBroadcast();

        console.log("chain id    ", block.chainid);
        console.log("StashEscrow ", address(escrow));
        console.log("token       ", IERC20Metadata(token).symbol(), token);
        console.log("decimals    ", IERC20Metadata(token).decimals());
        console.log("owner       ", owner);
        console.log("arbiter     ", arbiter);
    }
}
