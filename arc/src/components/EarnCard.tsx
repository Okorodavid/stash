"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import type { useEarn } from "@/lib/useEarn";
import { USDC } from "@/lib/config";
import { net } from "@/lib/chain";
import { usePreview } from "@/lib/preview";
import PotInfo from "./PotInfo";
import { btnGhost, card, input, usd, type Loaded } from "./ui";

/**
 * Part of the vault's USDC put to work in a curated Morpho vault on Arc (and back). Money never leaves
 * the vault's protection: the shares sit inside it, behind the same limits and guardians.
 */
export default function EarnCard({ home, earn }: { home: Loaded; earn: ReturnType<typeof useEarn> }) {
  const { state, busy, error, actions } = earn;
  const { preview } = usePreview();
  const [amount, setAmount] = useState("");
  if (!state) return null;
  let parsed = 0n;
  try {
    parsed = amount ? parseUnits(amount, USDC.decimals) : 0n;
  } catch {
    parsed = 0n;
  }
  const done = (hash: unknown) => {
    if (!hash) return;
    setAmount("");
    void home.refresh();
  };
  return (
    <section id="earn" className={`${card} scroll-mt-6`}>
      <div className="flex items-baseline justify-between">
        <p className="font-medium">Earn on your savings</p>
        <span className="text-xs text-muted">{net.chain.testnet ? "Test vault" : "Morpho on Arc"}</span>
      </div>
      <p className="text-3xl font-semibold">{usd(state.earning, USDC.decimals)}</p>
      <p className="text-sm text-muted">
        earning · {usd(state.idle, USDC.decimals)} in your vault, not earning
        {state.frozen && <span className="text-danger"> · frozen</span>}
      </p>
      {busy && <p className="mt-2 rounded-lg bg-accent/10 px-3 py-2 text-sm">{busy}…</p>}
      {error && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <input className={input} inputMode="decimal" placeholder="$ amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
        <button
          className={btnGhost}
          disabled={!preview && (!!busy || parsed === 0n || parsed > state.idle || state.frozen || !state.adapter)}
          onClick={() => actions.earn(parsed).then(done)}
        >
          Start earning
        </button>
      </div>
      {!preview && parsed > state.idle && <p className="mt-1 text-xs text-warn">That&apos;s more than your vault holds.</p>}
      {state.earning > 0n && (
        <button className={`${btnGhost} mt-2 w-full`} disabled={!!busy || state.frozen} onClick={() => actions.stopEarning().then(done)}>
          Stop earning (back to plain USDC in your vault)
        </button>
      )}
      {net.chain.testnet && (
        <p className="mt-2 text-xs text-muted">Testnet stand-in vault (0% yield). On mainnet this is Galaxy USDC, a curated Morpho vault.</p>
      )}
      <p className="mt-2 text-xs text-muted">Earning money stays in your vault, behind the same limits and guardians.</p>
      <PotInfo pot="earn" />
    </section>
  );
}
