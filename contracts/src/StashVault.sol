// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

interface IStashFactory {
    function treasury() external view returns (address);
    function depositCapUsd() external view returns (uint256);
    function vaultOf(address owner) external view returns (address);
    function vaultOwnerChanged(address oldOwner, address newOwner) external;
}

/// @title StashVault
/// @notice A per-user savings vault for USD stablecoins that a stolen key cannot drain.
///         - Small withdrawals are instant up to a daily allowance.
///         - Large withdrawals wait out a timelock; the owner or any guardian can cancel.
///         - 1–3 guardians. Any one can freeze or cancel; none can move funds.
///         - Loosening any security setting (limits, removing a guardian, new yield adapter) is timelocked.
///         - The owner key can be replaced (e.g. after it leaks) only when the owner key and an established
///           guardian name the same new key; the move then waits a timelock that only guardians can cancel.
///         - Savings goals lock funds until a date (early break pays a fee).
///         - Auto-save pulls a fixed amount per interval from a wallet that opted in.
///         - No generic call/execute and no user-chosen approvals: funds move only through the functions below.
/// @dev Deployed as EIP-1167 clones by StashFactory. ERC-20/TIP-20 only: Tempo has no
///      native token, so this contract never touches msg.value or native balances.
///      USD amounts (limits, thresholds) use 18 decimals; token amounts are normalized
///      by `decimals()` and treated as $1 per unit, so the vault is meant for stablecoins.
///      Guardian actions (cancel, freeze) make no external calls so they stay cheap.
contract StashVault is Initializable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Policy {
        uint64 timelock; // seconds
        uint128 dailyLimit; // USD, 18 decimals
        uint128 largeThreshold; // USD, 18 decimals; instant withdrawals must be below this
    }

    struct PendingWithdrawal {
        address token;
        uint64 unlockAt;
        address to;
        uint128 amount;
        bool guardianApproved; // informational only; never shortens the timelock
    }

    struct PendingPolicy {
        Policy policy;
        uint64 effectiveAt; // 0 = none pending
    }

    struct Goal {
        address token;
        uint64 unlockAt;
        uint16 breakFeeBps;
        uint128 locked;
    }

    struct AutoSave {
        address token;
        uint64 interval;
        uint32 goalId; // 0 = no goal
        uint128 amount;
        uint64 nextAt; // 0 = inactive
    }

    uint256 public constant MAX_GUARDIANS = 3;
    uint64 public constant MIN_TIMELOCK = 24 hours; // owners pick their own waiting period, 24h or longer
    uint64 public constant MAX_TIMELOCK = 30 days;
    uint64 public constant WINDOW = 1 days;
    uint16 public constant MAX_BREAK_FEE_BPS = 1_000; // 10%
    uint64 public constant MIN_AUTOSAVE_INTERVAL = 1 hours;

    /// @dev Immutable lives in the implementation bytecode, so clones read it for free (no storage write per vault).
    address public immutable factory;
    address public owner;
    Policy public policy;
    bool public frozen;
    address public unfreezeApprovedBy;

    address[] internal _guardians;
    mapping(address guardian => uint64) public guardianEstablishedAt; // 0 = not a guardian; unfreeze power from this time
    mapping(address guardian => uint64) public guardianRemovalAt; // 0 = no removal pending

    // Instant-withdrawal allowance works as a refilling bucket: `spent` drains back to zero
    // at `dailyLimit` per WINDOW, so a full drain can't be repeated right after a reset.
    uint64 public lastSpendAt;
    uint128 public spent;

    uint256 public nextWithdrawalId;
    mapping(uint256 id => PendingWithdrawal) public pendingWithdrawals;

    PendingPolicy internal _pendingPolicy;

    mapping(address adapter => bool) public isYieldTarget;
    mapping(address adapter => uint64) public yieldTargetEffectiveAt;
    /// @dev Set when an adapter is activated and never cleared, so shares left after a guardian
    ///      removes the adapter are still valued at their underlying dollars by the limits.
    mapping(address adapter => bool) public isYieldShare;

    uint32 public goalCount;
    mapping(uint32 id => Goal) public goals;
    mapping(address token => uint256) public lockedBalance;

    mapping(address source => AutoSave) public autoSaves;

    /// @notice USD (18 decimals) deposited minus USD sent out, checked against the factory's beta
    ///         deposit cap. Yield earned doesn't count; tokens sent straight to the vault bypass it.
    uint256 public netDepositedUsd;

    // Owner key change. The owner key and each established guardian name a new owner; when the owner
    // and a guardian agree, the move is queued for a timelock. Only guardians can cancel it, so a thief
    // holding a leaked owner key can neither move the vault alone nor block the real owner's rescue.
    address public ownerNominee; // the owner key's choice
    mapping(address guardian => address) public guardianNominee; // each guardian's choice
    address public pendingOwner;
    uint64 public pendingOwnerAt; // 0 = no move queued

    event Deposited(address indexed token, address indexed from, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event WithdrawalRequested(uint256 indexed id, address indexed token, address indexed to, uint256 amount, uint64 unlockAt);
    event WithdrawalApproved(uint256 indexed id, address indexed guardian);
    event WithdrawalExecuted(uint256 indexed id);
    event WithdrawalCancelled(uint256 indexed id, address indexed by);
    event Frozen(address indexed by);
    event UnfreezeApproved(address indexed guardian);
    event Unfrozen();
    event GuardianAdded(address indexed guardian);
    event GuardianRemovalProposed(address indexed guardian, uint64 effectiveAt);
    event GuardianRemovalCancelled(address indexed guardian, address indexed by);
    event GuardianRemoved(address indexed guardian);
    event PolicyUpdated(Policy policy);
    event PolicyProposed(Policy policy, uint64 effectiveAt);
    event PolicyProposalCancelled(address indexed by);
    event YieldTargetProposed(address indexed adapter, uint64 effectiveAt);
    event YieldTargetActivated(address indexed adapter);
    event YieldTargetRemoved(address indexed adapter, address indexed by);
    event YieldDeposited(address indexed adapter, uint256 assets, uint256 shares);
    event YieldRedeemed(address indexed adapter, uint256 shares, uint256 assets);
    event GoalCreated(uint32 indexed id, address indexed token, uint64 unlockAt, uint16 breakFeeBps);
    event GoalFunded(uint32 indexed id, uint256 amount);
    event GoalReleased(uint32 indexed id, uint256 amount, uint256 fee);
    event AutoSaveAuthorized(address indexed source, address indexed token, uint256 amount, uint64 interval, uint32 goalId);
    event AutoSaveRevoked(address indexed source, address indexed by);
    event AutoSavePulled(address indexed source, address indexed token, uint256 amount);
    event OwnerNominated(address indexed by, address indexed newOwner);
    event OwnerChangeQueued(address indexed newOwner, uint64 effectiveAt);
    event OwnerChangeCancelled(address indexed by);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    error NotOwner();
    error NotGuardian();
    error NotOwnerOrGuardian();
    error NotAllowed();
    error IsFrozen();
    error NotFrozen();
    error InvalidPolicy();
    error InvalidGuardian();
    error TooManyGuardians();
    error LastGuardian();
    error InvalidAmount();
    error InvalidAddress();
    error AboveLargeThreshold();
    error DailyLimitExceeded();
    error InsufficientAvailable();
    error UnknownWithdrawal();
    error StillLocked();
    error NothingPending();
    error NotYieldTarget();
    error UnknownGoal();
    error InvalidGoal();
    error AutoSaveInactive();
    error AutoSaveNotDue();
    error DepositCapExceeded();
    error OwnerChangePending();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyGuardian() {
        if (guardianEstablishedAt[msg.sender] == 0) revert NotGuardian();
        _;
    }

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != owner && guardianEstablishedAt[msg.sender] == 0) revert NotOwnerOrGuardian();
        _;
    }

    modifier notFrozen() {
        if (frozen) revert IsFrozen();
        _;
    }

    constructor() {
        factory = msg.sender; // StashFactory deploys the implementation in its constructor
        _disableInitializers();
    }

    /// @param guardians_ 1–3 guardians. The app passes the Stash guardian by default.
    /// @param yieldTargets Adapter allowlist chosen at factory deploy (e.g. the curated Morpho vault on Base).
    function initialize(
        address owner_,
        address[] calldata guardians_,
        Policy calldata policy_,
        address[] calldata yieldTargets
    ) external initializer {
        if (owner_ == address(0)) revert InvalidAddress();
        if (guardians_.length == 0) revert LastGuardian();
        if (msg.sender != factory) revert NotAllowed();
        owner = owner_;
        // Initial guardians are established immediately.
        for (uint256 i; i < guardians_.length; ++i) {
            _addGuardian(guardians_[i], uint64(block.timestamp));
        }
        _validatePolicy(policy_);
        policy = policy_;
        for (uint256 i; i < yieldTargets.length; ++i) {
            isYieldTarget[yieldTargets[i]] = true;
            isYieldShare[yieldTargets[i]] = true;
            emit YieldTargetActivated(yieldTargets[i]);
        }
        emit PolicyUpdated(policy_);
    }

    // ---------------------------------------------------------------------
    // Deposits
    // ---------------------------------------------------------------------

    function deposit(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(token, msg.sender, amount);
        _recordDeposit(token, amount);
    }

    // ---------------------------------------------------------------------
    // Withdrawals
    // ---------------------------------------------------------------------

    /// @notice Instant withdrawal, allowed only below the large threshold and within the daily allowance.
    function withdraw(address token, address to, uint256 amount) external onlyOwner notFrozen nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (to == address(0)) revert InvalidAddress();
        uint256 usd = _toUsd(token, amount);
        if (usd >= policy.largeThreshold) revert AboveLargeThreshold();
        uint256 newSpent = _currentSpent() + usd;
        if (newSpent > policy.dailyLimit) revert DailyLimitExceeded();
        if (amount > available(token)) revert InsufficientAvailable();
        spent = uint128(newSpent);
        lastSpendAt = uint64(block.timestamp);
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
        _recordOutflow(token, amount);
    }

    /// @notice Queue any withdrawal; it can be executed after the timelock unless cancelled.
    function requestWithdrawal(address token, address to, uint256 amount) external onlyOwner notFrozen returns (uint256 id) {
        if (amount == 0 || amount > type(uint128).max) revert InvalidAmount();
        if (to == address(0)) revert InvalidAddress();
        id = nextWithdrawalId++;
        uint64 unlockAt = uint64(block.timestamp) + policy.timelock;
        pendingWithdrawals[id] =
            PendingWithdrawal({token: token, unlockAt: unlockAt, to: to, amount: uint128(amount), guardianApproved: false});
        emit WithdrawalRequested(id, token, to, amount, unlockAt);
    }

    /// @notice A guardian marks a queued withdrawal as reviewed. Shown in the app; does NOT skip the timelock,
    ///         and is not required — so users can always exit even if every guardian is unreachable.
    function approveWithdrawal(uint256 id) external onlyGuardian {
        PendingWithdrawal storage p = pendingWithdrawals[id];
        if (p.amount == 0) revert UnknownWithdrawal();
        p.guardianApproved = true;
        emit WithdrawalApproved(id, msg.sender);
    }

    function executeWithdrawal(uint256 id) external onlyOwner notFrozen nonReentrant {
        PendingWithdrawal memory p = pendingWithdrawals[id];
        if (p.amount == 0) revert UnknownWithdrawal();
        if (block.timestamp < p.unlockAt) revert StillLocked();
        if (p.amount > available(p.token)) revert InsufficientAvailable();
        delete pendingWithdrawals[id];
        IERC20(p.token).safeTransfer(p.to, p.amount);
        emit WithdrawalExecuted(id);
        emit Withdrawn(p.token, p.to, p.amount);
        _recordOutflow(p.token, p.amount);
    }

    function cancelWithdrawal(uint256 id) external onlyOwnerOrGuardian {
        if (pendingWithdrawals[id].amount == 0) revert UnknownWithdrawal();
        delete pendingWithdrawals[id];
        emit WithdrawalCancelled(id, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Freeze: owner or any guardian freezes; unfreezing needs owner + an established guardian.
    // ---------------------------------------------------------------------

    function freeze() external onlyOwnerOrGuardian {
        frozen = true;
        delete unfreezeApprovedBy;
        emit Frozen(msg.sender);
    }

    /// @notice Guardian half of an unfreeze. Only guardians that have held the role for a full
    ///         timelock count, so a thief can't add their own guardian and use it to undo a freeze.
    function approveUnfreeze() external onlyGuardian {
        if (!frozen) revert NotFrozen();
        if (!_isEstablished(msg.sender)) revert InvalidGuardian();
        unfreezeApprovedBy = msg.sender;
        emit UnfreezeApproved(msg.sender);
    }

    /// @notice Owner half of an unfreeze.
    function unfreeze() external onlyOwner {
        address approver = unfreezeApprovedBy;
        if (!_isEstablished(approver)) revert NotAllowed();
        frozen = false;
        delete unfreezeApprovedBy;
        emit Unfrozen();
    }

    // ---------------------------------------------------------------------
    // Guardians
    // ---------------------------------------------------------------------

    /// @notice Adding a guardian only adds protection, so it is immediate. A new guardian can
    ///         cancel and freeze right away, but can only help unfreeze after a full timelock.
    function addGuardian(address guardian) external onlyOwner {
        _addGuardian(guardian, uint64(block.timestamp) + policy.timelock);
    }

    /// @notice An established guardian can veto a guardian that was added recently and is not yet
    ///         established — stops a thief with the owner key from planting their own guardian.
    function vetoGuardian(address guardian) external onlyGuardian {
        if (!_isEstablished(msg.sender)) revert InvalidGuardian();
        if (guardianEstablishedAt[guardian] == 0 || _isEstablished(guardian)) revert InvalidGuardian();
        _removeGuardian(guardian);
    }

    /// @notice Removing a guardian is a loosening: timelocked, and any guardian can cancel it.
    function proposeGuardianRemoval(address guardian) external onlyOwner {
        if (guardianEstablishedAt[guardian] == 0) revert InvalidGuardian();
        if (_guardians.length <= 1) revert LastGuardian();
        uint64 effectiveAt = uint64(block.timestamp) + policy.timelock;
        guardianRemovalAt[guardian] = effectiveAt;
        emit GuardianRemovalProposed(guardian, effectiveAt);
    }

    function cancelGuardianRemoval(address guardian) external onlyOwnerOrGuardian {
        if (guardianRemovalAt[guardian] == 0) revert NothingPending();
        delete guardianRemovalAt[guardian];
        emit GuardianRemovalCancelled(guardian, msg.sender);
    }

    function applyGuardianRemoval(address guardian) external onlyOwner notFrozen {
        uint64 effectiveAt = guardianRemovalAt[guardian];
        if (effectiveAt == 0) revert NothingPending();
        if (block.timestamp < effectiveAt) revert StillLocked();
        if (_guardians.length <= 1) revert LastGuardian();
        _removeGuardian(guardian);
    }

    function guardians() external view returns (address[] memory) {
        return _guardians;
    }

    // ---------------------------------------------------------------------
    // Owner key change (rescue after a leaked key, or moving to a new login)
    // ---------------------------------------------------------------------

    /// @notice The owner key or an established guardian names the new owner key. When the owner's
    ///         choice and any established guardian's choice match, the move is queued for the timelock.
    ///         Either side can go first. Neither the owner key nor a guardian can move the vault alone.
    function nominateOwner(address newOwner) external {
        if (newOwner == address(0) || newOwner == owner || guardianEstablishedAt[newOwner] != 0) revert InvalidAddress();
        if (IStashFactory(factory).vaultOf(newOwner) != address(0)) revert InvalidAddress(); // one vault per owner
        if (pendingOwnerAt != 0) revert OwnerChangePending();
        bool agreed;
        if (msg.sender == owner) {
            ownerNominee = newOwner;
            uint256 n = _guardians.length;
            for (uint256 i; i < n; ++i) {
                address g = _guardians[i];
                if (guardianNominee[g] == newOwner && _isEstablished(g)) agreed = true;
            }
        } else {
            if (!_isEstablished(msg.sender)) revert NotGuardian();
            guardianNominee[msg.sender] = newOwner;
            agreed = ownerNominee == newOwner;
        }
        emit OwnerNominated(msg.sender, newOwner);
        if (agreed) {
            pendingOwner = newOwner;
            pendingOwnerAt = uint64(block.timestamp) + policy.timelock;
            emit OwnerChangeQueued(newOwner, pendingOwnerAt);
        }
    }

    /// @notice Any established guardian can stop a queued move. The owner key can't: if it leaked, the
    ///         thief must not be able to block the rescue.
    function cancelOwnerChange() external onlyGuardian {
        if (!_isEstablished(msg.sender)) revert InvalidGuardian();
        if (pendingOwnerAt == 0) revert NothingPending();
        _clearOwnerChange();
        emit OwnerChangeCancelled(msg.sender);
    }

    /// @notice Anyone can complete a queued move once the timelock has passed. Works while frozen, so
    ///         guardians can freeze first and the vault still reaches its new key.
    function applyOwnerChange() external {
        uint64 at = pendingOwnerAt;
        if (at == 0) revert NothingPending();
        if (block.timestamp < at) revert StillLocked();
        address old = owner;
        address next = pendingOwner;
        if (guardianEstablishedAt[next] != 0) revert InvalidAddress(); // became a guardian meanwhile
        _clearOwnerChange();
        owner = next;
        IStashFactory(factory).vaultOwnerChanged(old, next);
        emit OwnerChanged(old, next);
    }

    function _clearOwnerChange() internal {
        delete pendingOwner;
        delete pendingOwnerAt;
        delete ownerNominee;
        uint256 n = _guardians.length;
        for (uint256 i; i < n; ++i) {
            delete guardianNominee[_guardians[i]];
        }
    }

    // ---------------------------------------------------------------------
    // Policy
    // ---------------------------------------------------------------------

    /// @notice Tightening applies immediately; anything else waits out the current timelock.
    function proposePolicy(Policy calldata next) external onlyOwner {
        _validatePolicy(next);
        Policy memory cur = policy;
        if (next.dailyLimit <= cur.dailyLimit && next.largeThreshold <= cur.largeThreshold && next.timelock >= cur.timelock)
        {
            policy = next;
            delete _pendingPolicy;
            emit PolicyUpdated(next);
            return;
        }
        if (frozen) revert IsFrozen();
        uint64 effectiveAt = uint64(block.timestamp) + cur.timelock;
        _pendingPolicy = PendingPolicy({policy: next, effectiveAt: effectiveAt});
        emit PolicyProposed(next, effectiveAt);
    }

    function applyPolicy() external onlyOwner notFrozen {
        PendingPolicy memory p = _pendingPolicy;
        if (p.effectiveAt == 0) revert NothingPending();
        if (block.timestamp < p.effectiveAt) revert StillLocked();
        delete _pendingPolicy;
        policy = p.policy;
        emit PolicyUpdated(p.policy);
    }

    function cancelPolicy() external onlyOwnerOrGuardian {
        if (_pendingPolicy.effectiveAt == 0) revert NothingPending();
        delete _pendingPolicy;
        emit PolicyProposalCancelled(msg.sender);
    }

    function pendingPolicy() external view returns (Policy memory, uint64 effectiveAt) {
        return (_pendingPolicy.policy, _pendingPolicy.effectiveAt);
    }

    // ---------------------------------------------------------------------
    // Yield adapters (ERC-4626 vaults such as Morpho). The only place the vault ever
    // approves a spender; shares stay inside this vault.
    // ---------------------------------------------------------------------

    /// @notice Adding an adapter is a loosening (an unknown vault could swallow funds), so it is timelocked.
    function proposeYieldTarget(address adapter) external onlyOwner notFrozen {
        if (adapter == address(0)) revert InvalidAddress();
        uint64 effectiveAt = uint64(block.timestamp) + policy.timelock;
        yieldTargetEffectiveAt[adapter] = effectiveAt;
        emit YieldTargetProposed(adapter, effectiveAt);
    }

    function activateYieldTarget(address adapter) external onlyOwner notFrozen {
        uint64 effectiveAt = yieldTargetEffectiveAt[adapter];
        if (effectiveAt == 0) revert NothingPending();
        if (block.timestamp < effectiveAt) revert StillLocked();
        delete yieldTargetEffectiveAt[adapter];
        isYieldTarget[adapter] = true;
        isYieldShare[adapter] = true;
        emit YieldTargetActivated(adapter);
    }

    /// @notice Removing an adapter (or cancelling a proposed one) only reduces risk, so any guardian can do it.
    function removeYieldTarget(address adapter) external onlyOwnerOrGuardian {
        delete yieldTargetEffectiveAt[adapter];
        delete isYieldTarget[adapter];
        emit YieldTargetRemoved(adapter, msg.sender);
    }

    function depositToYield(address adapter, uint256 assets) external onlyOwner notFrozen nonReentrant returns (uint256 shares) {
        if (!isYieldTarget[adapter]) revert NotYieldTarget();
        if (assets == 0) revert InvalidAmount();
        IERC20 asset = IERC20(IERC4626(adapter).asset());
        if (assets > available(address(asset))) revert InsufficientAvailable();
        asset.forceApprove(adapter, assets);
        shares = IERC4626(adapter).deposit(assets, address(this));
        asset.forceApprove(adapter, 0);
        emit YieldDeposited(adapter, assets, shares);
    }

    /// @notice Redeemed assets always return to this vault.
    function redeemFromYield(address adapter, uint256 shares) external onlyOwner nonReentrant returns (uint256 assets) {
        if (shares == 0) revert InvalidAmount();
        if (shares > available(adapter)) revert InsufficientAvailable();
        assets = IERC4626(adapter).redeem(shares, address(this), address(this));
        emit YieldRedeemed(adapter, shares, assets);
    }

    // ---------------------------------------------------------------------
    // Savings goals
    // ---------------------------------------------------------------------

    function createGoal(address token, uint64 unlockAt, uint16 breakFeeBps) external onlyOwner returns (uint32 id) {
        if (token == address(0)) revert InvalidAddress();
        if (unlockAt <= block.timestamp || breakFeeBps > MAX_BREAK_FEE_BPS) revert InvalidGoal();
        id = ++goalCount;
        goals[id] = Goal({token: token, unlockAt: unlockAt, breakFeeBps: breakFeeBps, locked: 0});
        emit GoalCreated(id, token, unlockAt, breakFeeBps);
    }

    /// @notice Move already-deposited funds into a goal.
    function fundGoal(uint32 id, uint256 amount) external onlyOwner {
        Goal storage g = _goal(id);
        if (amount == 0) revert InvalidAmount();
        if (amount > available(g.token)) revert InsufficientAvailable();
        _lock(g, id, amount);
    }

    /// @notice Anyone can deposit straight into a goal (e.g. "save now" or a gift).
    function depositToGoal(uint32 id, uint256 amount) external nonReentrant {
        Goal storage g = _goal(id);
        if (amount == 0) revert InvalidAmount();
        IERC20(g.token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(g.token, msg.sender, amount);
        _recordDeposit(g.token, amount);
        _lock(g, id, amount);
    }

    /// @notice Unlock a goal's funds back into the vault's available balance (still subject to
    ///         withdrawal rules). Before the unlock date, the break fee goes to the Stash treasury.
    function releaseGoal(uint32 id) external onlyOwner notFrozen nonReentrant {
        Goal storage g = _goal(id);
        uint256 amount = g.locked;
        if (amount == 0) revert InvalidAmount();
        g.locked = 0;
        lockedBalance[g.token] -= amount;
        uint256 fee;
        if (block.timestamp < g.unlockAt) {
            fee = (amount * g.breakFeeBps) / 10_000;
            address treasury = IStashFactory(factory).treasury();
            if (fee > 0 && treasury != address(0)) {
                IERC20(g.token).safeTransfer(treasury, fee);
                _recordOutflow(g.token, fee);
            } else {
                fee = 0;
            }
        }
        emit GoalReleased(id, amount, fee);
    }

    // ---------------------------------------------------------------------
    // Auto-save
    // ---------------------------------------------------------------------

    /// @notice Called by the paying wallet (after it approves this vault). First pull is due immediately.
    function authorizeAutoSave(address token, uint256 amount, uint64 interval, uint32 goalId) external {
        if (token == address(0)) revert InvalidAddress();
        if (amount == 0 || amount > type(uint128).max) revert InvalidAmount();
        if (interval < MIN_AUTOSAVE_INTERVAL) revert InvalidAmount();
        if (goalId != 0 && _goal(goalId).token != token) revert InvalidGoal();
        autoSaves[msg.sender] = AutoSave({
            token: token,
            interval: interval,
            goalId: goalId,
            amount: uint128(amount),
            nextAt: uint64(block.timestamp)
        });
        emit AutoSaveAuthorized(msg.sender, token, amount, interval, goalId);
    }

    function revokeAutoSave(address source) external {
        if (msg.sender != source && msg.sender != owner) revert NotAllowed();
        delete autoSaves[source];
        emit AutoSaveRevoked(source, msg.sender);
    }

    /// @notice Permissionless: anyone may trigger a due pull. Funds can only ever land in this vault.
    ///         Missed periods are not caught up; the next pull is one interval after this one.
    function pullAutoSave(address source) external nonReentrant {
        AutoSave storage s = autoSaves[source];
        if (s.nextAt == 0) revert AutoSaveInactive();
        if (block.timestamp < s.nextAt) revert AutoSaveNotDue();
        s.nextAt = uint64(block.timestamp) + s.interval;
        address token = s.token;
        uint256 amount = s.amount;
        uint32 goalId = s.goalId;
        IERC20(token).safeTransferFrom(source, address(this), amount);
        emit AutoSavePulled(source, token, amount);
        _recordDeposit(token, amount);
        if (goalId != 0) _lock(goals[goalId], goalId, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Balance not locked in goals.
    function available(address token) public view returns (uint256) {
        uint256 bal = IERC20(token).balanceOf(address(this));
        uint256 locked = lockedBalance[token];
        return bal > locked ? bal - locked : 0;
    }

    /// @notice USD (18 decimals) that can be withdrawn instantly right now.
    function remainingDailyLimit() external view returns (uint256) {
        uint256 current = _currentSpent();
        return policy.dailyLimit > current ? policy.dailyLimit - current : 0;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _addGuardian(address guardian, uint64 establishedAt) internal {
        if (guardian == address(0) || guardian == owner || guardianEstablishedAt[guardian] != 0) revert InvalidGuardian();
        if (_guardians.length >= MAX_GUARDIANS) revert TooManyGuardians();
        _guardians.push(guardian);
        guardianEstablishedAt[guardian] = establishedAt;
        emit GuardianAdded(guardian);
    }

    function _removeGuardian(address guardian) internal {
        delete guardianRemovalAt[guardian];
        delete guardianNominee[guardian];
        delete guardianEstablishedAt[guardian];
        if (unfreezeApprovedBy == guardian) delete unfreezeApprovedBy;
        uint256 n = _guardians.length;
        for (uint256 i; i < n; ++i) {
            if (_guardians[i] == guardian) {
                _guardians[i] = _guardians[n - 1];
                _guardians.pop();
                break;
            }
        }
        emit GuardianRemoved(guardian);
    }

    function _isEstablished(address guardian) internal view returns (bool) {
        uint64 at = guardianEstablishedAt[guardian];
        return at != 0 && block.timestamp >= at;
    }

    function _currentSpent() internal view returns (uint256) {
        uint256 refilled = (block.timestamp - lastSpendAt) * policy.dailyLimit / WINDOW;
        return spent > refilled ? spent - refilled : 0;
    }

    function _recordDeposit(address token, uint256 amount) internal {
        uint256 next = netDepositedUsd + _toUsd(token, amount);
        uint256 cap = IStashFactory(factory).depositCapUsd();
        if (cap != 0 && next > cap) revert DepositCapExceeded();
        netDepositedUsd = next;
    }

    function _recordOutflow(address token, uint256 amount) internal {
        uint256 usd = _toUsd(token, amount);
        netDepositedUsd = netDepositedUsd > usd ? netDepositedUsd - usd : 0;
    }

    function _goal(uint32 id) internal view returns (Goal storage g) {
        g = goals[id];
        if (g.token == address(0)) revert UnknownGoal();
    }

    function _lock(Goal storage g, uint32 id, uint256 amount) internal {
        g.locked += uint128(amount);
        lockedBalance[g.token] += amount;
        emit GoalFunded(id, amount);
    }

    function _validatePolicy(Policy calldata p) internal pure {
        if (p.timelock < MIN_TIMELOCK || p.timelock > MAX_TIMELOCK) revert InvalidPolicy();
        if (p.largeThreshold == 0) revert InvalidPolicy();
    }

    /// @dev Yield shares (e.g. Morpho) are worth more than $1 as interest accrues, so value them
    ///      at their underlying assets; otherwise withdrawing shares would slip past the limits.
    function _toUsd(address token, uint256 amount) internal view returns (uint256) {
        if (isYieldShare[token]) {
            IERC4626 shares = IERC4626(token);
            return _toUsd(shares.asset(), shares.convertToAssets(amount));
        }
        uint8 dec = IERC20Metadata(token).decimals();
        return dec <= 18 ? amount * 10 ** (18 - dec) : amount / 10 ** (dec - 18);
    }
}
