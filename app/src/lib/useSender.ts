"use client";

import { useCallback, useMemo, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, type Address, type Hash } from "viem";
import { clientFor, type Call, type RawTx } from "./chain";
import { HOME, NETWORKS, type NetworkKey } from "./config";

/** The signed-in user's embedded wallet, plus a safe way to send calls from it. */
export function useSender() {
  const { wallets, ready } = useWallets();
  const wallet = useMemo(() => wallets.find((w) => w.walletClientType === "privy") ?? wallets[0], [wallets]);
  const account = wallet?.address as Address | undefined;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Sends calls in order on the given network, waiting for each to confirm. Returns the last hash, or undefined on failure. */
  const send = useCallback(
    async (label: string, calls: (Call | RawTx)[], key: NetworkKey = HOME) => {
      if (!wallet || !account) return;
      const { chain } = NETWORKS[key];
      const publicClient = clientFor(key);
      setBusy(label);
      setError(null);
      try {
        // Privy's switchChain can resolve before its provider reflects the new chain, so switch
        // through the provider and wait until it actually reports the target chain.
        const provider = await wallet.getEthereumProvider();
        const target = `0x${chain.id.toString(16)}`;
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target }] });
        for (let i = 0; ; i++) {
          const current = (await provider.request({ method: "eth_chainId" })) as string;
          if (parseInt(current, 16) === chain.id) break;
          if (i >= 20) throw new Error(`Could not switch your wallet to ${chain.name}. Please try again.`);
          await new Promise((r) => setTimeout(r, 150));
        }
        const walletClient = createWalletClient({ account, chain, transport: custom(provider) });
        let hash: Hash | undefined;
        for (const call of calls) {
          const raw = "data" in call;
          const to = raw ? call.to : call.address;
          const value = raw ? call.value : undefined;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = raw ? call.data : encodeFunctionData(call as any);
          // Tempo's estimate undercounts its expensive new-storage writes (250k gas per slot),
          // so pad it; otherwise e.g. createVault runs out of gas.
          const estimate = await publicClient.estimateGas({ account, to, data, value });
          // Read the nonce from the chain ourselves: Privy's own count can lag behind after a
          // reverted transaction (reverts still consume a nonce), causing "nonce too low".
          const nonce = await publicClient.getTransactionCount({ address: account, blockTag: "pending" });
          hash = await walletClient.sendTransaction({ to, data, value, gas: (estimate * 3n) / 2n, nonce });
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
