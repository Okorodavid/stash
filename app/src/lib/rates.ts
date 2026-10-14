"use client";

import { useEffect, useState } from "react";
import { fetchRates } from "./rateSources";

/**
 * Yearly rates in basis points, after fees. `undefined` = still loading; `null` = couldn't be loaded
 * (the app then just doesn't show a rate for that pot).
 */
export type Rates = { tempo: number | null | undefined; save: number | null | undefined; growth: number | null | undefined };

// One load per page, shared by every card that shows a rate. Mainnet rates, also shown on testnet.
// Our own /api/rates first (cached, and not blocked by ad blockers); direct calls if that fails.
let cached: Promise<Rates> | null = null;
const loadRates = () =>
  (cached ??= fetch("/api/rates")
    .then((r) => (r.ok ? (r.json() as Promise<Rates>) : Promise.reject(new Error(String(r.status)))))
    .catch(() => fetchRates())
    .then(async (r) => {
      // Fill any gap the server couldn't get with a direct call from the browser.
      if (r.tempo != null && r.save != null && r.growth != null) return r;
      const direct = await fetchRates().catch(() => ({ tempo: null, save: null, growth: null }));
      return { tempo: r.tempo ?? direct.tempo, save: r.save ?? direct.save, growth: r.growth ?? direct.growth };
    }));

export function useRates(): Rates {
  const [rates, setRates] = useState<Rates>({ tempo: undefined, save: undefined, growth: undefined });
  useEffect(() => {
    let live = true;
    loadRates().then((r) => live && setRates(r));
    return () => {
      live = false;
    };
  }, []);
  return rates;
}

/** 349 -> "3.5%" */
export const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;
