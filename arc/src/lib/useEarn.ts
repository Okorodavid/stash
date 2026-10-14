"use client";

import { useCallback, useEffect, useState } from "react";
import { zeroAddress, type Address } from "viem";
import { stashFactoryAbi } from "./abis";
import { net, publicClient, readVault, vaultCall, type Call } from "./chain";
import { USDC } from "./config";
import { signUpInstead, usePreview } from "./preview";
import { useSender } from "./useSender";

const erc4626Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "convertToAssets", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

export type EarnState = {
  vault: Address | null;
  adapter: Address | null; // the factory's allowlisted Morpho USDC vault on Arc
  idle: bigint; // USDC in the vault, not earning
  earning: bigint; // USDC value of the vault's Morpho shares
  shares: bigint;
  frozen: boolean;
};

const EMPTY: EarnState = { vault: null, adapter: null, idle: 0n, earning: 0n, shares: 0n, frozen: false };

/**
 * Earning on Arc: part of the vault's USDC goes into a curated Morpho vault and comes back on request.
 * The shares stay inside the Stash vault, behind the same limits and guardians.
 */
export function useEarn() {
  const { preview, signUp } = usePreview();
  const sender = useSender();
  const { account: owner, busy, error, setError } = sender;
  const [state, setState] = useState<EarnState | null>(null);

  const refresh = useCallback(async () => {
    if (!owner || !net.factory) return;
    const factory = net.factory;
    const [vault, targets] = await Promise.all([
      publicClient.readContract({ address: factory, abi: stashFactoryAbi, functionName: "vaultOf", args: [owner] }),
      publicClient.readContract({ address: factory, abi: stashFactoryAbi, functionName: "defaultYieldTargets" }),
    ]);
    const adapter = (targets as readonly Address[])[0] ?? null;
    if (vault === zeroAddress) {
      setState({ ...EMPTY, adapter });
      return;
    }
    const [idle, frozen, shares] = await Promise.all([
      readVault(vault, "available", [USDC.address]) as Promise<bigint>,
      readVault(vault, "frozen") as Promise<boolean>,
      adapter
        ? publicClient.readContract({ address: adapter, abi: erc4626Abi, functionName: "balanceOf", args: [vault] })
        : Promise.resolve(0n),
    ]);
    const earning =
      adapter && shares > 0n
        ? await publicClient.readContract({ address: adapter, abi: erc4626Abi, functionName: "convertToAssets", args: [shares] })
        : 0n;
    setState({ vault, adapter, idle, earning, shares, frozen });
  }, [owner]);

  useEffect(() => {
    if (preview) return;
    const first = setTimeout(() => refresh().catch((e) => setError(e.shortMessage ?? e.message)), 0);
    const t = setInterval(() => refresh().catch(() => {}), 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [preview, refresh, setError]);

  const send = async (label: string, calls: Call[]) => {
    const hash = await sender.send(label, calls);
    if (hash) await refresh();
    return hash;
  };
  const vault = state?.vault ?? null;
  const v = (fn: string, args: readonly unknown[] = []) => vaultCall(vault as Address, fn, args);

  const actions = {
    /** Put USDC already in the vault to work (it stays in the vault, as shares). */
    earn: (amount: bigint) => send("Starting to earn", [v("depositToYield", [state?.adapter, amount])]),
    /** Stop earning: redeem all shares back to plain USDC inside the vault. */
    stopEarning: () => send("Moving out of the earning vault", [v("redeemFromYield", [state?.adapter, state?.shares])]),
  };

  if (preview) return { state: EMPTY, busy: null, error: null, refresh, actions: signUpInstead(actions, signUp) };
  return { state, busy, error, refresh, actions };
}
