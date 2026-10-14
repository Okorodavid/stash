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

/** Arc testnet: same USDC address and decimals; free test USDC from faucet.circle.com. */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Testnet Explorer", url: "https://explorer.testnet.arc.io" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

export const USDC: Token = { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6 };

export const NETWORKS = {
  arc: {
    chain: arc,
    factory: env(process.env.NEXT_PUBLIC_FACTORY_ARC),
    tokens: [USDC],
  },
  arcTestnet: {
    chain: arcTestnet,
    factory: env(process.env.NEXT_PUBLIC_FACTORY_ARC_TESTNET),
    tokens: [USDC],
  },
} satisfies Record<string, Network>;

export type NetworkKey = keyof typeof NETWORKS;

/** RPC endpoints tried in order: a dedicated one if configured (e.g. QuickNode), then the public one. */
export const RPC_URLS: Record<NetworkKey, string[]> = {
  arc: [process.env.NEXT_PUBLIC_RPC_ARC].filter((u): u is string => !!u),
  arcTestnet: [process.env.NEXT_PUBLIC_RPC_ARC_TESTNET].filter((u): u is string => !!u),
};

/**
 * One link serves both: mainnet (real USDC, the default) and testnet (free test USDC). The choice comes
 * from `?network=mainnet|testnet` in the link, else the visitor's last choice, and applies on page load
 * (switching reloads the page).
 */
export type Mode = "testnet" | "mainnet";
export const MODE_KEY = "stash-arc:network";

function readMode(): Mode {
  if (typeof window === "undefined") return "mainnet"; // server render
  try {
    const fromLink = new URLSearchParams(window.location.search).get("network");
    if (fromLink === "mainnet" || fromLink === "testnet") {
      localStorage.setItem(MODE_KEY, fromLink);
      return fromLink;
    }
    return localStorage.getItem(MODE_KEY) === "testnet" ? "testnet" : "mainnet";
  } catch {
    return "mainnet";
  }
}

export const MODE: Mode = readMode();

/** Switches network and reloads, so every module picks up the new one. */
export function switchMode(next: Mode) {
  try {
    localStorage.setItem(MODE_KEY, next);
  } catch {
    // Storage blocked: the link parameter below still carries the choice for this visit.
  }
  const url = new URL(window.location.href);
  url.searchParams.set("network", next);
  window.location.href = url.toString();
}

/** The network in use. */
export const HOME: NetworkKey = MODE === "testnet" ? "arcTestnet" : "arc";

/** Vault the public drain test (and the signed-out preview's drain link) points at, per network. */
export const DEMO_VAULT = env(MODE === "testnet" ? process.env.NEXT_PUBLIC_DEMO_VAULT_TESTNET : process.env.NEXT_PUBLIC_DEMO_VAULT);

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
