"use client";

import { useMemo, useState } from "react";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import { getBase58Decoder } from "@solana/kit";
import { SOLANA_CHAIN, confirmSignature } from "./growth";
import { CHAINS, buildSolanaTx, getQuote, isEvmTx, waitForFill, type FillStatus, type SwapToken, type Wallets } from "./swap";
import { useSender } from "./useSender";

const base58 = getBase58Decoder();

export type SwapResult = { status: FillStatus; requestId?: string };

/** Swaps between the user's own Tempo, Base and Solana wallets through Relay. */
export function useSwap() {
  const sender = useSender();
  const { wallets: solWallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const solWallet = useMemo(() => solWallets.find((w) => w.standardWallet.name === "Privy") ?? solWallets[0], [solWallets]);
  const wallets: Wallets = useMemo(() => ({ evm: sender.account, solana: solWallet?.address }), [sender.account, solWallet]);

  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SwapResult | null>(null);

  const swap = async (from: SwapToken, to: SwapToken, amount: bigint) => {
    setError(null);
    setResult(null);
    try {
      // Quote again right before sending, so the route and prices are fresh.
      setProgress("Getting the best route");
      const quote = await getQuote(from, to, amount, wallets);
      const requestId = quote.steps.find((s) => s.requestId)?.requestId;
      let status: FillStatus = "pending";
      for (const step of quote.steps) {
        if (step.kind !== "transaction") throw new Error("This route needs a signature step we don't support yet.");
        for (const item of step.items) {
          if (item.status === "complete") continue;
          const data = item.data;
          if (isEvmTx(data)) {
            const label = step.id === "approve" ? `Allowing ${from.symbol} to be swapped` : `Sending ${from.symbol}`;
            setProgress(label);
            const hash = await sender.send(label, [{ to: data.to, data: data.data, value: BigInt(data.value || "0") }], CHAINS[from.chain].evm);
            if (!hash) throw new Error("The transaction didn't go through. Nothing was swapped.");
          } else {
            if (!solWallet) throw new Error("Your Solana wallet isn't ready yet.");
            setProgress(`Sending ${from.symbol}`);
            const transaction = await buildSolanaTx(data, solWallet.address);
            const { signature } = await signAndSendTransaction({ transaction, wallet: solWallet, chain: SOLANA_CHAIN });
            await confirmSignature(base58.decode(signature));
          }
          if (item.check) {
            setProgress(`Delivering ${to.symbol} on ${CHAINS[to.chain].name}`);
            status = await waitForFill(item.check.endpoint, (s) => {
              if (s === "waiting") setProgress("Waiting for your deposit to confirm");
            });
          }
        }
      }
      setResult({ status, requestId });
      return status;
    } catch (e) {
      const err = e as { shortMessage?: string; message: string };
      setError(err.shortMessage ?? err.message);
    } finally {
      setProgress(null);
    }
  };

  // The EVM sender keeps its own error (e.g. a wallet rejection); show it with ours.
  const shownError = error && sender.error ? `${error} (${sender.error})` : error;
  return { ready: sender.ready, wallets, progress, error: shownError, result, swap, clearResult: () => setResult(null) };
}
