"use client";

import { useCallback, useEffect, useState } from "react";
import { zeroAddress, type Address } from "viem";
import { erc20Abi, stashFactoryAbi } from "./abis";
import { clientFor, depositRoom, readPending, readVault, vaultCall, type Call, type Pending } from "./chain";
import { DEFAULT_POLICY, NETWORKS, SAVE } from "./config";
import { useSender } from "./useSender";

const erc4626Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "convertToAssets", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

const network = NETWORKS[SAVE];
const client = clientFor(SAVE);
const usdc = network.tokens[0];

export type SavePotState = {
  vault: Address | null;
  adapter: Address | null; // allowlisted yield vault (Morpho on mainnet)
  walletUsdc: bigint;
  walletGas: bigint; // native ETH for fees
  idle: bigint; // USDC in the vault not earning
  earning: bigint; // USDC value of yield shares
  shares: bigint;
  frozen: boolean;
  allowanceUsd: bigint;
  largeThresholdUsd: bigint;
  timelock: number; // seconds
  /** Dollars (18 decimals) the pot can still take in during the beta; null = no cap. */
  depositRoomUsd: bigint | null;
  pending: Pending[];
};

/** The Save pot: the user's vault on Base, earning through the factory's allowlisted adapter. */
export function useSavePot() {
  const sender = useSender();
  const { account: owner, busy, error, setError } = sender;
  const [state, setState] = useState<SavePotState | null>(null);
  const enabled = Boolean(network.factory);

  const refresh = useCallback(async () => {
    if (!owner || !network.factory) return;
    const factory = network.factory;
    const [vault, targets, walletUsdc, walletGas] = await Promise.all([
      client.readContract({ address: factory, abi: stashFactoryAbi, functionName: "vaultOf", args: [owner] }),
      client.readContract({ address: factory, abi: stashFactoryAbi, functionName: "defaultYieldTargets" }),
      client.readContract({ address: usdc.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
      client.getBalance({ address: owner }),
    ]);
    const adapter = (targets as readonly Address[])[0] ?? null;
    const base = { adapter, walletUsdc, walletGas };
    if (vault === zeroAddress) {
      setState({
        ...base,
        vault: null,
        idle: 0n,
        earning: 0n,
        shares: 0n,
        frozen: false,
        allowanceUsd: 0n,
        largeThresholdUsd: DEFAULT_POLICY.largeThreshold,
        timelock: Number(DEFAULT_POLICY.timelock),
        depositRoomUsd: await depositRoom(factory, null, SAVE),
        pending: [],
      });
      return;
    }
    const read = (fn: string, args: readonly unknown[] = []) => readVault(vault, fn, args, SAVE);
    const [idle, frozen, allowanceUsd, policy, nextId, room] = await Promise.all([
      read("available", [usdc.address]),
      read("frozen"),
      read("remainingDailyLimit"),
      read("policy"),
      read("nextWithdrawalId"),
      depositRoom(factory, vault, SAVE),
    ]);
    const shares = adapter
      ? await client.readContract({ address: adapter, abi: erc4626Abi, functionName: "balanceOf", args: [vault] })
      : 0n;
    const earning =
      adapter && shares > 0n
        ? await client.readContract({ address: adapter, abi: erc4626Abi, functionName: "convertToAssets", args: [shares] })
        : 0n;
    setState({
      ...base,
      vault,
      idle,
      earning,
      shares,
      frozen,
      allowanceUsd,
      largeThresholdUsd: policy[2],
      timelock: Number(policy[0]),
      depositRoomUsd: room,
      pending: await readPending(vault, nextId, SAVE),
    });
  }, [owner]);

  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(() => refresh().catch((e) => setError(e.shortMessage ?? e.message)), 0);
    const t = setInterval(() => refresh().catch(() => {}), 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [enabled, refresh, setError]);

  const send = async (label: string, calls: Call[]) => {
    const hash = await sender.send(label, calls, SAVE);
    if (hash) await refresh();
    return hash;
  };
  const vault = state?.vault ?? null;
  const v = (fn: string, args: readonly unknown[] = []) => vaultCall(vault as Address, fn, args);

  const actions = {
    /** Same guardians and waiting period as the main vault. */
    createVault: (guardians: Address[], timelock: bigint) =>
      send("Opening your Save pot", [
        {
          address: network.factory as Address,
          abi: stashFactoryAbi,
          functionName: "createVault",
          args: [guardians, { ...DEFAULT_POLICY, timelock }],
        },
      ]),
    /** Move USDC from the wallet into the pot and start earning on it, in one flow. */
    saveAndEarn: async (amount: bigint) => {
      const current = await client.readContract({
        address: usdc.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner as Address, vault as Address],
      });
      const calls: Call[] = [
        { address: usdc.address, abi: erc20Abi, functionName: "approve", args: [vault, current + amount] },
        v("deposit", [usdc.address, amount]),
      ];
      if (state?.adapter) calls.push(v("depositToYield", [state.adapter, amount]));
      return send("Saving to your Save pot", calls);
    },
    /** Stop earning: redeem all shares back to idle USDC inside the pot. */
    stopEarning: () => send("Moving out of the earning vault", [v("redeemFromYield", [state?.adapter, state?.shares])]),
    /** Back to the user's own wallet: instant within the allowance, otherwise via the waiting period. */
    withdrawToWallet: (amount: bigint, instant: boolean) =>
      send(instant ? "Withdrawing" : "Starting the wait", [
        v(instant ? "withdraw" : "requestWithdrawal", [usdc.address, owner, amount]),
      ]),
    executeWithdrawal: (id: bigint) => send("Releasing", [v("executeWithdrawal", [id])]),
    cancelWithdrawal: (id: bigint) => send("Cancelling", [v("cancelWithdrawal", [id])]),
  };

  return { enabled, network, usdc, state, busy, error, actions };
}
