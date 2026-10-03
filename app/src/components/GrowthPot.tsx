"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { GROWTH_DEPOSIT_CAP_USD, TRANCHE } from "@/lib/growth";
import { useGrowthPot } from "@/lib/useGrowthPot";
import { btn, btnGhost, card, input, short, usd } from "./ui";

const MIN_SOL_LAMPORTS = 5_000_000n; // ~0.005 SOL covers a handful of transactions and new token accounts

export default function GrowthPotCard() {
  const { address, state, busy, error, actions } = useGrowthPot();
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);

  const header = (
    <>
      <div className="flex items-baseline justify-between">
        <p className="font-medium">Growth pot</p>
        <span className="text-xs text-muted">Solana · real money · beta</span>
      </div>
      <p className="text-sm text-muted">
        {TRANCHE.name} via Reflect. You hold the senior (protected) side: others absorb the first losses in exchange for extra yield.
      </p>
    </>
  );

  if (!address) {
    return (
      <section className={card}>
        {header}
        <p className="mt-2 text-sm text-muted">Setting up your Solana wallet…</p>
      </section>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Your Solana address:", address);
    }
  };

  const amt = Number(amount || 0);
  const overCap = amt > GROWTH_DEPOSIT_CAP_USD;
  const lowSol = state ? state.sol < MIN_SOL_LAMPORTS : false;

  return (
    <section className={card}>
      {header}
      {state ? (
        <>
          <p className="mt-2 text-3xl font-semibold">
            {state.valueUsd.toLocaleString(undefined, { style: "currency", currency: "USD" })}
          </p>
          <p className="text-sm text-muted">
            Earning about {(state.apyBps / 100).toFixed(1)}% a year right now (rate changes) · wallet {usd(state.usdc, 6)} USDC
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">Loading…</p>
      )}

      <button className="mt-2 text-xs underline" onClick={copy}>
        {copied ? "Solana address copied ✓" : `Your Solana address: ${short(address)} · copy`}
      </button>
      {lowSol && (
        <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
          Send about 0.01 SOL to this address to pay Solana network fees, plus the USDC you want to grow.
        </p>
      )}
      {busy && <p className="mt-2 rounded-lg bg-accent/10 px-3 py-2 text-sm">{busy}…</p>}
      {error && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {state && state.strandedBase > 0n && (
        <div className="mt-3 rounded-xl border border-warn p-3 text-sm">
          <p>A move stopped halfway: you hold sHYUSD that isn&apos;t protected yet.</p>
          <div className="mt-2 flex gap-2">
            <button className={btnGhost} disabled={!!busy || lowSol} onClick={() => actions.finishIntoGrowth()}>
              Finish into Growth
            </button>
            <button className={btnGhost} disabled={!!busy || lowSol} onClick={() => actions.finishToUsdc()}>
              Swap back to USDC
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input className={input} inputMode="decimal" placeholder={`$ up to ${GROWTH_DEPOSIT_CAP_USD}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button
          className={btnGhost}
          disabled={!!busy || !amt || overCap || lowSol || !state || parseUnits(amount || "0", 6) > state.usdc}
          onClick={() => actions.deposit(parseUnits(amount, 6)).then(() => setAmount(""))}
        >
          Grow
        </button>
      </div>
      {overCap && <p className="mt-1 text-xs text-warn">Beta limit: ${GROWTH_DEPOSIT_CAP_USD} per deposit while we&apos;re unaudited.</p>}

      {state && state.protectedTokens > 0n && (
        <button className={`${btn} mt-2`} disabled={!!busy || lowSol} onClick={() => actions.withdrawAll()}>
          Move everything back to USDC
        </button>
      )}

      <p className="mt-3 text-xs text-muted">
        Unlike your vault, this pot doesn&apos;t have daily limits or guardians yet. Keep amounts small during the beta.
      </p>
    </section>
  );
}
