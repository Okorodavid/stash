"use client";

import { useCallback, useEffect, useState } from "react";
import { zeroAddress, type Address } from "viem";
import { erc20Abi } from "./abis";
import { net, publicClient, readOwnerMove, readPending, readVault, vaultCall, type Call, type OwnerMove, type Pending } from "./chain";
import { useSender } from "./useSender";

export type GuardianInfo = {
  address: Address;
  /** Unix time from which this guardian counts for unfreezing (0 = not a guardian). */
  establishedAt: number;
  /** Unix time a proposed removal takes effect (0 = none pending). */
  removalAt: number;
};

export type GuardianViewState = {
  owner: Address;
  frozen: boolean;
  unfreezeApprovedBy: Address | null;
  timelock: number;
  dailyLimitUsd: bigint;
  largeThresholdUsd: bigint;
  guardians: GuardianInfo[];
  totalUsd: number;
  pending: Pending[];
  /** A proposed loosening of the vault's limits, if any. */
  pendingPolicy: { dailyLimitUsd: bigint; largeThresholdUsd: bigint; timelock: number; effectiveAt: number } | null;
  /** Moving the vault to a new owner key; null if this vault predates the feature. */
  ownerMove: OwnerMove | null;
};

/** A vault seen by one of its guardians (or anyone: actions only succeed for guardians). */
export function useGuardian(vault: Address) {
  const sender = useSender();
  const { account, busy, error, setError } = sender;
  const [state, setState] = useState<GuardianViewState | null>(null);

  const refresh = useCallback(async () => {
    const read = (fn: string, args: readonly unknown[] = []) => readVault(vault, fn, args);
    const [owner, frozen, approver, policy, guardianList, nextId, pendingPolicy] = await Promise.all([
      read("owner"),
      read("frozen"),
      read("unfreezeApprovedBy"),
      read("policy"),
      read("guardians"),
      read("nextWithdrawalId"),
      read("pendingPolicy"),
    ]);
    const guardians: GuardianInfo[] = await Promise.all(
      (guardianList as Address[]).map(async (g) => {
        const [establishedAt, removalAt] = await Promise.all([
          read("guardianEstablishedAt", [g]),
          read("guardianRemovalAt", [g]),
        ]);
        return { address: g, establishedAt: Number(establishedAt), removalAt: Number(removalAt) };
      }),
    );
    const totals = await Promise.all(
      net.tokens.map(async (t) => {
        const bal = await publicClient.readContract({ address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [vault] });
        return Number(bal) / 10 ** t.decimals;
      }),
    );
    const [proposed, effectiveAt] = pendingPolicy;
    setState({
      owner,
      frozen,
      unfreezeApprovedBy: approver === zeroAddress ? null : approver,
      timelock: Number(policy[0]),
      dailyLimitUsd: policy[1],
      largeThresholdUsd: policy[2],
      guardians,
      totalUsd: totals.reduce((a, b) => a + b, 0),
      pending: await readPending(vault, nextId),
      ownerMove: await readOwnerMove(vault, guardianList as Address[]),
      pendingPolicy:
        Number(effectiveAt) === 0
          ? null
          : {
              timelock: Number(proposed.timelock),
              dailyLimitUsd: proposed.dailyLimit,
              largeThresholdUsd: proposed.largeThreshold,
              effectiveAt: Number(effectiveAt),
            },
    });
  }, [vault]);

  useEffect(() => {
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
  const v = (fn: string, args: readonly unknown[] = []) => vaultCall(vault, fn, args);

  const me = state?.guardians.find((g) => g.address.toLowerCase() === account?.toLowerCase());

  const actions = {
    cancelWithdrawal: (id: bigint) => send("Stopping withdrawal", [v("cancelWithdrawal", [id])]),
    approveWithdrawal: (id: bigint) => send("Marking as reviewed", [v("approveWithdrawal", [id])]),
    freeze: () => send("Freezing vault", [v("freeze")]),
    approveUnfreeze: () => send("Approving unfreeze", [v("approveUnfreeze")]),
    vetoGuardian: (g: Address) => send("Removing new guardian", [v("vetoGuardian", [g])]),
    cancelGuardianRemoval: (g: Address) => send("Keeping guardian", [v("cancelGuardianRemoval", [g])]),
    cancelPolicy: () => send("Blocking limit change", [v("cancelPolicy")]),
    nominateOwner: (newOwner: Address) => send("Naming the new owner", [v("nominateOwner", [newOwner])]),
    cancelOwnerChange: () => send("Stopping the move", [v("cancelOwnerChange")]),
    applyOwnerChange: () => send("Completing the move", [v("applyOwnerChange")]),
  };

  return { account, isGuardian: Boolean(me), me, state, busy, error, actions };
}
