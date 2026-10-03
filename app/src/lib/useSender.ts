"use client";

import { useCallback, useMemo, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, type Address, type Hash } from "viem";
import { net, publicClient, type Call } from "./chain";

/** The signed-in user's embedded wallet, plus a safe way to send calls from it. */
export function useSender() {
  const { wallets, ready } = useWallets();
  const wallet = useMemo(() => wallets.find((w) => w.walletClientType === "privy") ?? wallets[0], [wallets]);
  const account = wallet?.address as Address | undefined;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Sends calls in order, waiting for each to confirm. Returns the last hash, or undefined on failure. */
  const send = useCallback(
    async (label: string, calls: Call[]) => {
      if (!wallet || !account) return;
      setBusy(label);
      setError(null);
      try {
        await wallet.switchChain(net.chain.id);
        const walletClient = createWalletClient({
          account,
          chain: net.chain,
          transport: custom(await wallet.getEthereumProvider()),
        });
        let hash: Hash | undefined;
        for (const call of calls) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = encodeFunctionData(call as any);
          // Tempo's estimate undercounts its expensive new-storage writes (250k gas per slot),
          // so pad it; otherwise e.g. createVault runs out of gas.
          const estimate = await publicClient.estimateGas({ account, to: call.address, data });
          // Read the nonce from the chain ourselves: Privy's own count can lag behind after a
          // reverted transaction (reverts still consume a nonce), causing "nonce too low".
          const nonce = await publicClient.getTransactionCount({ address: account, blockTag: "pending" });
          hash = await walletClient.sendTransaction({ to: call.address, data, gas: (estimate * 3n) / 2n, nonce });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error(`${label} failed on-chain (tx ${hash}).`);
        }
        return hash;
      } catch (e) {
        const err = e as { shortMessage?: string; message: string };
        setError(err.shortMessage ?? err.message);
      } finally {
        setBusy(null);
      }
    },
    [wallet, account],
  );

  return { ready, account, send, busy, error, setError };
}
