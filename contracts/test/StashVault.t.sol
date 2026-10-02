// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StashFactory} from "../src/StashFactory.sol";
import {StashVault} from "../src/StashVault.sol";

contract MockUSD is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockYieldVault is ERC4626 {
    constructor(IERC20 asset_) ERC4626(asset_) ERC20("Mock Yield", "myUSD") {}
}

contract StashVaultTest is Test {
    uint256 constant USD = 1e6; // token units per dollar (6 decimals)
    uint128 constant DAILY_LIMIT = 100e18; // $100
    uint128 constant LARGE = 500e18; // $500
    uint64 constant TIMELOCK = 24 hours;

    StashFactory factory;
    StashVault vault;
    MockUSD usd;
    MockYieldVault yieldVault;

    address owner = makeAddr("owner");
    address guardian = makeAddr("guardian"); // e.g. the user's trusted person
    address stashGuardian = makeAddr("stashGuardian"); // Stash service guardian (on by default)
    address thiefGuardian = makeAddr("thiefGuardian");
    address treasury = makeAddr("treasury");
    address thief = makeAddr("thief");
    address saver = makeAddr("saver");
    address stranger = makeAddr("stranger");

    function setUp() public {
        usd = new MockUSD();
        yieldVault = new MockYieldVault(usd);
        factory = new StashFactory(address(this), treasury, new address[](0));

        vm.prank(owner);
        vault = StashVault(factory.createVault(_guardians(), _policy(DAILY_LIMIT, LARGE, TIMELOCK)));

        usd.mint(owner, 10_000 * USD);
        vm.startPrank(owner);
        usd.approve(address(vault), type(uint256).max);
        vault.deposit(address(usd), 10_000 * USD);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Factory
    // ------------------------------------------------------------------

    function test_Factory_PredictsAddressAndAllowsOneVaultPerOwner() public {
        assertEq(factory.predictVault(owner), address(vault));
        assertEq(factory.vaultOf(owner), address(vault));
        vm.prank(owner);
        vm.expectRevert(StashFactory.VaultExists.selector);
        factory.createVault(_guardians(), _policy(DAILY_LIMIT, LARGE, TIMELOCK));
    }

    function test_RevertWhen_CreatedWithoutGuardian() public {
        vm.prank(stranger);
        vm.expectRevert(StashVault.LastGuardian.selector);
        factory.createVault(new address[](0), _policy(DAILY_LIMIT, LARGE, TIMELOCK));
    }

    function test_RevertWhen_ImplementationInitialized() public {
        StashVault impl = StashVault(factory.implementation());
        vm.expectRevert();
        impl.initialize(owner, _guardians(), _policy(DAILY_LIMIT, LARGE, TIMELOCK), new address[](0));
    }

    // ------------------------------------------------------------------
    // Instant withdrawals and the daily allowance
    // ------------------------------------------------------------------

    function test_InstantWithdrawWithinLimit() public {
        vm.prank(owner);
        vault.withdraw(address(usd), thief, 60 * USD);
        assertEq(usd.balanceOf(thief), 60 * USD);
        assertEq(vault.remainingDailyLimit(), 40e18);
    }

    function test_RevertWhen_InstantWithdrawOverDailyLimit() public {
        vm.startPrank(owner);
        vault.withdraw(address(usd), thief, 100 * USD);
        vm.expectRevert(StashVault.DailyLimitExceeded.selector);
        vault.withdraw(address(usd), thief, 1 * USD);
        vm.stopPrank();
    }

    function test_RevertWhen_InstantWithdrawAboveLargeThreshold() public {
        vm.prank(owner);
        vm.expectRevert(StashVault.AboveLargeThreshold.selector);
        vault.withdraw(address(usd), thief, 500 * USD);
    }

    /// The headline guarantee: a thief holding the owner key gets the daily limit, then only
    /// a trickle (limit / 24 per hour), and can't double up around a "midnight reset".
    function test_StolenKey_CannotDrainBeyondDailyAllowance() public {
        vm.startPrank(owner); // thief has the owner key
        vault.withdraw(address(usd), thief, 100 * USD);

        vm.warp(block.timestamp + 1 minutes);
        vm.expectRevert(StashVault.DailyLimitExceeded.selector);
        vault.withdraw(address(usd), thief, 1 * USD);

        vm.warp(block.timestamp + 1 hours);
        assertLt(vault.remainingDailyLimit(), 5e18); // ~ $4.20 after an hour, not another $100
        vm.stopPrank();
    }

    function testFuzz_InstantWithdrawalsNeverExceedAllowance(uint64[6] memory amounts, uint32[6] memory gaps) public {
        uint256 total;
        uint256 elapsed;
        vm.startPrank(owner);
        for (uint256 i; i < 6; ++i) {
            uint256 gap = bound(gaps[i], 0, 4 hours);
            vm.warp(block.timestamp + gap);
            elapsed += gap;
            uint256 amount = bound(amounts[i], 1, 499 * USD);
            if (amount * 1e12 > vault.remainingDailyLimit()) {
                vm.expectRevert(StashVault.DailyLimitExceeded.selector);
                vault.withdraw(address(usd), thief, amount);
            } else {
                vault.withdraw(address(usd), thief, amount);
                total += amount;
            }
        }
        vm.stopPrank();
        // Bucket bound: one full limit up front plus refill at limit per 24h.
        assertLe(total * 1e12, DAILY_LIMIT + (uint256(DAILY_LIMIT) * elapsed) / 1 days);
    }

    // ------------------------------------------------------------------
    // Timelocked withdrawals
    // ------------------------------------------------------------------

    function test_LargeWithdrawal_WaitsForTimelock() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(address(usd), owner, 2_000 * USD);

        vm.prank(owner);
        vm.expectRevert(StashVault.StillLocked.selector);
        vault.executeWithdrawal(id);

        vm.warp(block.timestamp + TIMELOCK);
        vm.prank(owner);
        vault.executeWithdrawal(id);
        assertEq(usd.balanceOf(owner), 2_000 * USD);

        vm.prank(owner);
        vm.expectRevert(StashVault.UnknownWithdrawal.selector);
        vault.executeWithdrawal(id);
    }

    function test_Guardian_CancelsThiefsWithdrawal() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(address(usd), thief, 9_000 * USD);

        vm.prank(stashGuardian);
        vault.cancelWithdrawal(id);

        vm.warp(block.timestamp + TIMELOCK);
        vm.prank(owner);
        vm.expectRevert(StashVault.UnknownWithdrawal.selector);
        vault.executeWithdrawal(id);
        assertEq(usd.balanceOf(thief), 0);
    }

    function test_Guardian_CannotMoveFunds() public {
        vm.startPrank(guardian);
        vm.expectRevert(StashVault.NotOwner.selector);
        vault.withdraw(address(usd), guardian, 1 * USD);
        vm.expectRevert(StashVault.NotOwner.selector);
        vault.requestWithdrawal(address(usd), guardian, 1 * USD);
        vm.stopPrank();
    }

    function test_RevertWhen_StrangerCancels() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(address(usd), owner, 1_000 * USD);
        vm.prank(stranger);
        vm.expectRevert(StashVault.NotOwnerOrGuardian.selector);
        vault.cancelWithdrawal(id);
    }

    function test_ApproveWithdrawal_IsSignalOnlyAndDoesNotSkipTimelock() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(address(usd), owner, 1_000 * USD);
        vm.prank(guardian);
        vault.approveWithdrawal(id);
        (,,,, bool approved) = vault.pendingWithdrawals(id);
        assertTrue(approved);

        vm.prank(owner);
        vm.expectRevert(StashVault.StillLocked.selector);
        vault.executeWithdrawal(id);
    }

    /// Exit guarantee: if every guardian (incl. Stash) disappears, the owner can still withdraw
    /// everything: instantly up to the allowance, the rest after the timelock.
    function test_OwnerCanExitWithoutAnyGuardian() public {
        vm.startPrank(owner);
        uint256 id = vault.requestWithdrawal(address(usd), owner, 9_900 * USD);
        vault.withdraw(address(usd), owner, 99 * USD);
        vm.warp(block.timestamp + TIMELOCK);
        vault.executeWithdrawal(id);
        vm.stopPrank();
        assertEq(usd.balanceOf(owner), 9_999 * USD);
    }

    // ------------------------------------------------------------------
    // Freeze
    // ------------------------------------------------------------------

    function test_Freeze_BlocksWithdrawalsAndNeedsOwnerPlusGuardianToUnfreeze() public {
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(address(usd), thief, 1_000 * USD);

        vm.prank(stashGuardian); // any single guardian can press "Stop"
        vault.freeze();

        vm.warp(block.timestamp + TIMELOCK);
        vm.startPrank(owner);
        vm.expectRevert(StashVault.IsFrozen.selector);
        vault.withdraw(address(usd), thief, 1 * USD);
        vm.expectRevert(StashVault.IsFrozen.selector);
        vault.executeWithdrawal(id);
        vm.expectRevert(StashVault.NotAllowed.selector);
        vault.unfreeze(); // owner key alone can't undo a freeze
        vm.stopPrank();

        vm.prank(guardian);
        vault.approveUnfreeze();
        vm.prank(owner);
        vault.unfreeze();
        assertFalse(vault.frozen());
    }

    function test_RevertWhen_GuardianUnfreezesAlone() public {
        vm.prank(guardian);
        vault.freeze();
        vm.prank(guardian);
        vault.approveUnfreeze();
        vm.prank(guardian);
        vm.expectRevert(StashVault.NotOwner.selector);
        vault.unfreeze();
    }

    /// Thief holds the owner key, adds their own guardian, and tries to use it to undo the freeze.
    function test_StolenKey_CannotPlantGuardianToUnfreeze() public {
        vm.prank(owner);
        vault.addGuardian(thiefGuardian);

        vm.prank(guardian);
        vault.freeze();

        vm.prank(thiefGuardian); // too new to count for unfreezing
        vm.expectRevert(StashVault.InvalidGuardian.selector);
        vault.approveUnfreeze();

        vm.prank(guardian); // a real guardian sees the "guardian added" alert and vetoes it
        vault.vetoGuardian(thiefGuardian);
        assertEq(vault.guardianEstablishedAt(thiefGuardian), 0);

        vm.warp(block.timestamp + TIMELOCK);
        vm.prank(thiefGuardian);
        vm.expectRevert(StashVault.NotGuardian.selector);
        vault.approveUnfreeze();
    }

    // ------------------------------------------------------------------
    // Guardians
    // ------------------------------------------------------------------

    function test_NewGuardian_CanCancelAndFreezeImmediately() public {
        address secondPhone = makeAddr("secondPhone");
        vm.prank(stranger);
        vm.expectRevert(StashVault.NotOwner.selector);
        vault.addGuardian(secondPhone);

        vm.prank(owner);
        vault.addGuardian(secondPhone);
        assertEq(vault.guardians().length, 3);

        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(address(usd), thief, 1_000 * USD);
        vm.prank(secondPhone);
        vault.cancelWithdrawal(id);
        vm.prank(secondPhone);
        vault.freeze();
        assertTrue(vault.frozen());
    }

    function test_RevertWhen_MoreThanThreeGuardiansOrDuplicate() public {
        vm.startPrank(owner);
        vault.addGuardian(makeAddr("third"));
        vm.expectRevert(StashVault.TooManyGuardians.selector);
        vault.addGuardian(makeAddr("fourth"));
        vm.expectRevert(StashVault.InvalidGuardian.selector);
        vault.addGuardian(guardian);
        vm.stopPrank();
    }

    /// Thief tries to remove the user's trusted person; another guardian cancels it.
    function test_StolenKey_CannotRemoveGuardian() public {
        vm.prank(owner);
        vault.proposeGuardianRemoval(guardian);

        vm.prank(owner);
        vm.expectRevert(StashVault.StillLocked.selector);
        vault.applyGuardianRemoval(guardian);

        vm.prank(stashGuardian);
        vault.cancelGuardianRemoval(guardian);

        vm.warp(block.timestamp + TIMELOCK);
        vm.prank(owner);
        vm.expectRevert(StashVault.NothingPending.selector);
        vault.applyGuardianRemoval(guardian);
        assertGt(vault.guardianEstablishedAt(guardian), 0);
    }

    function test_GuardianRemoval_AfterTimelockButNeverTheLast() public {
        vm.prank(owner);
        vault.proposeGuardianRemoval(stashGuardian);
        vm.warp(block.timestamp + TIMELOCK);
        vm.prank(owner);
        vault.applyGuardianRemoval(stashGuardian);
        assertEq(vault.guardians().length, 1);

        vm.prank(owner);
        vm.expectRevert(StashVault.LastGuardian.selector);
        vault.proposeGuardianRemoval(guardian);
    }

    // ------------------------------------------------------------------
    // Policy changes
    // ------------------------------------------------------------------

    function test_LooseningPolicy_IsTimelocked() public {
        vm.prank(owner);
        vault.proposePolicy(_policy(10_000e18, 20_000e18, TIMELOCK));

        (, uint128 dailyLimit,) = vault.policy();
        assertEq(dailyLimit, DAILY_LIMIT); // unchanged for now

        vm.prank(owner);
        vm.expectRevert(StashVault.StillLocked.selector);
        vault.applyPolicy();

        vm.warp(block.timestamp + TIMELOCK);
        vm.prank(owner);
        vault.applyPolicy();
        (, dailyLimit,) = vault.policy();
        assertEq(dailyLimit, 10_000e18);
    }

    function test_TighteningPolicy_AppliesImmediately() public {
        vm.prank(owner);
        vault.proposePolicy(_policy(50e18, 200e18, 48 hours));
        (uint64 timelock, uint128 dailyLimit,) = vault.policy();
        assertEq(dailyLimit, 50e18);
        assertEq(timelock, 48 hours);
    }

    function test_StolenKey_LooseningBlockedWhileFrozen() public {
        vm.prank(owner);
        vault.proposePolicy(_policy(10_000e18, LARGE, TIMELOCK));
        vm.prank(guardian);
        vault.freeze();
        vm.warp(block.timestamp + TIMELOCK);
        vm.prank(owner);
        vm.expectRevert(StashVault.IsFrozen.selector);
        vault.applyPolicy();
    }

    function test_Guardian_CancelsPolicyProposal() public {
        vm.prank(owner);
        vault.proposePolicy(_policy(10_000e18, LARGE, TIMELOCK));
        vm.prank(guardian);
        vault.cancelPolicy();
        vm.warp(block.timestamp + TIMELOCK);
        vm.prank(owner);
        vm.expectRevert(StashVault.NothingPending.selector);
        vault.applyPolicy();
    }

    function test_RevertWhen_PolicyInvalid() public {
        vm.prank(owner);
        vm.expectRevert(StashVault.InvalidPolicy.selector);
        vault.proposePolicy(_policy(DAILY_LIMIT, LARGE, 10 minutes)); // timelock too short
    }

    // ------------------------------------------------------------------
    // Savings goals
    // ------------------------------------------------------------------

    function test_Goal_LocksFundsAndChargesEarlyBreakFee() public {
        vm.startPrank(owner);
        uint32 id = vault.createGoal(address(usd), uint64(block.timestamp + 30 days), 500); // 5%
        vault.fundGoal(id, 9_500 * USD);
        assertEq(vault.available(address(usd)), 500 * USD);

        // Locked funds can't be queued out either.
        uint256 wid = vault.requestWithdrawal(address(usd), owner, 1_000 * USD);
        vm.warp(block.timestamp + TIMELOCK);
        vm.expectRevert(StashVault.InsufficientAvailable.selector);
        vault.executeWithdrawal(wid);

        vault.releaseGoal(id);
        vm.stopPrank();

        assertEq(usd.balanceOf(treasury), 475 * USD); // 5% of 9,500
        assertEq(vault.available(address(usd)), 10_000 * USD - 475 * USD);
    }

    function test_Goal_NoFeeAfterMaturity() public {
        vm.startPrank(owner);
        uint32 id = vault.createGoal(address(usd), uint64(block.timestamp + 30 days), 500);
        vault.fundGoal(id, 1_000 * USD);
        vm.warp(block.timestamp + 30 days);
        vault.releaseGoal(id);
        vm.stopPrank();
        assertEq(usd.balanceOf(treasury), 0);
        assertEq(vault.available(address(usd)), 10_000 * USD);
    }

    function test_RevertWhen_GoalFeeTooHigh() public {
        vm.prank(owner);
        vm.expectRevert(StashVault.InvalidGoal.selector);
        vault.createGoal(address(usd), uint64(block.timestamp + 1 days), 1_001);
    }

    // ------------------------------------------------------------------
    // Auto-save
    // ------------------------------------------------------------------

    function test_AutoSave_PullsOncePerIntervalWithoutCatchUp() public {
        vm.prank(owner);
        uint32 goalId = vault.createGoal(address(usd), uint64(block.timestamp + 90 days), 0);

        usd.mint(saver, 1_000 * USD);
        vm.startPrank(saver);
        usd.approve(address(vault), type(uint256).max);
        vault.authorizeAutoSave(address(usd), 5 * USD, 1 days, goalId);
        vm.stopPrank();

        vm.prank(stranger); // anyone can trigger a due pull
        vault.pullAutoSave(saver);
        assertEq(usd.balanceOf(saver), 995 * USD);

        vm.expectRevert(StashVault.AutoSaveNotDue.selector);
        vault.pullAutoSave(saver);

        vm.warp(block.timestamp + 3 days); // worker was down for 3 days
        vault.pullAutoSave(saver);
        vm.expectRevert(StashVault.AutoSaveNotDue.selector);
        vault.pullAutoSave(saver); // no catch-up burst

        assertEq(usd.balanceOf(saver), 990 * USD);
        (,,, uint128 locked) = vault.goals(goalId);
        assertEq(locked, 10 * USD);
    }

    function test_AutoSave_RevokedByOwnerOrSource() public {
        usd.mint(saver, 100 * USD);
        vm.startPrank(saver);
        usd.approve(address(vault), type(uint256).max);
        vault.authorizeAutoSave(address(usd), 5 * USD, 1 days, 0);
        vm.stopPrank();

        vm.prank(stranger);
        vm.expectRevert(StashVault.NotAllowed.selector);
        vault.revokeAutoSave(saver);

        vm.prank(owner);
        vault.revokeAutoSave(saver);
        vm.expectRevert(StashVault.AutoSaveInactive.selector);
        vault.pullAutoSave(saver);
    }

    function test_AutoSave_CannotPullFromWalletThatDidNotOptIn() public {
        usd.mint(stranger, 100 * USD);
        vm.prank(stranger);
        usd.approve(address(vault), type(uint256).max); // approval alone is not consent
        vm.expectRevert(StashVault.AutoSaveInactive.selector);
        vault.pullAutoSave(stranger);
    }

    // ------------------------------------------------------------------
    // Yield adapters (the only place the vault ever approves a spender)
    // ------------------------------------------------------------------

    function test_Yield_AdapterIsTimelockedThenDepositAndRedeem() public {
        vm.startPrank(owner);
        vm.expectRevert(StashVault.NotYieldTarget.selector);
        vault.depositToYield(address(yieldVault), 1_000 * USD);

        vault.proposeYieldTarget(address(yieldVault));
        vm.expectRevert(StashVault.StillLocked.selector);
        vault.activateYieldTarget(address(yieldVault));

        vm.warp(block.timestamp + TIMELOCK);
        vault.activateYieldTarget(address(yieldVault));
        uint256 shares = vault.depositToYield(address(yieldVault), 1_000 * USD);
        assertEq(usd.balanceOf(address(vault)), 9_000 * USD);
        assertEq(usd.allowance(address(vault), address(yieldVault)), 0); // no lingering approval

        vault.redeemFromYield(address(yieldVault), shares);
        vm.stopPrank();
        assertEq(usd.balanceOf(address(vault)), 10_000 * USD);
    }

    function test_Yield_FactoryDefaultAdapterIsAllowedFromStart() public {
        address[] memory targets = new address[](1);
        targets[0] = address(yieldVault);
        StashFactory f = new StashFactory(address(this), treasury, targets);
        vm.prank(saver);
        StashVault v = StashVault(f.createVault(_guardians(), _policy(DAILY_LIMIT, LARGE, TIMELOCK)));
        assertTrue(v.isYieldTarget(address(yieldVault)));
    }

    /// A thief proposes a fake "yield vault" that would swallow funds; a guardian removes it.
    function test_StolenKey_CannotAddYieldAdapterPastGuardian() public {
        vm.prank(owner);
        vault.proposeYieldTarget(thief);
        vm.prank(guardian);
        vault.removeYieldTarget(thief);
        vm.warp(block.timestamp + TIMELOCK);
        vm.prank(owner);
        vm.expectRevert(StashVault.NothingPending.selector);
        vault.activateYieldTarget(thief);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _policy(uint128 dailyLimit, uint128 large, uint64 timelock) internal pure returns (StashVault.Policy memory) {
        return StashVault.Policy({timelock: timelock, dailyLimit: dailyLimit, largeThreshold: large});
    }

    function _guardians() internal view returns (address[] memory g) {
        g = new address[](2);
        g[0] = guardian;
        g[1] = stashGuardian;
    }
}
