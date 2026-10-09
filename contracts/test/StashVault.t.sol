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
        factory = new StashFactory(address(this), treasury, 0, new address[](0));

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
        StashFactory f = new StashFactory(address(this), treasury, 0, targets);
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

    /// Yield shares gain value over time; the limits must count what they're worth, not $1 each.
    function test_Yield_SharesCountedAtUnderlyingValueForLimits() public {
        address[] memory targets = new address[](1);
        targets[0] = address(yieldVault);
        StashFactory f = new StashFactory(address(this), treasury, 0, targets);
        vm.prank(saver);
        StashVault v = StashVault(f.createVault(_guardians(), _policy(DAILY_LIMIT, LARGE, TIMELOCK)));
        usd.mint(address(v), 1_000 * USD);
        vm.prank(saver);
        v.depositToYield(address(yieldVault), 1_000 * USD);

        usd.mint(address(yieldVault), 1_000 * USD); // interest doubles the share price

        uint256 worth200 = yieldVault.convertToShares(200 * USD); // ~100 shares
        vm.prank(saver);
        vm.expectRevert(StashVault.DailyLimitExceeded.selector);
        v.withdraw(address(yieldVault), thief, worth200);

        uint256 worth99 = yieldVault.convertToShares(99 * USD);
        vm.prank(saver);
        v.withdraw(address(yieldVault), thief, worth99);
        assertApproxEqAbs(v.remainingDailyLimit(), 1e18, 1e13);
    }

    /// Shares left behind after a guardian removes an adapter keep their real value in the limits.
    function test_Yield_RemovedAdapterSharesStillValued() public {
        address[] memory targets = new address[](1);
        targets[0] = address(yieldVault);
        StashFactory f = new StashFactory(address(this), treasury, 0, targets);
        vm.prank(saver);
        StashVault v = StashVault(f.createVault(_guardians(), _policy(DAILY_LIMIT, LARGE, TIMELOCK)));
        usd.mint(address(v), 1_000 * USD);
        vm.prank(saver);
        v.depositToYield(address(yieldVault), 1_000 * USD);
        usd.mint(address(yieldVault), 1_000 * USD);

        vm.prank(guardian);
        v.removeYieldTarget(address(yieldVault));
        assertTrue(v.isYieldShare(address(yieldVault)));

        uint256 worth200 = yieldVault.convertToShares(200 * USD);
        vm.prank(saver);
        vm.expectRevert(StashVault.DailyLimitExceeded.selector);
        v.withdraw(address(yieldVault), thief, worth200);
    }

    // ------------------------------------------------------------------
    // Beta deposit cap (set on the factory; can only block new deposits)
    // ------------------------------------------------------------------

    function _cappedVault(uint256 capUsd) internal returns (StashFactory f, StashVault v) {
        f = new StashFactory(address(this), treasury, capUsd * 1e18, new address[](0));
        vm.prank(saver);
        v = StashVault(f.createVault(_guardians(), _policy(DAILY_LIMIT, LARGE, TIMELOCK)));
        usd.mint(saver, 10_000 * USD);
        vm.prank(saver);
        usd.approve(address(v), type(uint256).max);
    }

    function test_Cap_BlocksDepositsAboveCapAndFreesRoomOnWithdraw() public {
        (, StashVault v) = _cappedVault(500);
        vm.startPrank(saver);
        v.deposit(address(usd), 400 * USD);
        vm.expectRevert(StashVault.DepositCapExceeded.selector);
        v.deposit(address(usd), 200 * USD);

        v.withdraw(address(usd), stranger, 100 * USD); // sending money out frees room
        v.deposit(address(usd), 200 * USD);
        vm.stopPrank();
        assertEq(v.netDepositedUsd(), 500e18);
    }

    function test_Cap_AppliesToGoalDepositsAndAutoSave() public {
        (, StashVault v) = _cappedVault(500);
        vm.startPrank(saver);
        v.deposit(address(usd), 490 * USD);
        uint32 goalId = v.createGoal(address(usd), uint64(block.timestamp + 30 days), 0);
        vm.expectRevert(StashVault.DepositCapExceeded.selector);
        v.depositToGoal(goalId, 20 * USD);
        v.authorizeAutoSave(address(usd), 20 * USD, 1 days, 0); // saver pays itself
        vm.expectRevert(StashVault.DepositCapExceeded.selector);
        v.pullAutoSave(saver);
        vm.stopPrank();
    }

    function test_Cap_OnlyFactoryOwnerChangesItAndZeroMeansNoCap() public {
        (StashFactory f, StashVault v) = _cappedVault(500);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", stranger));
        f.setDepositCap(0);

        f.setDepositCap(0); // applies to existing vaults
        vm.prank(saver);
        v.deposit(address(usd), 5_000 * USD);
        assertEq(v.netDepositedUsd(), 5_000e18);
    }

    // ------------------------------------------------------------------
    // Waiting period: owners choose it, never below 24 hours
    // ------------------------------------------------------------------

    function test_RevertWhen_WaitingPeriodBelow24Hours() public {
        vm.prank(saver);
        vm.expectRevert(StashVault.InvalidPolicy.selector);
        factory.createVault(_guardians(), _policy(DAILY_LIMIT, LARGE, 23 hours));

        vm.prank(owner);
        vm.expectRevert(StashVault.InvalidPolicy.selector);
        vault.proposePolicy(_policy(DAILY_LIMIT, LARGE, 23 hours));
    }

    function test_WaitingPeriod_OwnerChoosesLongerAndLengtheningIsImmediate() public {
        vm.prank(saver);
        StashVault v = StashVault(factory.createVault(_guardians(), _policy(DAILY_LIMIT, LARGE, 72 hours)));
        (uint64 timelock,,) = v.policy();
        assertEq(timelock, 72 hours);

        vm.prank(owner);
        vault.proposePolicy(_policy(DAILY_LIMIT, LARGE, 7 days)); // tightening: applies now
        (timelock,,) = vault.policy();
        assertEq(timelock, 7 days);
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(address(usd), stranger, 1_000 * USD);
        (, uint64 unlockAt,,,) = vault.pendingWithdrawals(id);
        assertEq(unlockAt, block.timestamp + 7 days);
    }

    // ------------------------------------------------------------------
    // Owner key change (rescue after a leaked key)
    // ------------------------------------------------------------------

    function test_OwnerChange_OwnerAndGuardianAgreeThenWaits() public {
        address newKey = makeAddr("newKey");
        vm.prank(owner);
        vault.nominateOwner(newKey);
        assertEq(vault.pendingOwnerAt(), 0); // the owner key alone queues nothing

        vm.prank(guardian);
        vault.nominateOwner(newKey);
        assertEq(vault.pendingOwner(), newKey);
        assertEq(vault.pendingOwnerAt(), block.timestamp + TIMELOCK);

        vm.expectRevert(StashVault.StillLocked.selector);
        vault.applyOwnerChange();

        vm.warp(block.timestamp + TIMELOCK);
        vm.prank(stranger); // anyone can complete it
        vault.applyOwnerChange();
        assertEq(vault.owner(), newKey);
        assertEq(factory.vaultOf(newKey), address(vault));
        assertEq(factory.vaultOf(owner), address(0));

        vm.prank(owner);
        vm.expectRevert(StashVault.NotOwner.selector);
        vault.withdraw(address(usd), owner, 1 * USD); // the old key is useless
        vm.prank(newKey);
        vault.withdraw(address(usd), newKey, 1 * USD);
    }

    /// A thief with the owner key can't move the vault to their own key.
    function test_StolenKey_CannotMoveVaultAlone() public {
        vm.prank(owner); // thief holding the owner key
        vault.nominateOwner(thief);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(StashVault.NothingPending.selector);
        vault.applyOwnerChange();
        assertEq(vault.owner(), owner);
    }

    /// No guardian can take the vault: a guardian's nomination needs the owner key to agree.
    function test_OwnerChange_GuardianAloneCannotMoveVault() public {
        address guardianPick = makeAddr("guardianPick");
        vm.prank(guardian);
        vault.nominateOwner(guardianPick);
        vm.prank(stashGuardian); // even two guardians agreeing isn't enough
        vault.nominateOwner(guardianPick);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(StashVault.NothingPending.selector);
        vault.applyOwnerChange();
    }

    /// Leaked key: guardians freeze, the guardian names the user's new key, the user confirms with the
    /// old key. The thief (same key) can neither redirect nor cancel the move, and it completes while frozen.
    function test_LeakedKey_RescueToNewKey() public {
        address newKey = makeAddr("newKey");
        vm.prank(guardian);
        vault.freeze();
        vm.prank(guardian);
        vault.nominateOwner(newKey);
        vm.prank(owner); // the real user, with the old key
        vault.nominateOwner(newKey);
        assertEq(vault.pendingOwner(), newKey);

        vm.startPrank(owner); // the thief, with the same key
        vm.expectRevert(StashVault.OwnerChangePending.selector);
        vault.nominateOwner(thief);
        vm.expectRevert(StashVault.NotGuardian.selector);
        vault.cancelOwnerChange();
        vm.stopPrank();

        vm.warp(block.timestamp + TIMELOCK);
        vault.applyOwnerChange();
        assertEq(vault.owner(), newKey);
        assertTrue(vault.frozen()); // still frozen until the new key and a guardian unfreeze
        vm.prank(guardian);
        vault.approveUnfreeze();
        vm.prank(newKey);
        vault.unfreeze();
        vm.prank(newKey);
        vault.withdraw(address(usd), newKey, 50 * USD);
    }

    function test_OwnerChange_AnyEstablishedGuardianCancels() public {
        address newKey = makeAddr("newKey");
        vm.prank(stashGuardian);
        vault.nominateOwner(newKey);
        vm.prank(owner);
        vault.nominateOwner(newKey);
        vm.prank(guardian);
        vault.cancelOwnerChange();
        assertEq(vault.pendingOwnerAt(), 0);
        assertEq(vault.ownerNominee(), address(0)); // votes reset too
        vm.warp(block.timestamp + TIMELOCK);
        vm.expectRevert(StashVault.NothingPending.selector);
        vault.applyOwnerChange();
    }

    /// A guardian the thief just added can't vote for the thief's key or cancel a rescue.
    function test_StolenKey_PlantedGuardianCannotVoteOrCancel() public {
        vm.startPrank(owner); // thief
        vault.addGuardian(thiefGuardian);
        vault.nominateOwner(thief);
        vm.stopPrank();
        vm.prank(thiefGuardian);
        vm.expectRevert(StashVault.NotGuardian.selector);
        vault.nominateOwner(thief);

        address newKey = makeAddr("newKey");
        vm.prank(guardian);
        vault.nominateOwner(newKey);
        vm.prank(owner); // real user
        vault.nominateOwner(newKey);
        vm.prank(thiefGuardian);
        vm.expectRevert(StashVault.InvalidGuardian.selector);
        vault.cancelOwnerChange();
    }

    function test_RevertWhen_NewOwnerInvalid() public {
        vm.startPrank(owner);
        vm.expectRevert(StashVault.InvalidAddress.selector);
        vault.nominateOwner(guardian); // a guardian can't also be the owner
        vm.expectRevert(StashVault.InvalidAddress.selector);
        vault.nominateOwner(owner);
        vm.stopPrank();

        vm.prank(saver);
        factory.createVault(_guardians(), _policy(DAILY_LIMIT, LARGE, TIMELOCK));
        vm.prank(owner);
        vm.expectRevert(StashVault.InvalidAddress.selector);
        vault.nominateOwner(saver); // already owns a vault
    }

    function test_RevertWhen_FactoryEntryMovedByNonVault() public {
        vm.prank(stranger);
        vm.expectRevert(StashFactory.NotVault.selector);
        factory.vaultOwnerChanged(owner, stranger);
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
