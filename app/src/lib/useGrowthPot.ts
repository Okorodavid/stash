"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import { getBase58Decoder } from "@solana/kit";
import {
  SOLANA_CHAIN,
  TRANCHE,
  USDC_MINT,
  confirmSignature,
  fromBase64,
  jupiterQuote,
  jupiterSwapTx,
  quoteTranche,
  solBalance,
  tokenBalance,
  trancheMintTx,
  trancheRedeemTx,
  trancheStats,
} from "./growth";

export type GrowthState = {
  usdc: bigint; // wallet USDC (6 decimals)
  sol: bigint; // lamports, for fees
  protectedTokens: bigint; // senior tranche tokens held
  /** sHYUSD sitting in the wallet: only non-zero if a two-step move stopped halfway. */
  strandedBase: bigint;
  valueUsd: number; // value of protectedTokens
  apyBps: number;
};

const base58 = getBase58Decoder();
// A Reflect quote can move slightly between quoting and landing; accept up to 1% less.
const withSlippage = (x: bigint) => (x * 99n) / 100n;

/** Growth pot: USDC on Solana → sHYUSD (Jupiter) → Reflect Protected tranche, and back. */
export function useGrowthPot() {
  const { wallets, ready } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const wallet = useMemo(() => wallets.find((w) => w.standardWallet.name === "Privy") ?? wallets[0], [wallets]);
  const address = wallet?.address;

  const [state, setState] = useState<GrowthState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    const [usdc, sol, protectedTokens, strandedBase, stats] = await Promise.all([
      tokenBalance(address, USDC_MINT),
      solBalance(address),
      tokenBalance(address, TRANCHE.seniorMint),
      tokenBalance(address, TRANCHE.baseMint),
      trancheStats(),
    ]);
    setState({
      usdc,
      sol,
      protectedTokens,
      strandedBase,
      valueUsd: (Number(protectedTokens) / 10 ** TRANCHE.decimals) * stats.usdPerToken,
      apyBps: stats.apyBps,
    });
  }, [address]);

  useEffect(() => {
    if (!address) return;
    const first = setTimeout(() => refresh().catch((e) => setError(e.message)), 0);
    const t = setInterval(() => refresh().catch(() => {}), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [address, refresh]);

  const sendBase64 = async (b64: string) => {
    if (!wallet) throw new Error("No Solana wallet");
    const { signature } = await signAndSendTransaction({ transaction: fromBase64(b64), wallet, chain: SOLANA_CHAIN });
    await confirmSignature(base58.decode(signature));
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const protect = async (owner: string, amount: bigint) => {
    const expected = await quoteTranche("mint", amount);
    await sendBase64(await trancheMintTx(owner, amount, withSlippage(expected)));
  };
  const swapBack = async (owner: string, amount: bigint) =>
    sendBase64(await jupiterSwapTx(await jupiterQuote(TRANCHE.baseMint, USDC_MINT, amount), owner));

  const actions = {
    /** USDC → sHYUSD → Protected tranche. Two transactions. */
    deposit: (usdcAmount: bigint) =>
      run("Moving into Growth", async () => {
        const owner = address!;
        const before = await tokenBalance(owner, TRANCHE.baseMint);
        const quote = await jupiterQuote(USDC_MINT, TRANCHE.baseMint, usdcAmount);
        setBusy("Step 1 of 2: swapping USDC");
        await sendBase64(await jupiterSwapTx(quote, owner));
        const received = (await tokenBalance(owner, TRANCHE.baseMint)) - before;
        if (received <= 0n) throw new Error("Swap landed but no sHYUSD arrived yet; try again in a moment");
        setBusy("Step 2 of 2: adding loss protection");
        await protect(owner, received);
      }),
    /** Protected tranche → sHYUSD → USDC. Redeems everything (senior redemptions are instant). */
    withdrawAll: () =>
      run("Moving out of Growth", async () => {
        const owner = address!;
        const tokens = await tokenBalance(owner, TRANCHE.seniorMint);
        if (tokens === 0n) return;
        const before = await tokenBalance(owner, TRANCHE.baseMint);
        setBusy("Step 1 of 2: leaving the Protected tranche");
        const expected = await quoteTranche("redeem", tokens);
        await sendBase64(await trancheRedeemTx(owner, tokens, withSlippage(expected)));
        const base = (await tokenBalance(owner, TRANCHE.baseMint)) - before;
        if (base <= 0n) throw new Error("Redeemed, but sHYUSD hasn't arrived yet; swap it back from the card shortly");
        setBusy("Step 2 of 2: swapping back to USDC");
        await swapBack(owner, base);
      }),
    /** Recovery for a move that stopped halfway: protect or cash out the stranded sHYUSD. */
    finishIntoGrowth: () =>
      run("Adding loss protection", async () => protect(address!, await tokenBalance(address!, TRANCHE.baseMint))),
    finishToUsdc: () =>
      run("Swapping back to USDC", async () => swapBack(address!, await tokenBalance(address!, TRANCHE.baseMint))),
  };

  return { ready, address, state, busy, error, refresh, actions };
}
