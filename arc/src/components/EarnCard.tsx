"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import type { useEarn } from "@/lib/useEarn";
import { USDC } from "@/lib/config";
import { net } from "@/lib/chain";
import { usePreview } from "@/lib/preview";
import PotInfo from "./PotInfo";
import { useNotify } from "@/lib/notify";
import { pct, useEarnRate } from "@/lib/rate";
import { btn, btnGhost, card, cardTitle, cleanAmount, input, tint, usd, type Loaded } from "./ui";

/**
 * Part of the vault's USDC put to work in a curated Morpho vault on Arc (and back). Money never leaves
 * the vault's protection: the shares sit inside it, behind the same limits and guardians.
 */
export default function EarnCard({ home, earn }: { home: Loaded; earn: ReturnType<typeof useEarn> }) {
  const { state, busy, error, actions } = earn;
  const { preview } = usePreview();
  const notify = useNotify();
  const rate = useEarnRate();
  const [amount, setAmount] = useState("");
  if (!state) return null;
  let parsed = 0n;
  try {
    parsed = amount ? parseUnits(amount, USDC.decimals) : 0n;
  } catch {
    parsed = 0n;
  }
  const done = (message: string) => (hash: unknown) => {
    if (!hash) return;
    notify(message);
    setAmount("");
    void home.refresh();
  };
  return (
    <section id="earn" className={`${card} scroll-mt-6`}>
      <div className="flex items-baseline justify-between">
        <h3 className={cardTitle}>Earn on your savings</h3>
        <span className="text-right text-xs text-muted">
          {net.chain.testnet ? (
            "Test vault · 0%"
          ) : (
            <>
              {rate != null && <span className="block text-sm font-semibold text-accent-ink">{pct(rate)} a year</span>}
              Morpho on Arc
            </>
          )}
        </span>
      </div>
      <p className="text-3xl font-semibold">{usd(state.earning, USDC.decimals)}</p>
      <p className="text-sm text-muted">
        earning · {usd(state.idle, USDC.decimals)} in your vault, not earning
        {state.frozen && <span className="text-danger-ink"> · frozen</span>}
      </p>
      {busy && <p role="status" className={`mt-2 rounded-lg px-3 py-2 text-sm ${tint.accent}`}>{busy}…</p>}
      {error && <p role="alert" className={`mt-2 rounded-lg px-3 py-2 text-sm ${tint.danger}`}>{error}</p>}
      <div className="mt-3 flex gap-2">
        <input
          className={`${input} min-w-0 flex-1`}
          inputMode="decimal"
          placeholder="$ amount"
          aria-label="Amount to start earning on, in dollars"
          value={amount}
          onChange={(e) => setAmount(cleanAmount(e.target.value))}
        />
        <button
          className={`${btn.replace("w-full ", "")} shrink-0 whitespace-nowrap`}
          disabled={!preview && (!!busy || parsed === 0n || parsed > state.idle || state.frozen || !state.adapter)}
          onClick={() => actions.earn(parsed).then(done(`$${amount} is now earning. It stays behind your vault's limits and guardians.`))}
        >
          Start earning
        </button>
      </div>
      {!preview && parsed > state.idle && <p className="mt-1 text-xs text-warn-ink">That&apos;s more than your vault holds.</p>}
      {state.earning > 0n && (
        <button className={`${btnGhost} mt-2 w-full`} disabled={!!busy || state.frozen} onClick={() => actions.stopEarning().then(done("Stopped earning. The money is plain USDC in your vault again."))}>
          Stop earning (back to plain USDC in your vault)
        </button>
      )}
      {net.chain.testnet && (
        <p className="mt-2 text-xs text-muted">Testnet stand-in vault (0% yield). On mainnet this is Galaxy USDC, a curated Morpho vault.</p>
      )}
      <p className="mt-2 text-xs text-muted">
        {!net.chain.testnet && rate != null && <>Currently {pct(rate)} a year after fees; the rate moves with borrowing demand. </>}
        Earning money stays in your vault, behind the same limits and guardians.
      </p>
      <PotInfo pot="earn" />
    </section>
  );
}
