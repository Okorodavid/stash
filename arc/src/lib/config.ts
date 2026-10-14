import { defineChain, type Address, type Chain } from "viem";

export type Token = { symbol: string; address: Address; decimals: number };

type Network = {
  chain: Chain;
  factory: Address | undefined;
  tokens: Token[];
};

const env = (v: string | undefined) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined);

/**
 * Arc mainnet (Circle's stablecoin chain). USDC is the gas token: natively it has 18 decimals, and the
 * same balance is also an ERC-20 at 0x3600…0000 with 6 decimals, which is what the vault holds.
 */
export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

export const USDC: Token = { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6 };

export const NETWORKS = {
  arc: {
    chain: arc,
    factory: env(process.env.NEXT_PUBLIC_FACTORY_ARC),
    tokens: [USDC],
  },
} satisfies Record<string, Network>;

export type NetworkKey = keyof typeof NETWORKS;

/** RPC endpoints tried in order: a dedicated one if configured (e.g. QuickNode), then the public one. */
export const RPC_URLS: Record<NetworkKey, string[]> = {
  arc: [process.env.NEXT_PUBLIC_RPC_ARC].filter((u): u is string => !!u),
};

/** The only network. */
export const HOME: NetworkKey = "arc";

/** Vault the public drain test (and the signed-out preview's drain link) points at. */
export const DEMO_VAULT = env(process.env.NEXT_PUBLIC_DEMO_VAULT);

/** Stash service guardian, added to every new vault by default. */
export const STASH_GUARDIAN = env(process.env.NEXT_PUBLIC_STASH_GUARDIAN);

/** Default rules for a new vault (USD amounts use 18 decimals on-chain). */
export const DEFAULT_POLICY = {
  timelock: 24n * 60n * 60n,
  dailyLimit: 100n * 10n ** 18n,
  largeThreshold: 500n * 10n ** 18n,
} as const;

/**
 * A new vault's rules from the owner's choices. Instant sends must stay under the large threshold, so a
 * daily limit at or above it lifts the threshold just past the limit (same rule as editing rules later).
 */
export function policyFor(timelock: bigint, dailyLimit: bigint = DEFAULT_POLICY.dailyLimit) {
  const largeThreshold = dailyLimit >= DEFAULT_POLICY.largeThreshold ? dailyLimit + 10n ** 18n : DEFAULT_POLICY.largeThreshold;
  return { timelock, dailyLimit, largeThreshold };
}
