"use client";

import { useEffect, useState } from "react";

/** The Earn tab's curated Morpho vault on Arc mainnet (Galaxy USDC, Morpho Vault V2). */
export const EARN_VAULT_MAINNET = "0x8E357432CC12ff425c36432F312968aEb16112AF";

// One load per page. Morpho's API answers browsers directly (CORS open), so no server route is needed.
let cached: Promise<number | null> | null = null;
const loadRate = () =>
  (cached ??= fetch("https://blue-api.morpho.org/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: `{ vaultV2ByAddress(address: "${EARN_VAULT_MAINNET}", chainId: 5042) { netApy } }` }),
  })
    .then((r) => r.json())
    .then(({ data }) => {
      const apy = data?.vaultV2ByAddress?.netApy;
      return typeof apy === "number" && Number.isFinite(apy) ? Math.round(apy * 10_000) : null;
    })
    .catch(() => null));

/**
 * The earning vault's yearly rate in basis points, after fees. `undefined` = still loading; `null` = couldn't
 * be loaded (the card then just doesn't show a rate).
 */
export function useEarnRate(): number | null | undefined {
  const [bps, setBps] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadRate().then((r) => live && setBps(r));
    return () => {
      live = false;
    };
  }, []);
  return bps;
}

/** 309 -> "3.1%" */
export const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;
