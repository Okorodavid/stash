import { formatUnits } from "viem";
import type { useVault, VaultState } from "@/lib/useVault";

export type Loaded = ReturnType<typeof useVault> & { state: VaultState };

/** Dollars for display: "$1,234.56". */
export const dollars = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" });
export const usd = (v: bigint, decimals: number) => dollars(Number(formatUnits(v, decimals)));
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
/** Typed amounts: accept "1,5" as 1.5 and drop anything that isn't a digit or the decimal point. */
export const cleanAmount = (v: string) => v.replace(",", ".").replace(/[^0-9.]/g, "");

export const card = "rounded-2xl border border-line bg-card p-4";
/** Card heading (an h2): one step above body text so sections scan. */
export const cardTitle = "text-base font-semibold tracking-tight";
export const btn =
  "w-full min-h-11 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-fg transition-colors hover:bg-accent-strong disabled:opacity-50 disabled:hover:bg-accent";
/** Primary button for actions that start a wait (amber = waiting). */
export const btnWarn =
  "w-full min-h-11 rounded-xl bg-warn px-4 py-3 font-semibold text-warn-fg transition-opacity hover:opacity-90 disabled:opacity-50";
/** Primary button for stopping or cancelling money in motion. */
export const btnDanger =
  "w-full min-h-11 rounded-xl bg-danger px-4 py-3 font-semibold text-danger-fg transition-opacity hover:opacity-90 disabled:opacity-50";
export const btnGhost =
  "min-h-11 rounded-xl border border-line-strong px-3 py-2 text-sm font-medium transition-colors hover:bg-panel disabled:opacity-50 disabled:hover:bg-transparent";
export const input = "w-full min-h-11 rounded-xl border border-line-strong bg-background px-3 py-3";
/** Small text link that still has a 44px tall tap area. */
export const textLink = "inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground";
/** A pale tint of a status hue with readable text on it. */
export const tint = {
  accent: "bg-accent/10 text-accent-ink",
  warn: "bg-warn/10 text-warn-ink",
  danger: "bg-danger/10 text-danger-ink",
} as const;

/** Waiting period in words: "24 hours", "36 hours", "3 days". */
export const waitText = (seconds: number) => {
  const h = Math.round(seconds / 3600);
  return h >= 48 && h % 24 === 0 ? `${h / 24} days` : `${h} hours`;
};
/** Same, as an adjective: "24-hour", "3-day". */
export const waitAdj = (seconds: number) => waitText(seconds).replace(/s$/, "").replace(" ", "-");

/** Time left in words: "3d 4h", "18h 42m", "12m". */
export const timeLeft = (seconds: number) => {
  // Round to whole minutes first, so "59.5 minutes" becomes "1h 0m" rather than "0h 60m".
  const total = Math.ceil(Math.max(0, seconds) / 60);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

/** A moment in the user's words: "3:40 pm" today, "Tue 3:40 pm" this week, otherwise "14 Oct, 3:40 pm". */
export const when = (unix: number, now = Date.now() / 1000) => {
  const d = new Date(unix * 1000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = new Date(now * 1000).toDateString() === d.toDateString();
  if (sameDay) return time;
  if (Math.abs(unix - now) < 6 * 86_400) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
};
