"use client";

import { useEffect, useState } from "react";
import { parseUnits } from "viem";
import { GROWTH_DEPOSIT_CAP_USD, TRANCHE } from "@/lib/growth";
import { useGrowthPot } from "@/lib/useGrowthPot";
import PotInfo from "./PotInfo";
import { btn, btnGhost, card, input, short, usd } from "./ui";

const MIN_SOL_LAMPORTS = 5_000_000n; // ~0.005 SOL covers a handful of transactions and new token accounts

/** Max share of total savings the Growth pot may hold. 50% by default; raising it is the user's call. */
const LIMIT_OPTIONS = [0.5, 0.75, 1] as const;
const limitKey = (addr: string) => `stash:growth-max-share:${addr}`;

function useGrowthLimit(address: string | undefined) {
  const [limit, setLimitState] = useState(0.5);
  useEffect(() => {
    if (!address) return;
    const t = setTimeout(() => {
      try {
        const v = Number(localStorage.getItem(limitKey(address)));
        if ((LIMIT_OPTIONS as readonly number[]).includes(v)) setLimitState(v);
      } catch {
        // Storage blocked: keep the safe 50% default.
      }
    }, 0);
    return () => clearTimeout(t);
  }, [address]);
  const setLimit = (v: number) => {
    setLimitState(v);
    try {
      if (address) localStorage.setItem(limitKey(address), String(v));
    } catch {
      // Not persisted; applies for this visit only.
    }
  };
  return { limit, setLimit };
}

/**
 * Largest deposit keeping Growth at or below `limit` of all savings:
 * growth + d <= limit * (other + growth + d)  =>  d <= (limit*other - (1-limit)*growth) / (1-limit)
 */
function maxByShare(limit: number, otherUsd: number, growthUsd: number) {
  if (limit >= 1) return Infinity;
  return Math.max(0, (limit * otherUsd - (1 - limit) * growthUsd) / (1 - limit));
}

export default function GrowthPotCard({ otherSavingsUsd }: { otherSavingsUsd: number }) {
  const { address, state, busy, error, actions } = useGrowthPot();
  const { limit, setLimit } = useGrowthLimit(address);
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
  const growthUsd = state?.valueUsd ?? 0;
  const shareRoom = maxByShare(limit, otherSavingsUsd, growthUsd);
  const maxDeposit = Math.floor(Math.min(GROWTH_DEPOSIT_CAP_USD, shareRoom) * 100) / 100;
  const overCap = amt > GROWTH_DEPOSIT_CAP_USD;
  const overShare = !overCap && amt > shareRoom;
  const totalUsd = otherSavingsUsd + growthUsd;
  const sharePct = totalUsd > 0 ? Math.round((growthUsd / totalUsd) * 100) : 0;
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
        <input className={input} inputMode="decimal" placeholder={maxDeposit > 0 ? `$ up to ${maxDeposit}` : "Save in your vault first"} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button
          className={btnGhost}
          disabled={!!busy || !amt || overCap || overShare || lowSol || !state || parseUnits(amount || "0", 6) > state.usdc}
          onClick={() => actions.deposit(parseUnits(amount, 6)).then(() => setAmount(""))}
        >
          Grow
        </button>
      </div>
      {overCap && <p className="mt-1 text-xs text-warn">Beta limit: ${GROWTH_DEPOSIT_CAP_USD} per deposit while we&apos;re unaudited.</p>}
      {overShare && (
        <p className="mt-1 text-xs text-warn">
          That would put more than {Math.round(limit * 100)}% of your savings in Growth. You can add up to $
          {maxDeposit.toFixed(2)} right now.
        </p>
      )}

      <div className="mt-3 rounded-xl border border-line p-3 text-sm">
        <p>
          Growth is {sharePct}% of your savings. Limit:{" "}
          <select className="ml-1 rounded-lg border border-line bg-background px-2 py-1" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={0.5}>50% (recommended)</option>
            <option value={0.75}>75%</option>
            <option value={1}>No limit</option>
          </select>
        </p>
        <p className="mt-1 text-xs text-muted">
          {limit === 0.5
            ? "Keeping at least half your savings outside Growth means one protocol problem can't wipe you out."
            : "Higher risk: if Reflect, Hylo or Solana DeFi has a serious problem, you could lose a large part of your savings. Only raise this if you can afford that."}
        </p>
      </div>

      {state && state.protectedTokens > 0n && (
        <button className={`${btn} mt-2`} disabled={!!busy || lowSol} onClick={() => actions.withdrawAll()}>
          Move everything back to USDC
        </button>
      )}

      <p className="mt-3 text-xs text-muted">
        Unlike your vault, this pot doesn&apos;t have daily limits or guardians yet. Keep amounts small during the beta.
      </p>
      <PotInfo pot="growth" />
    </section>
  );
}
