"use client";

import { useCallback, useEffect, useState } from "react";
import { zeroAddress, type Address } from "viem";
import { erc20Abi, stashFactoryAbi } from "./abis";
import { depositRoom, net, publicClient, readOwnerMove, readPending, readVault, vaultCall, type Call, type OwnerMove, type Pending } from "./chain";
import { DEFAULT_POLICY, DEMO_VAULT, STASH_GUARDIAN, type Token } from "./config";
import { signUpInstead, usePreview } from "./preview";
import { useSender } from "./useSender";

export type { OwnerMove, Pending };

export type Goal = {
  id: number;
  token: Address;
  unlockAt: number;
  breakFeeBps: number;
  locked: bigint;
};

export type AutoSavePlan = {
  token: Address;
  interval: number; // seconds
  goalId: number; // 0 = vault balance
  amount: bigint;
  nextAt: number;
};

export type VaultState = {
  vault: Address | null; // null = not created yet
  frozen: boolean;
  /** Guardian who approved an unfreeze (owner can then unfreeze), or null. */
  unfreezeApprovedBy: Address | null;
  allowanceUsd: bigint; // 18 decimals
  dailyLimitUsd: bigint;
  largeThresholdUsd: bigint;
  timelock: number; // seconds
  /** A queued rules change (e.g. a shorter waiting period), or null. */
  pendingPolicy: { timelock: number; dailyLimitUsd: bigint; largeThresholdUsd: bigint; effectiveAt: number } | null;
  /** Dollars (18 decimals) the vault can still take in during the beta; null = no cap. */
  depositRoomUsd: bigint | null;
  /** Moving the vault to a new owner key; null if this vault predates the feature. */
  ownerMove: OwnerMove | null;
  guardians: Address[];
  balances: { token: Token; available: bigint; total: bigint; wallet: bigint }[];
  pending: Pending[];
  goals: Goal[];
  /** Auto-save plan where the user's own wallet is the paying source (null if none). */
  autoSave: AutoSavePlan | null;
};

/** The signed-in user's own vault: state plus owner actions. */
/**
 * Sample vault shown before someone has one (signed out, or signed in without a vault yet): a new,
 * empty vault with the default rules. `base` keeps a signed-in user's real wallet balances.
 */
export const sampleVaultState = (base?: VaultState | null): VaultState => ({
  vault: DEMO_VAULT ?? "0x000000000000000000000000000000000000dEaD", // only used for the drain-test link
  frozen: false,
  unfreezeApprovedBy: null,
  allowanceUsd: DEFAULT_POLICY.dailyLimit,
  dailyLimitUsd: DEFAULT_POLICY.dailyLimit,
  largeThresholdUsd: DEFAULT_POLICY.largeThreshold,
  timelock: Number(DEFAULT_POLICY.timelock),
  pendingPolicy: null,
  ownerMove: { ownerNominee: null, guardianNominees: [], pendingOwner: null, pendingOwnerAt: 0 },
  guardians: STASH_GUARDIAN ? [STASH_GUARDIAN] : [],
  balances: net.tokens.map((token, i) => ({ token, available: 0n, total: 0n, wallet: base?.balances[i]?.wallet ?? 0n })),
  pending: [],
  goals: [],
  autoSave: null,
  depositRoomUsd: base?.depositRoomUsd ?? null,
});

