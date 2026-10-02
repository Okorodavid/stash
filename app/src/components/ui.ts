import { formatUnits } from "viem";
import type { useVault, VaultState } from "@/lib/useVault";

export type Loaded = ReturnType<typeof useVault> & { state: VaultState };

export const usd = (v: bigint, decimals: number) =>
  Number(formatUnits(v, decimals)).toLocaleString(undefined, { style: "currency", currency: "USD" });
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const card = "rounded-2xl border border-line bg-card p-4";
export const btn = "w-full rounded-xl bg-accent px-4 py-3 font-semibold text-accent-fg disabled:opacity-50";
export const btnGhost = "rounded-lg border border-line px-3 py-2 text-sm font-medium disabled:opacity-50";
export const input = "w-full rounded-xl border border-line bg-background px-3 py-3";
