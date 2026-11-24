// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {StashEscrow} from "../src/StashEscrow.sol";
import {DeployEscrow} from "../script/DeployEscrow.s.sol";

contract MockToken is ERC20 {
    uint8 immutable _decimals;

    constructor(string memory name_, uint8 decimals_) ERC20(name_, name_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Refuses transfers to frozen addresses, like USDC and USDT can.
contract FreezableToken is MockToken {
    mapping(address => bool) public frozen;

    constructor() MockToken("FRZ", 6) {}

    function freeze(address who, bool on) external {
        frozen[who] = on;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!frozen[to], "frozen");
        super._update(from, to, value);
    }
}

/// Keeps 1% of every transfer, like some tokens do.
contract TaxToken is MockToken {
    constructor() MockToken("TAX", 18) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) return super._update(from, to, value);
        uint256 cut = value / 100;
        super._update(from, address(0xdead), cut);
        super._update(from, to, value - cut);
    }
}

contract StashEscrowTest is Test {
    uint16 constant FEE_BPS = 250; // 2.5%
    uint32 constant DELIVER = 7 days;
    uint32 constant REVIEW = 3 days;
    bytes32 constant META = keccak256("listing");
    bytes32 constant FILE = keccak256("final file");

    StashEscrow escrow;
    MockToken usdc; // 6 decimals, like USDC on Base
    MockToken usdt; // 18 decimals, like USDT on BNB Chain

    address admin = makeAddr("admin");
    address treasury = makeAddr("treasury");
    address arbiter = makeAddr("arbiter");
    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");
    address stranger = makeAddr("stranger");

    function setUp() public {
        escrow = new StashEscrow(admin, treasury, arbiter, FEE_BPS, DELIVER, REVIEW);
        usdc = new MockToken("USDC", 6);
        usdt = new MockToken("USDT", 18);
        vm.startPrank(admin);
        escrow.setToken(address(usdc), true, 1e6, 5_000e6); // $1 minimum fee, $5,000 cap
        escrow.setToken(address(usdt), true, 1e18, 5_000e18);
        vm.stopPrank();
        for (uint256 i; i < 2; i++) {
            MockToken t = i == 0 ? usdc : usdt;
            t.mint(buyer, 1_000_000 * 10 ** t.decimals());
            vm.prank(buyer);
            t.approve(address(escrow), type(uint256).max);
        }
    }

    // ------------------------------------------------------------- helpers

    function _list(MockToken t, uint128 price) internal returns (uint256 id) {
        vm.prank(seller);
        id = escrow.list(address(t), price, type(uint128).max, META);
    }

    function _funded(MockToken t, uint128 price) internal returns (uint256 dealId) {
        uint256 listingId = _list(t, price);
        vm.prank(buyer);
        dealId = escrow.buy(listingId);
    }

    function _delivered(MockToken t, uint128 price) internal returns (uint256 dealId) {
        dealId = _funded(t, price);
        vm.prank(seller);
        escrow.deliver(dealId, FILE);
    }

    function _disputed(MockToken t, uint128 price) internal returns (uint256 dealId) {
        dealId = _delivered(t, price);
        vm.prank(buyer);
        escrow.dispute(dealId);
    }

    function _state(uint256 dealId) internal view returns (StashEscrow.State s) {
        (,,,,,,,,, s,,) = escrow.deals(dealId);
    }

    /// The escrow must hold nothing once every deal on a token has ended.
    function _assertEmpty(MockToken t) internal view {
        assertEq(t.balanceOf(address(escrow)), 0, "escrow still holds money");
    }

    // ---------------------------------------------------------- happy path

    function test_BuyerApproves_SellerPaidLessFee() public {
        uint256 dealId = _delivered(usdc, 400e6);
        assertEq(usdc.balanceOf(address(escrow)), 400e6);
        vm.prank(buyer);
        escrow.release(dealId);
        assertEq(usdc.balanceOf(seller), 390e6); // 2.5% of $400 is $10
        assertEq(usdc.balanceOf(treasury), 10e6);
        assertEq(uint8(_state(dealId)), uint8(StashEscrow.State.Released));
        _assertEmpty(usdc);
    }

    function test_SmallDeal_PaysTheMinimumFee() public {
        uint256 dealId = _delivered(usdc, 12e6); // 2.5% would be $0.30
        vm.prank(buyer);
        escrow.release(dealId);
        assertEq(usdc.balanceOf(seller), 11e6);
        assertEq(usdc.balanceOf(treasury), 1e6);
    }

    function test_EighteenDecimalToken_SameMaths() public {
        uint256 dealId = _delivered(usdt, 400e18);
        vm.prank(buyer);
        escrow.release(dealId);
        assertEq(usdt.balanceOf(seller), 390e18);
        assertEq(usdt.balanceOf(treasury), 10e18);
        _assertEmpty(usdt);
    }

    function test_BuyerCanApproveBeforeDelivery() public {
        uint256 dealId = _funded(usdc, 40e6);
        vm.prank(buyer);
        escrow.release(dealId);
        assertEq(usdc.balanceOf(seller), 39e6);
    }

    function test_OneListing_ManyBuyers() public {
        uint256 listingId = _list(usdc, 40e6);
        vm.startPrank(buyer);
        uint256 a = escrow.buy(listingId);
        uint256 b = escrow.buy(listingId);
        vm.stopPrank();
        assertTrue(a != b);
        assertEq(usdc.balanceOf(address(escrow)), 80e6);
    }

    // ------------------------------------------------- silence and timeouts

    function test_BuyerSilent_SellerClaimsAfterReviewWindow() public {
        uint256 dealId = _delivered(usdc, 40e6);
        vm.warp(block.timestamp + REVIEW - 1);
        vm.expectRevert(StashEscrow.TooEarly.selector);
        escrow.claim(dealId);
        vm.warp(block.timestamp + 1);
        vm.prank(stranger); // anyone may trigger it; the money still goes to the seller
        escrow.claim(dealId);
        assertEq(usdc.balanceOf(seller), 39e6);
        assertEq(usdc.balanceOf(stranger), 0);
        _assertEmpty(usdc);
    }

    function test_ClaimNeedsDelivery() public {
        uint256 dealId = _funded(usdc, 40e6);
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.claim(dealId);
    }

    function test_SellerNeverDelivers_BuyerRefundsAfterDeadline() public {
        uint256 dealId = _funded(usdc, 40e6);
        uint256 start = usdc.balanceOf(buyer);
        vm.warp(block.timestamp + DELIVER);
        vm.prank(buyer);
        vm.expectRevert(StashEscrow.TooEarly.selector);
        escrow.refund(dealId);
        vm.warp(block.timestamp + 1);
        vm.prank(buyer);
        escrow.refund(dealId);
        assertEq(usdc.balanceOf(buyer), start + 40e6); // in full: no fee on a refund
        assertEq(usdc.balanceOf(treasury), 0);
        _assertEmpty(usdc);
    }

    function test_BuyerCannotRefundOnceDelivered() public {
        uint256 dealId = _delivered(usdc, 40e6);
        vm.warp(block.timestamp + DELIVER + 1);
        vm.prank(buyer);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.refund(dealId);
    }

    function test_LateDeliveryStillCounts_IfBuyerHasNotRefunded() public {
        uint256 dealId = _funded(usdc, 40e6);
        vm.warp(block.timestamp + DELIVER + 1 days);
        vm.prank(seller);
        escrow.deliver(dealId, FILE);
        assertEq(uint8(_state(dealId)), uint8(StashEscrow.State.Delivered));
    }

    function test_SellerCanRefundAtEveryOpenStage() public {
        uint256 a = _funded(usdc, 40e6);
        uint256 b = _delivered(usdc, 40e6);
        uint256 c = _disputed(usdc, 40e6);
        uint256 start = usdc.balanceOf(buyer);
        vm.startPrank(seller);
        escrow.refund(a);
        escrow.refund(b);
        escrow.refund(c);
        vm.stopPrank();
        assertEq(usdc.balanceOf(buyer), start + 120e6);
        assertEq(usdc.balanceOf(seller), 0);
        _assertEmpty(usdc);
    }

    // ------------------------------------------------------------- disputes

    function test_DisputeOnlyInsideReviewWindow() public {
        uint256 dealId = _delivered(usdc, 40e6);
        vm.warp(block.timestamp + REVIEW);
        vm.prank(buyer);
        vm.expectRevert(StashEscrow.TooLate.selector);
        escrow.dispute(dealId);
    }

    function test_DisputeBlocksClaimAndRelease() public {
        uint256 dealId = _disputed(usdc, 40e6);
        vm.warp(block.timestamp + REVIEW + 1);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.claim(dealId);
        vm.prank(buyer);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.release(dealId);
    }

    function test_ArbiterRulesForSeller() public {
        uint256 dealId = _disputed(usdc, 400e6);
        vm.prank(arbiter);
        escrow.rule(dealId, true);
        assertEq(usdc.balanceOf(seller), 390e6);
        assertEq(usdc.balanceOf(treasury), 10e6);
        _assertEmpty(usdc);
    }

    function test_ArbiterRulesForBuyer_NoFee() public {
        uint256 dealId = _disputed(usdc, 400e6);
        uint256 start = usdc.balanceOf(buyer);
        vm.prank(arbiter);
        escrow.rule(dealId, false);
        assertEq(usdc.balanceOf(buyer), start + 400e6);
        assertEq(usdc.balanceOf(treasury), 0);
        _assertEmpty(usdc);
    }

    function test_ArbiterActsOnlyOnDisputedDeals() public {
        uint256 funded = _funded(usdc, 40e6);
        uint256 delivered = _delivered(usdc, 40e6);
        vm.startPrank(arbiter);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.rule(funded, false);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.rule(delivered, true);
        vm.stopPrank();
    }

    function test_OnlyArbiterRules_NotEvenTheOwner() public {
        uint256 dealId = _disputed(usdc, 40e6);
        address[4] memory others = [admin, seller, buyer, stranger];
        for (uint256 i; i < others.length; i++) {
            vm.prank(others[i]);
            vm.expectRevert(StashEscrow.NotArbiter.selector);
            escrow.rule(dealId, true);
        }
    }

    function test_UnruledDisputeGoesBackToBuyer() public {
        uint256 dealId = _disputed(usdc, 40e6);
        uint256 start = usdc.balanceOf(buyer);
        vm.warp(block.timestamp + 30 days - 1);
        vm.expectRevert(StashEscrow.TooEarly.selector);
        escrow.expireDispute(dealId);
        vm.warp(block.timestamp + 1);
        vm.prank(stranger);
        escrow.expireDispute(dealId);
        assertEq(usdc.balanceOf(buyer), start + 40e6);
        _assertEmpty(usdc);
    }

    // ---------------------------------------------------- nobody pays twice

    function test_FinishedDealCannotBePaidAgain() public {
        uint256 dealId = _delivered(usdc, 40e6);
        _funded(usdc, 40e6); // a second deal's money sits in the contract, ready to be stolen by a double pay
        vm.prank(buyer);
        escrow.release(dealId);

        vm.prank(buyer);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.release(dealId);
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.claim(dealId);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.expireDispute(dealId);
        vm.prank(seller);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.refund(dealId);
        vm.prank(arbiter);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.rule(dealId, false);
        vm.prank(seller);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.deliver(dealId, FILE);
        assertEq(usdc.balanceOf(address(escrow)), 40e6); // the other deal is untouched
    }

    // --------------------------------------------------------- wrong caller

    function test_WrongCallers() public {
        uint256 dealId = _funded(usdc, 40e6);
        vm.prank(stranger);
        vm.expectRevert(StashEscrow.NotSeller.selector);
        escrow.deliver(dealId, FILE);
        vm.prank(seller);
        vm.expectRevert(StashEscrow.NotBuyer.selector);
        escrow.release(dealId);
        vm.prank(stranger);
        vm.expectRevert(StashEscrow.NotBuyer.selector);
        escrow.refund(dealId);
        vm.prank(seller);
        escrow.deliver(dealId, FILE);
        vm.prank(seller);
        vm.expectRevert(StashEscrow.NotBuyer.selector);
        escrow.dispute(dealId);
    }

    function test_DealThatDoesNotExist() public {
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.claim(99);
        vm.expectRevert(StashEscrow.WrongState.selector);
        escrow.expireDispute(99);
        vm.prank(buyer);
        vm.expectRevert(StashEscrow.NotBuyer.selector);
        escrow.release(99);
    }

    // ------------------------------------------------------------- listings

    function test_ListingRules() public {
        vm.startPrank(seller);
        vm.expectRevert(StashEscrow.TokenNotAllowed.selector);
        escrow.list(makeAddr("other token"), 40e6, type(uint128).max, META);
        vm.expectRevert(StashEscrow.BadPrice.selector);
        escrow.list(address(usdc), 1e6, type(uint128).max, META); // the fee would eat all of it
        vm.expectRevert(StashEscrow.BadPrice.selector);
        escrow.list(address(usdc), 5_000e6 + 1, type(uint128).max, META); // over the beta cap
        escrow.list(address(usdc), 5_000e6, type(uint128).max, META);
        vm.stopPrank();
    }

    function test_DelistStopsNewDealsOnly() public {
        uint256 listingId = _list(usdc, 40e6);
        vm.prank(buyer);
        uint256 dealId = escrow.buy(listingId);
        vm.prank(stranger);
        vm.expectRevert(StashEscrow.NotSeller.selector);
        escrow.delist(listingId);
        vm.prank(seller);
        escrow.delist(listingId);
        vm.prank(buyer);
        vm.expectRevert(StashEscrow.NotListed.selector);
        escrow.buy(listingId);
        vm.prank(buyer);
        escrow.release(dealId); // the open deal still completes
        assertEq(usdc.balanceOf(seller), 39e6);
    }

    function test_SellerCannotBuyOwnListing() public {
        uint256 listingId = _list(usdc, 40e6);
        vm.prank(seller);
        vm.expectRevert(StashEscrow.OwnListing.selector);
        escrow.buy(listingId);
    }

    function test_TokenThatTakesACutIsRefused() public {
        TaxToken tax = new TaxToken();
        vm.prank(admin);
        escrow.setToken(address(tax), true, 1e18, 5_000e18);
        tax.mint(buyer, 100e18);
        vm.prank(seller);
        uint256 listingId = escrow.list(address(tax), 40e18, type(uint128).max, META);
        vm.startPrank(buyer);
        tax.approve(address(escrow), type(uint256).max);
        vm.expectRevert(StashEscrow.ShortPayment.selector);
        escrow.buy(listingId);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- owner

    function test_DealKeepsTheTermsItWasFundedUnder() public {
        uint256 dealId = _delivered(usdc, 400e6);
        vm.prank(admin);
        escrow.setTerms(500, 1 days, 30 days); // fee doubled, review window stretched
        vm.warp(block.timestamp + REVIEW);
        escrow.claim(dealId); // still the 3-day window
        assertEq(usdc.balanceOf(treasury), 10e6); // still 2.5%
    }

    /// The owner cannot change a seller's terms after they listed: not the fee rate, the minimum fee or the windows.
    function test_ListingKeepsTheTermsItWasMadeUnder() public {
        uint256 listingId = _list(usdc, 40e6);
        vm.startPrank(admin);
        escrow.setTerms(500, 1 days, 30 days);
        escrow.setToken(address(usdc), true, 39e6, 5_000e6); // a minimum fee that would take nearly all of it
        vm.stopPrank();
        vm.prank(buyer);
        uint256 dealId = escrow.buy(listingId);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(buyer);
        vm.expectRevert(StashEscrow.TooEarly.selector); // still a 7-day delivery deadline
        escrow.refund(dealId);
        vm.prank(seller);
        escrow.deliver(dealId, FILE);
        vm.warp(block.timestamp + REVIEW);
        escrow.claim(dealId); // still a 3-day review
        assertEq(usdc.balanceOf(seller), 39e6); // still a $1 fee
        assertEq(usdc.balanceOf(treasury), 1e6);
    }

    function test_TermsAreCapped() public {
        vm.startPrank(admin);
        vm.expectRevert(StashEscrow.BadTerms.selector);
        escrow.setTerms(501, DELIVER, REVIEW);
        vm.expectRevert(StashEscrow.BadTerms.selector);
        escrow.setTerms(FEE_BPS, 1 days - 1, REVIEW);
        vm.expectRevert(StashEscrow.BadTerms.selector);
        escrow.setTerms(FEE_BPS, DELIVER, 30 days + 1);
        vm.stopPrank();
    }

    function test_PauseBlocksNewBusinessOnly() public {
        uint256 listingId = _list(usdc, 40e6);
        uint256 dealId = _delivered(usdc, 40e6);
        vm.prank(admin);
        escrow.setPaused(true);
        vm.prank(seller);
        vm.expectRevert(StashEscrow.Paused.selector);
        escrow.list(address(usdc), 40e6, type(uint128).max, META);
        vm.prank(buyer);
        vm.expectRevert(StashEscrow.Paused.selector);
        escrow.buy(listingId);
        vm.prank(buyer);
        escrow.release(dealId); // money already here can always leave
        assertEq(usdc.balanceOf(seller), 39e6);
    }

    function test_RemovedTokenBlocksNewDeals_OpenOnesFinish() public {
        uint256 listingId = _list(usdc, 40e6);
        uint256 dealId = _delivered(usdc, 40e6);
        vm.prank(admin);
        escrow.setToken(address(usdc), false, 0, 0);
        vm.prank(buyer);
        vm.expectRevert(StashEscrow.TokenNotAllowed.selector);
        escrow.buy(listingId);
        vm.prank(buyer);
        escrow.release(dealId);
        assertEq(usdc.balanceOf(seller), 39e6);
    }

    /// A fee rise that lands just before a seller lists cannot take more than the seller agreed to.
    function test_SellerSetsTheMostTheyWillPayInFees() public {
        vm.prank(admin);
        escrow.setToken(address(usdc), true, 39e6, 5_000e6); // the owner jumps the minimum fee to $39
        vm.startPrank(seller);
        vm.expectRevert(StashEscrow.FeeTooHigh.selector);
        escrow.list(address(usdc), 40e6, 1e6, META); // the seller expected $1
        vm.stopPrank();
        vm.prank(admin);
        escrow.setToken(address(usdc), true, 1e6, 5_000e6);
        vm.prank(seller);
        escrow.list(address(usdc), 40e6, 1e6, META);
    }

    // ------------------------------------------------- tokens that can freeze

    function _freezable() internal returns (FreezableToken t) {
        t = new FreezableToken();
        vm.prank(admin);
        escrow.setToken(address(t), true, 1e6, 5_000e6);
        t.mint(buyer, 1_000e6);
        vm.prank(buyer);
        t.approve(address(escrow), type(uint256).max);
    }

    /// A frozen seller cannot be paid, but the buyer's money is not trapped by it.
    function test_FrozenSeller_BuyerStillGetsOut() public {
        FreezableToken t = _freezable();
        uint256 undelivered = _funded(t, 40e6);
        uint256 disputed = _disputed(t, 40e6);
        t.freeze(seller, true);
        vm.prank(buyer);
        vm.expectRevert("frozen");
        escrow.release(undelivered);
        vm.warp(block.timestamp + DELIVER + 1);
        vm.prank(buyer);
        escrow.refund(undelivered); // deadline passed: back to the buyer
        vm.prank(arbiter);
        escrow.rule(disputed, false); // the arbiter can still send it back
        assertEq(t.balanceOf(buyer), 1_000e6);
        assertEq(t.balanceOf(address(escrow)), 0);
    }

    /// A frozen treasury holds up seller payouts only until the owner names a new one.
    function test_FrozenTreasury_FixedByNamingANewOne() public {
        FreezableToken t = _freezable();
        uint256 dealId = _delivered(t, 40e6);
        t.freeze(treasury, true);
        vm.prank(buyer);
        vm.expectRevert("frozen");
        escrow.release(dealId);
        address treasury2 = makeAddr("treasury2");
        vm.prank(admin);
        escrow.setTreasury(treasury2);
        vm.prank(buyer);
        escrow.release(dealId);
        assertEq(t.balanceOf(seller), 39e6);
        assertEq(t.balanceOf(treasury2), 1e6);
    }

    /// A frozen buyer cannot be refunded, but the seller who delivered still gets paid.
    function test_FrozenBuyer_SellerStillGetsPaid() public {
        FreezableToken t = _freezable();
        uint256 dealId = _delivered(t, 40e6);
        t.freeze(buyer, true);
        vm.prank(seller);
        vm.expectRevert("frozen");
        escrow.refund(dealId);
        vm.warp(block.timestamp + REVIEW);
        escrow.claim(dealId);
        assertEq(t.balanceOf(seller), 39e6);
    }

    function test_LoweredCapStopsNewDealsOnBiggerListings() public {
        uint256 listingId = _list(usdc, 400e6);
        vm.prank(admin);
        escrow.setToken(address(usdc), true, 1e6, 100e6);
        vm.prank(buyer);
        vm.expectRevert(StashEscrow.BadPrice.selector);
        escrow.buy(listingId);
    }

    function test_OnlyOwnerAdministers() public {
        vm.startPrank(stranger);
        bytes memory denied = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger);
        vm.expectRevert(denied);
        escrow.setToken(address(usdc), true, 1, 2);
        vm.expectRevert(denied);
        escrow.setTerms(0, DELIVER, REVIEW);
        vm.expectRevert(denied);
        escrow.setTreasury(stranger);
        vm.expectRevert(denied);
        escrow.setArbiter(stranger);
        vm.expectRevert(denied);
        escrow.setPaused(true);
        vm.stopPrank();
    }

    function test_NewTreasuryAndArbiterTakeEffect() public {
        address treasury2 = makeAddr("treasury2");
        address arbiter2 = makeAddr("arbiter2");
        uint256 dealId = _disputed(usdc, 400e6);
        vm.startPrank(admin);
        escrow.setTreasury(treasury2);
        escrow.setArbiter(arbiter2);
        vm.expectRevert(StashEscrow.ZeroAddress.selector);
        escrow.setTreasury(address(0));
        vm.stopPrank();
        vm.prank(arbiter);
        vm.expectRevert(StashEscrow.NotArbiter.selector);
        escrow.rule(dealId, true);
        vm.prank(arbiter2);
        escrow.rule(dealId, true);
        assertEq(usdc.balanceOf(treasury2), 10e6);
    }

    // --------------------------------------------------------------- deploy

    /// The deploy script reads the token's decimals from the chain, so $1 and $5,000 come out right on both chains.
    function test_DeployScript_SetsTokenInItsOwnUnits() public {
        vm.setEnv("ESCROW_OWNER", vm.toString(admin));
        vm.setEnv("ESCROW_TREASURY", vm.toString(treasury));
        vm.setEnv("ESCROW_ARBITER", vm.toString(arbiter));
        MockToken[2] memory both = [usdc, usdt];
        for (uint256 i; i < 2; i++) {
            vm.setEnv("ESCROW_TOKEN", vm.toString(address(both[i])));
            StashEscrow e = new DeployEscrow().run();
            (bool allowed, uint128 minFee, uint128 maxPrice) = e.tokens(address(both[i]));
            uint256 unit = 10 ** both[i].decimals();
            assertTrue(allowed);
            assertEq(minFee, unit);
            assertEq(maxPrice, 5000 * unit);
            assertEq(e.feeBps(), 250);
            assertEq(e.reviewWindow(), 3 days);
            assertEq(e.arbiter(), arbiter);
            assertEq(e.pendingOwner(), admin); // the owner still has to accept
        }
    }

    // ----------------------------------------------------------------- fuzz

    /// Whatever the price and fee rate, a finished deal pays out exactly what came in.
    function testFuzz_ReleasePaysOutExactlyThePrice(uint128 price, uint16 bps) public {
        price = uint128(bound(price, 1e6 + 1, 5_000e6));
        bps = uint16(bound(bps, 0, 500));
        vm.prank(admin);
        escrow.setTerms(bps, DELIVER, REVIEW);
        uint256 dealId = _delivered(usdc, price);
        vm.prank(buyer);
        escrow.release(dealId);
        uint256 fee = usdc.balanceOf(treasury);
        assertEq(usdc.balanceOf(seller) + fee, price);
        assertGe(fee, 1e6);
        assertLe(fee, uint256(price) * 500 / 10_000 > 1e6 ? uint256(price) * 500 / 10_000 : 1e6);
        assertGt(usdc.balanceOf(seller), 0);
        _assertEmpty(usdc);
    }

    /// A refund always returns the whole price, with nothing to the seller or the treasury.
    function testFuzz_RefundIsWhole(uint128 price) public {
        price = uint128(bound(price, 1e18 + 1, 5_000e18));
        uint256 start = usdt.balanceOf(buyer);
        uint256 dealId = _disputed(usdt, price);
        vm.prank(arbiter);
        escrow.rule(dealId, false);
        assertEq(usdt.balanceOf(buyer), start);
        assertEq(usdt.balanceOf(seller) + usdt.balanceOf(treasury), 0);
        _assertEmpty(usdt);
    }
}
