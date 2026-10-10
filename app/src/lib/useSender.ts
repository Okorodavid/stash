"use client";

import { useCallback, useMemo, useState } from "react";
import { usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, type Address, type Chain, type Hash } from "viem";
import { clientFor, type Call, type RawTx } from "./chain";
import { HOME, NETWORKS, type NetworkKey } from "./config";

type Provider = Awaited<ReturnType<ConnectedWallet["getEthereumProvider"]>>;

/**
 * Switches a wallet to `chain`, adding the network first if the wallet doesn't know it (most wallets
 * don't know Tempo yet). MetaMask only accepts 18-decimal native currencies, so that's what we declare;
 * it only affects how the wallet labels its balance.
 */
async function switchTo(provider: Provider, chain: Chain) {
  const chainId = `0x${chain.id.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e) {
    const err = e as { code?: number; message?: string };
    const unknownChain = err.code === 4902 || /unrecognized|not been added|unknown chain/i.test(err.message ?? "");
    if (!unknownChain) throw e;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: { name: chain.nativeCurrency.name, symbol: chain.nativeCurrency.symbol, decimals: 18 },
          rpcUrls: chain.rpcUrls.default.http,
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        },
      ],
    });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  }
}

/**
 * A wallet plus a safe way to send calls from it. By default the signed-in user's own wallet: the
 * embedded Privy wallet for email/Google logins, or the wallet they signed in with. Pass `pick` to send
 * from another connected wallet (e.g. depositing from MetaMask into the vault).
 */
export function useSender(pick?: (wallets: ConnectedWallet[]) => ConnectedWallet | undefined) {
  const { wallets, ready } = useWallets();
  const { user } = usePrivy();
  const loginWallet = user?.wallet?.address?.toLowerCase();
  const wallet = useMemo(
    () =>
      pick
        ? pick(wallets)
        : (wallets.find((w) => w.walletClientType === "privy") ??
          wallets.find((w) => w.address.toLowerCase() === loginWallet) ??
          wallets[0]),
    [wallets, pick, loginWallet],
  );
  const account = wallet?.address as Address | undefined;
  /** True when the key lives in Privy's embedded wallet (so Stash can show the recovery-key export). */
  const embedded = wallet?.walletClientType === "privy";
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
        await switchTo(provider, chain);
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

  return { ready, account, wallet, embedded, send, busy, error, setError };
}
