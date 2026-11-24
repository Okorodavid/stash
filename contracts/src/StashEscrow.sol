// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title StashEscrow
/// @notice Holds a buyer's payment until the seller has delivered and the buyer has approved.
/// @dev Life of a deal:
///        buy      -> Funded     money is held here
///        deliver  -> Delivered  the seller posts the file's hash; the buyer's review window starts
///        release  -> Released   the buyer approves (or stays silent past the window): seller is paid, less the fee
///        dispute  -> Disputed   the buyer objects in time; the arbiter (Stash) pays one side in full
///        refund   -> Refunded   the seller gives the money back, or never delivered by the deadline
///      Every state has a way out that needs no one's goodwill:
///      Funded times out to the buyer, Delivered to the seller, Disputed to the buyer.
///      The one thing that can still hold money here is the token itself refusing a transfer (USDC and USDT
///      can freeze an address). A frozen buyer or seller blocks only payments to themselves; the other side's
///      exits keep working. A frozen treasury blocks seller payouts until the owner names a new treasury.
///      The owner sets fees, windows, tokens and roles for FUTURE listings only: a listing keeps the fee
///      and windows it was made under, so its seller's terms cannot be changed under them, and every deal
///      copies its listing's terms. Neither the owner nor the arbiter can move money except as described above;
///      the arbiter acts only on disputed deals and can only pay that deal's buyer or seller.
contract StashEscrow is Ownable2Step, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    enum State {
        None,
        Funded,
        Delivered,
        Disputed,
        Released,
        Refunded
    }

    /// @dev Amounts are in the token's own units (USDC on Base has 6 decimals, USDT on BNB Chain has 18).
    struct Token {
        bool allowed;
        uint128 minFee; // the fee is never below this
        uint128 maxPrice; // beta cap per deal
    }

    struct Listing {
        address seller;
        address token;
        uint128 price;
        uint128 fee; // fixed when listed
        uint32 deliverWindow; // fixed when listed
        uint32 reviewWindow; // fixed when listed
        bool active;
        bytes32 meta; // hash of the off-chain listing (name, description, preview), so it can't be swapped
    }

    struct Deal {
        address buyer;
        address seller;
        address token;
        uint128 price;
        uint128 fee; // copied from the listing
        uint64 deliverBy; // the buyer can take a refund if nothing is delivered by then
        uint64 deliveredAt;
        uint64 disputedAt;
        uint32 reviewWindow; // copied from the listing
        State state;
        uint256 listingId;
        bytes32 fileHash; // hash of the delivered file: evidence for a dispute
    }

    uint16 public constant MAX_FEE_BPS = 500; // 5%
    uint32 public constant MIN_WINDOW = 1 days;
    uint32 public constant MAX_WINDOW = 30 days;
    /// @notice A dispute the arbiter has not ruled on by then goes back to the buyer.
    uint32 public constant DISPUTE_TIMEOUT = 30 days;

    address public treasury;
    address public arbiter;
    uint16 public feeBps;
    uint32 public deliverWindow;
    uint32 public reviewWindow;
    /// @notice Stops new listings and new deals. Deals already funded always run to their end.
    bool public paused;

    uint256 public listingCount;
    uint256 public dealCount;
    mapping(address token => Token) public tokens;
    mapping(uint256 id => Listing) public listings;
    mapping(uint256 id => Deal) public deals;

    event Listed(uint256 indexed listingId, address indexed seller, address indexed token, uint128 price, uint128 fee, bytes32 meta);
    event Delisted(uint256 indexed listingId);
    event Funded(uint256 indexed dealId, uint256 indexed listingId, address indexed buyer, address seller, address token, uint128 price, uint128 fee, uint64 deliverBy);
    event Delivered(uint256 indexed dealId, bytes32 fileHash, uint64 reviewEnds);
    event Disputed(uint256 indexed dealId);
    event Ruled(uint256 indexed dealId, bool sellerWins);
    event Released(uint256 indexed dealId, uint128 toSeller, uint128 fee);
    event Refunded(uint256 indexed dealId);
    event TokenSet(address indexed token, bool allowed, uint128 minFee, uint128 maxPrice);
    event TermsSet(uint16 feeBps, uint32 deliverWindow, uint32 reviewWindow);
    event TreasurySet(address treasury);
    event ArbiterSet(address arbiter);
    event PausedSet(bool paused);

    error Paused();
    error TokenNotAllowed();
    error BadPrice();
    error FeeTooHigh();
    error BadTerms();
    error ZeroAddress();
    error NotSeller();
    error NotBuyer();
    error NotArbiter();
    error NotListed();
    error OwnListing();
    error WrongState();
    error TooEarly();
    error TooLate();
    error ShortPayment();

    constructor(address initialOwner, address treasury_, address arbiter_, uint16 feeBps_, uint32 deliverWindow_, uint32 reviewWindow_)
        Ownable(initialOwner)
    {
        _setTreasury(treasury_);
        _setArbiter(arbiter_);
        _setTerms(feeBps_, deliverWindow_, reviewWindow_);
    }

    // ---------------------------------------------------------------- sellers

    /// @notice Puts something up for sale. Any number of buyers can buy it until it is delisted.
    /// @param maxFee The most the seller accepts to pay per sale, so a fee change that lands just before
    ///        this call cannot surprise them.
    function list(address token, uint128 price, uint128 maxFee, bytes32 meta) external returns (uint256 listingId) {
        if (paused) revert Paused();
        Token memory t = tokens[token];
        if (!t.allowed) revert TokenNotAllowed();
        uint128 fee = uint128((uint256(price) * feeBps) / 10_000);
        if (fee < t.minFee) fee = t.minFee;
        if (fee > maxFee) revert FeeTooHigh();
        // The price must leave the seller something after the fee, and stay under the beta cap.
        if (fee >= price || price > t.maxPrice) revert BadPrice();
        listingId = ++listingCount;
        listings[listingId] = Listing(msg.sender, token, price, fee, deliverWindow, reviewWindow, true, meta);
        emit Listed(listingId, msg.sender, token, price, fee, meta);
    }

    /// @notice Takes a listing down. Deals already funded on it are unaffected. To change a price, list again.
    function delist(uint256 listingId) external {
        Listing storage l = listings[listingId];
        if (l.seller != msg.sender) revert NotSeller();
        l.active = false;
        emit Delisted(listingId);
    }

    /// @notice The seller records that the file was handed over. Starts the buyer's review window.
    function deliver(uint256 dealId, bytes32 fileHash) external {
        Deal storage d = deals[dealId];
        if (d.seller != msg.sender) revert NotSeller();
        if (d.state != State.Funded) revert WrongState();
        d.state = State.Delivered;
        d.deliveredAt = uint64(block.timestamp);
        d.fileHash = fileHash;
        emit Delivered(dealId, fileHash, uint64(block.timestamp) + d.reviewWindow);
    }

    // ----------------------------------------------------------------- buyers

    /// @notice Pays a listing's price into escrow.
    function buy(uint256 listingId) external nonReentrant returns (uint256 dealId) {
        if (paused) revert Paused();
        Listing memory l = listings[listingId];
        if (!l.active) revert NotListed();
        if (l.seller == msg.sender) revert OwnListing();
        Token memory t = tokens[l.token];
        if (!t.allowed) revert TokenNotAllowed();

        // The cap is a safety limit, so lowering it also stops new deals on older, larger listings.
        if (l.price > t.maxPrice) revert BadPrice();

        dealId = ++dealCount;
        uint64 deliverBy = uint64(block.timestamp) + l.deliverWindow;
        deals[dealId] = Deal({
            buyer: msg.sender,
            seller: l.seller,
            token: l.token,
            price: l.price,
            fee: l.fee,
            deliverBy: deliverBy,
            deliveredAt: 0,
            disputedAt: 0,
            reviewWindow: l.reviewWindow,
            state: State.Funded,
            listingId: listingId,
            fileHash: bytes32(0)
        });
        emit Funded(dealId, listingId, msg.sender, l.seller, l.token, l.price, l.fee, deliverBy);

        // Tokens that take a cut on transfer would leave the deal short; refuse them.
        IERC20 token = IERC20(l.token);
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), l.price);
        if (token.balanceOf(address(this)) - before != l.price) revert ShortPayment();
    }

    /// @notice The buyer approves: the seller is paid. Allowed as soon as the deal is funded.
    function release(uint256 dealId) external nonReentrant {
        Deal storage d = deals[dealId];
        if (d.buyer != msg.sender) revert NotBuyer();
        if (d.state != State.Funded && d.state != State.Delivered) revert WrongState();
        _paySeller(dealId, d);
    }

    /// @notice The buyer objects to what was delivered. Only inside the review window.
    function dispute(uint256 dealId) external {
        Deal storage d = deals[dealId];
        if (d.buyer != msg.sender) revert NotBuyer();
        if (d.state != State.Delivered) revert WrongState();
        if (block.timestamp >= d.deliveredAt + d.reviewWindow) revert TooLate();
        d.state = State.Disputed;
        d.disputedAt = uint64(block.timestamp);
        emit Disputed(dealId);
    }

    // --------------------------------------------------------------- timeouts

    /// @notice The buyer stayed silent through the review window: the seller is paid. Anyone can call.
    function claim(uint256 dealId) external nonReentrant {
        Deal storage d = deals[dealId];
        if (d.state != State.Delivered) revert WrongState();
        if (block.timestamp < d.deliveredAt + d.reviewWindow) revert TooEarly();
        _paySeller(dealId, d);
    }

    /// @notice Gives the buyer their money back, in full and with no fee.
    ///         The seller can do this at any point before the deal ends, even mid-dispute.
    ///         The buyer can once the delivery deadline has passed with nothing delivered.
    function refund(uint256 dealId) external nonReentrant {
        Deal storage d = deals[dealId];
        State s = d.state;
        if (msg.sender == d.seller) {
            if (s != State.Funded && s != State.Delivered && s != State.Disputed) revert WrongState();
        } else if (msg.sender == d.buyer) {
            if (s != State.Funded) revert WrongState();
            if (block.timestamp <= d.deliverBy) revert TooEarly();
        } else {
            revert NotBuyer();
        }
        _payBuyer(dealId, d);
    }

    /// @notice The arbiter never ruled: the money goes back to the buyer. Anyone can call.
    function expireDispute(uint256 dealId) external nonReentrant {
        Deal storage d = deals[dealId];
        if (d.state != State.Disputed) revert WrongState();
        if (block.timestamp < d.disputedAt + DISPUTE_TIMEOUT) revert TooEarly();
        _payBuyer(dealId, d);
    }

    // ---------------------------------------------------------------- arbiter

    /// @notice Settles a disputed deal: the whole amount goes to one side.
    function rule(uint256 dealId, bool sellerWins) external nonReentrant {
        if (msg.sender != arbiter) revert NotArbiter();
        Deal storage d = deals[dealId];
        if (d.state != State.Disputed) revert WrongState();
        emit Ruled(dealId, sellerWins);
        if (sellerWins) _paySeller(dealId, d);
        else _payBuyer(dealId, d);
    }

    // ------------------------------------------------------------------ owner

    function setToken(address token, bool allowed, uint128 minFee, uint128 maxPrice) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (allowed && minFee >= maxPrice) revert BadTerms();
        tokens[token] = Token(allowed, minFee, maxPrice);
        emit TokenSet(token, allowed, minFee, maxPrice);
    }

    function setTerms(uint16 feeBps_, uint32 deliverWindow_, uint32 reviewWindow_) external onlyOwner {
        _setTerms(feeBps_, deliverWindow_, reviewWindow_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        _setTreasury(treasury_);
    }

    function setArbiter(address arbiter_) external onlyOwner {
        _setArbiter(arbiter_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    // --------------------------------------------------------------- internal

    function _paySeller(uint256 dealId, Deal storage d) private {
        d.state = State.Released;
        uint128 toSeller = d.price - d.fee;
        emit Released(dealId, toSeller, d.fee);
        IERC20(d.token).safeTransfer(d.seller, toSeller);
        IERC20(d.token).safeTransfer(treasury, d.fee);
    }

    function _payBuyer(uint256 dealId, Deal storage d) private {
        d.state = State.Refunded;
        emit Refunded(dealId);
        IERC20(d.token).safeTransfer(d.buyer, d.price);
    }

    function _setTerms(uint16 feeBps_, uint32 deliverWindow_, uint32 reviewWindow_) private {
        if (feeBps_ > MAX_FEE_BPS) revert BadTerms();
        if (deliverWindow_ < MIN_WINDOW || deliverWindow_ > MAX_WINDOW) revert BadTerms();
        if (reviewWindow_ < MIN_WINDOW || reviewWindow_ > MAX_WINDOW) revert BadTerms();
        feeBps = feeBps_;
        deliverWindow = deliverWindow_;
        reviewWindow = reviewWindow_;
        emit TermsSet(feeBps_, deliverWindow_, reviewWindow_);
    }

    function _setTreasury(address treasury_) private {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function _setArbiter(address arbiter_) private {
        if (arbiter_ == address(0)) revert ZeroAddress();
        arbiter = arbiter_;
        emit ArbiterSet(arbiter_);
    }
}
