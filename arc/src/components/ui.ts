import { formatUnits } from "viem";
import type { useVault, VaultState } from "@/lib/useVault";

export type Loaded = ReturnType<typeof useVault> & { state: VaultState };

export const usd = (v: bigint, decimals: number) =>
  Number(formatUnits(v, decimals)).toLocaleString(undefined, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" });
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const card = "rounded-2xl border border-line bg-card p-4";
export const btn = "w-full rounded-xl bg-accent px-4 py-3 font-semibold text-accent-fg disabled:opacity-50";
/** Primary button for actions that start a wait (amber = waiting). */
export const btnWarn = btn.replace("bg-accent", "bg-warn").replace("text-accent-fg", "text-warn-fg");
export const btnGhost = "rounded-lg border border-line px-3 py-2 text-sm font-medium disabled:opacity-50";
export const input = "w-full rounded-xl border border-line bg-background px-3 py-3";

/** Waiting period in words: "24 hours", "36 hours", "3 days". */
export const waitText = (seconds: number) => {
  const h = Math.round(seconds / 3600);
  return h >= 48 && h % 24 === 0 ? `${h / 24} days` : `${h} hours`;
};
/** Same, as an adjective: "24-hour", "3-day". */
export const waitAdj = (seconds: number) => waitText(seconds).replace(/s$/, "").replace(" ", "-");

/** Time left in words: "3d 4h", "18h 42m", "12m". */
export const timeLeft = (seconds: number) => {
  const s = Math.max(0, seconds);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.ceil((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};