export function useVault() {
  const { preview, signUp } = usePreview();
  const sender = useSender();
  const { ready, account: owner, busy, error, setError } = sender;
  const [state, setState] = useState<VaultState | null>(null);

  const refresh = useCallback(async () => {
    if (!owner || !net.factory) return;
    const vault = await publicClient.readContract({
      address: net.factory,
      abi: stashFactoryAbi,
      functionName: "vaultOf",
      args: [owner],
    });
    const walletBalances = await Promise.all(
      net.tokens.map((t) =>
        publicClient.readContract({ address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
      ),
    );
    if (vault === zeroAddress) {
      setState({
        vault: null,
        frozen: false,
        unfreezeApprovedBy: null,
        allowanceUsd: 0n,
        dailyLimitUsd: DEFAULT_POLICY.dailyLimit,
        largeThresholdUsd: DEFAULT_POLICY.largeThreshold,
        timelock: Number(DEFAULT_POLICY.timelock),
        pendingPolicy: null,
        depositRoomUsd: await depositRoom(net.factory, null),
        ownerMove: null,
        guardians: [],
        balances: net.tokens.map((token, i) => ({ token, available: 0n, total: 0n, wallet: walletBalances[i] })),
        pending: [],
        goals: [],
        autoSave: null,
      });
      return;
    }
    const read = (fn: string, args: readonly unknown[] = []) => readVault(vault, fn, args);

    const [frozen, approver, allowanceUsd, policy, guardians, nextId, goalCount, plan, proposed, room] = await Promise.all([
      read("frozen"),
      read("unfreezeApprovedBy"),
      read("remainingDailyLimit"),
      read("policy"),
      read("guardians"),
      read("nextWithdrawalId"),
      read("goalCount"),
      read("autoSaves", [owner]),
      read("pendingPolicy"),
      depositRoom(net.factory, vault),
    ]);
    const goalIds = Array.from({ length: Math.min(Number(goalCount), 20) }, (_, i) => i + 1);
    const goals: Goal[] = (await Promise.all(goalIds.map((id) => read("goals", [id])))).map((g, i) => ({
      id: goalIds[i],
      token: g[0],
      unlockAt: Number(g[1]),
      breakFeeBps: Number(g[2]),
      locked: g[3],
    }));
    const autoSave: AutoSavePlan | null =
      plan[4] === 0n
        ? null
        : { token: plan[0], interval: Number(plan[1]), goalId: Number(plan[2]), amount: plan[3], nextAt: Number(plan[4]) };
    const balances = await Promise.all(
      net.tokens.map(async (token, i) => {
        const [available, total] = await Promise.all([
          read("available", [token.address]) as Promise<bigint>,
          publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [vault] }),
        ]);
        return { token, available, total, wallet: walletBalances[i] };
      }),
    );

    setState({
      vault,
      frozen,
      unfreezeApprovedBy: approver === zeroAddress ? null : approver,
      allowanceUsd,
      dailyLimitUsd: policy[1],
      largeThresholdUsd: policy[2],
      timelock: Number(policy[0]),
      pendingPolicy:
        proposed[1] === 0n
          ? null
          : {
              timelock: Number(proposed[0].timelock),
              dailyLimitUsd: proposed[0].dailyLimit,
              largeThresholdUsd: proposed[0].largeThreshold,
              effectiveAt: Number(proposed[1]),
            },
      depositRoomUsd: room,
      ownerMove: await readOwnerMove(vault, guardians),
      guardians,
      balances,
      pending: await readPending(vault, nextId),
      goals,
      autoSave,
    });
  }, [owner]);

  useEffect(() => {
    // Only the first load reports errors; background refreshes stay quiet through RPC hiccups.
    const first = setTimeout(() => refresh().catch((e) => setError(e.shortMessage ?? e.message)), 0);
    const t = setInterval(() => refresh().catch(() => {}), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh, setError]);

  const send = async (label: string, calls: Call[]) => {
    const hash = await sender.send(label, calls);
    if (hash) await refresh();
    return hash;
  };

  const vault = state?.vault ?? null;
  const v = (functionName: string, args: readonly unknown[] = []) => vaultCall(vault as Address, functionName, args);
  const allowanceOf = (token: Token) =>
    publicClient.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner as Address, vault as Address],
    });

  const actions = {
    /** `timelock` = the owner's chosen waiting period in seconds (24 hours or longer). */
    createVault: (guardians: Address[], timelock: bigint) =>
      send("Creating your vault", [
        {
          address: net.factory as Address,
          abi: stashFactoryAbi,
          functionName: "createVault",
          args: [guardians, { ...DEFAULT_POLICY, timelock }],
        },
      ]),
    deposit: async (token: Token, amount: bigint) => {
      // Add to (not overwrite) any existing allowance, so an active auto-save keeps working.
      const current = await allowanceOf(token);
      return send("Saving", [
        { address: token.address, abi: erc20Abi, functionName: "approve", args: [vault, current + amount] },
        v("deposit", [token.address, amount]),
      ]);
    },
    createGoal: (token: Token, unlockAt: number, breakFeeBps: number) =>
      send("Creating goal", [v("createGoal", [token.address, BigInt(unlockAt), breakFeeBps])]),
    fundGoal: (id: number, amount: bigint) => send("Locking savings", [v("fundGoal", [id, amount])]),
    releaseGoal: (id: number) => send("Unlocking goal", [v("releaseGoal", [id])]),
    /** The paying wallet is the user's own wallet: it approves a year of pulls, then opts in. */
    startAutoSave: async (token: Token, amount: bigint, interval: number, goalId: number) => {
      const current = await allowanceOf(token);
      const yearOfPulls = amount * BigInt(Math.ceil((365 * 86400) / interval));
      return send("Starting auto-save", [
        { address: token.address, abi: erc20Abi, functionName: "approve", args: [vault, current + yearOfPulls] },
        v("authorizeAutoSave", [token.address, amount, BigInt(interval), goalId]),
      ]);
    },
    stopAutoSave: () => send("Stopping auto-save", [v("revokeAutoSave", [owner])]),
    /** Normally the worker does this on schedule; anyone may trigger a due pull. */
    runAutoSaveNow: () => send("Running auto-save", [v("pullAutoSave", [owner])]),
    withdraw: (token: Token, to: Address, amount: bigint) => send("Sending", [v("withdraw", [token.address, to, amount])]),
    requestWithdrawal: (token: Token, to: Address, amount: bigint) =>
      send("Starting the wait", [v("requestWithdrawal", [token.address, to, amount])]),
    executeWithdrawal: (id: bigint) => send("Releasing", [v("executeWithdrawal", [id])]),
    cancelWithdrawal: (id: bigint) => send("Cancelling", [v("cancelWithdrawal", [id])]),
    freeze: () => send("Freezing", [v("freeze")]),
    unfreeze: () => send("Unfreezing", [v("unfreeze")]),
    addGuardian: (g: Address) => send("Adding guardian", [v("addGuardian", [g])]),
    /**
     * New limits and waiting period (USD amounts in 18 decimals). Stricter rules apply at once; anything
     * looser is queued for the current waiting period, and the owner or any guardian can cancel it.
     */
    setRules: (next: { timelock: bigint; dailyLimit: bigint; largeThreshold: bigint }) =>
      send("Saving your rules", [v("proposePolicy", [next])]),
    applyRules: () => send("Applying the new rules", [v("applyPolicy")]),
    /** Names the vault's new owner key; it queues once a guardian names the same key. */
    nominateOwner: (newOwner: Address) => send("Requesting the move", [v("nominateOwner", [newOwner])]),
    applyOwnerChange: () => send("Moving your vault", [v("applyOwnerChange")]),
    cancelRules: () => send("Cancelling the rules change", [v("cancelPolicy")]),
  };

  if (preview) {
    return {
      ready, owner: undefined, network: net, configured: Boolean(net.factory), state: sampleVaultState(), busy: null, error: null, refresh,
      actions: signUpInstead(actions, signUp),
    };
  }
  return { ready, owner, network: net, configured: Boolean(net.factory), state, busy, error, refresh, actions };
}
