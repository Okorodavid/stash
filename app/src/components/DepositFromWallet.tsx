"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnectWallet, type ConnectedWallet } from "@privy-io/react-auth";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";
import { HAS_TEST_FAUCET, fundFromTestFaucet, net, publicClient, vaultCall } from "@/lib/chain";
import { usePreview } from "@/lib/preview";
import { useSender } from "@/lib/useSender";
import { btnGhost, card, input, short, usd, type Loaded } from "./ui";

/**
 * Save into the vault from a wallet the user already has (MetaMask, Rabby, Coinbase Wallet…), while
 * their Stash login stays the owner. Anyone may deposit into a vault; that wallet only sends.
 */
export default function DepositFromWallet({ ctx }: { ctx: Loaded }) {
  const { preview, signUp } = usePreview();
  const { connectWallet } = useConnectWallet();
  const owner = ctx.owner?.toLowerCase();
  const pick = useCallback(
    (ws: ConnectedWallet[]) => ws.find((w) => w.walletClientType !== "privy" && w.address.toLowerCase() !== owner),
    [owner],
  );
  const ext = useSender(pick);
  const token = ctx.state.balances[0].token;
  const vault = ctx.state.vault as Address;
  const [balance, setBalance] = useState<bigint | null>(null);
  const [amount, setAmount] = useState("");
  const [funding, setFunding] = useState(false);

  const loadBalance = useCallback(async () => {
    if (!ext.account) return;
    setBalance(await publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [ext.account] }));
  }, [ext.account, token.address]);
  useEffect(() => {
    if (preview || !ext.account) return;
    const first = setTimeout(() => loadBalance().catch(() => {}), 0);
    const t = setInterval(() => loadBalance().catch(() => {}), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [preview, ext.account, loadBalance]);

  const connect = () => (preview ? signUp() : connectWallet({ walletChainType: "ethereum-only" }));

  let parsed = 0n;
  try {
    parsed = amount ? parseUnits(amount, token.decimals) : 0n;
  } catch {
    parsed = 0n;
  }
  const room = ctx.state.depositRoomUsd;
  const overCap = room !== null && Number(amount || 0) > Number(formatUnits(room, 18));
  const tooMuch = balance !== null && parsed > balance;

  const save = async () => {
    if (preview) return signUp();
    if (!ext.account || parsed === 0n) return;
    const current = await publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "allowance", args: [ext.account, vault] });
    const hash = await ext.send("Saving from your wallet", [
      { address: token.address, abi: erc20Abi, functionName: "approve", args: [vault, current + parsed] },
      vaultCall(vault, "deposit", [token.address, parsed]),
    ]);
    if (hash) {
      setAmount("");
      await Promise.all([loadBalance(), ctx.refresh()]);
    }
  };

  const testDollars = async () => {
    if (!ext.account) return;
    setFunding(true);
    try {
      await fundFromTestFaucet(ext.account);
      await new Promise((r) => setTimeout(r, 2500));
      await loadBalance();
    } catch (e) {
      ext.setError((e as Error).message);
    } finally {
      setFunding(false);
    }
  };

  return (
    <section className={card}>
      <p className="font-medium">Save from another wallet</p>
      <p className="mt-1 text-sm text-muted">
        Already hold dollars in MetaMask, Rabby or Coinbase Wallet? Connect it and move them into your vault. That wallet
        only sends; your Stash login stays in charge of the vault.
      </p>

      {!ext.account || preview ? (
        <button className={`${btnGhost} mt-3 w-full`} onClick={connect}>
          Connect a wallet
        </button>
      ) : (
        <>
          <p className="mt-3 text-sm">
            <span className="font-mono">{short(ext.account)}</span> ·{" "}
            {balance === null ? "…" : `${usd(balance, token.decimals)} ${token.symbol}`} on {net.chain.name}{" "}
            <button className="ml-1 text-xs underline" onClick={() => ext.wallet?.disconnect()}>
              Disconnect
            </button>
          </p>
          <div className="mt-2 flex gap-2">
            <input className={input} inputMode="decimal" placeholder="$ amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
            <button className={btnGhost} disabled={!!ext.busy || parsed === 0n || tooMuch || overCap} onClick={save}>
              Save
            </button>
          </div>
          {tooMuch && <p className="mt-1 text-xs text-warn">That&apos;s more than this wallet holds.</p>}
          {overCap && <p className="mt-1 text-xs text-warn">That&apos;s over your vault&apos;s beta limit.</p>}
          {balance === 0n &&
            (HAS_TEST_FAUCET ? (
              <button className="mt-2 text-xs underline" disabled={funding} onClick={testDollars}>
                {funding ? "Getting test dollars…" : "Testnet: get free test dollars for this wallet"}
              </button>
            ) : (
              <p className="mt-2 text-xs text-muted">
                This wallet has no {token.symbol} on {net.chain.name} yet. Move dollars to {net.chain.name} first, for example with
                relay.link. The wallet also needs a few cents of a {net.chain.name} stablecoin for the fee.
              </p>
            ))}
          {ext.busy && <p className="mt-2 rounded-lg bg-accent/10 px-3 py-2 text-sm">{ext.busy}…</p>}
          {ext.error && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{ext.error}</p>}
        </>
      )}
    </section>
  );
}
