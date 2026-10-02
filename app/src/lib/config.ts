import { base, baseSepolia, tempo, tempoModerato } from "viem/chains";
import type { Address, Chain } from "viem";

export type Token = { symbol: string; address: Address; decimals: number };

type Network = {
  chain: Chain;
  factory: Address | undefined;
  tokens: Token[];
};

const env = (v: string | undefined) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined);

// Tempo is home; Base hosts the Save pot. Factory addresses come from the deploy script output.
export const NETWORKS = {
  tempoModerato: {
    chain: tempoModerato,
    factory: env(process.env.NEXT_PUBLIC_FACTORY_TEMPO_MODERATO),
    tokens: [{ symbol: "OUSD", address: "0x20c0000000000000000000006a37da5c996874be", decimals: 6 }],
  },
  tempo: {
    chain: tempo,
    factory: env(process.env.NEXT_PUBLIC_FACTORY_TEMPO),
    tokens: [{ symbol: "OUSD", address: "0x20c0000000000000000000006a37da5c996874be", decimals: 6 }],
  },
  baseSepolia: {
    chain: baseSepolia,
    factory: env(process.env.NEXT_PUBLIC_FACTORY_BASE_SEPOLIA),
    tokens: [{ symbol: "USDC", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 }],
  },
  base: {
    chain: base,
    factory: env(process.env.NEXT_PUBLIC_FACTORY_BASE),
    tokens: [{ symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 }],
  },
} satisfies Record<string, Network>;

export type NetworkKey = keyof typeof NETWORKS;

export const HOME: NetworkKey = (process.env.NEXT_PUBLIC_HOME_NETWORK as NetworkKey) || "tempoModerato";

/** Stash service guardian, added to every new vault by default. Its key lives only in the worker. */
export const STASH_GUARDIAN = env(process.env.NEXT_PUBLIC_STASH_GUARDIAN);

/** Default rules for a new vault (USD amounts use 18 decimals on-chain). */
export const DEFAULT_POLICY = {
  timelock: 24n * 60n * 60n,
  dailyLimit: 100n * 10n ** 18n,
  largeThreshold: 500n * 10n ** 18n,
} as const;
