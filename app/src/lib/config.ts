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

/**
 * One link serves both: testnet (free test money) and mainnet (real money). Testnet is the default so
 * nobody lands on real money by accident. The choice comes from `?network=mainnet|testnet` in the link,
 * else the visitor's last choice, and applies on page load (switching reloads the page).
 */
export type Mode = "testnet" | "mainnet";
export const MODE_KEY = "stash:network";

const MODES: Record<Mode, { home: NetworkKey; save: NetworkKey; demoVault: Address | undefined }> = {
  testnet: { home: "tempoModerato", save: "baseSepolia", demoVault: env(process.env.NEXT_PUBLIC_DEMO_VAULT) },
  mainnet: { home: "tempo", save: "base", demoVault: env(process.env.NEXT_PUBLIC_DEMO_VAULT_MAINNET) },
};

function readMode(): Mode {
  if (typeof window === "undefined") return "testnet"; // server render and the worker
  try {
    const fromLink = new URLSearchParams(window.location.search).get("network");
    if (fromLink === "mainnet" || fromLink === "testnet") {
      localStorage.setItem(MODE_KEY, fromLink);
      return fromLink;
    }
    return localStorage.getItem(MODE_KEY) === "mainnet" ? "mainnet" : "testnet";
  } catch {
    return "testnet";
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

/** Asks the header switch to move to mainnet (it shows the real-money confirmation first). */
export const ASK_MAINNET_EVENT = "stash:ask-mainnet";
export const askForMainnet = () => window.dispatchEvent(new Event(ASK_MAINNET_EVENT));

/**
 * Where the main account lives: Tempo (default; fees in dollars) or Base (fees in ETH). Chosen per
 * browser, or by `?home=tempo|base` in a link (guardian links carry it); applies on page load.
 */
export type HomeChain = "tempo" | "base";
export const HOME_KEY = "stash:home";

function readHome(): HomeChain {
  if (typeof window === "undefined") return "tempo";
  try {
    const fromLink = new URLSearchParams(window.location.search).get("home");
    if (fromLink === "tempo" || fromLink === "base") {
      localStorage.setItem(HOME_KEY, fromLink);
      return fromLink;
    }
    return localStorage.getItem(HOME_KEY) === "base" ? "base" : "tempo";
  } catch {
    return "tempo";
  }
}

export const HOME_CHAIN: HomeChain = readHome();

/** Moves the main account to the other chain (each chain has its own vault) and reloads. */
export function switchHome(next: HomeChain) {
  try {
    localStorage.setItem(HOME_KEY, next);
  } catch {
    // Storage blocked: the link parameter below still carries the choice for this visit.
  }
  const url = new URL(window.location.href);
  url.searchParams.set("home", next);
  window.location.href = url.toString();
}

/** Home network: the main account (Tempo by default, or Base). */
export const HOME: NetworkKey = HOME_CHAIN === "base" ? MODES[MODE].save : MODES[MODE].home;

/** Network hosting the Save pot (Base). Off when its factory isn't configured. */
export const SAVE: NetworkKey = MODES[MODE].save;

/** Main account and Save pot are the same Base vault: "Save" becomes earning on that vault. */
export const HOME_IS_SAVE = HOME === SAVE;

/** Vault the public drain test (and the signed-out preview's drain link) points at, per network. */
export const DEMO_VAULT = HOME_CHAIN === "tempo" ? MODES[MODE].demoVault : undefined;

/** Stash service guardian, added to every new vault by default. Its key lives only in the worker. */
export const STASH_GUARDIAN = env(process.env.NEXT_PUBLIC_STASH_GUARDIAN);

/** Default rules for a new vault (USD amounts use 18 decimals on-chain). */
export const DEFAULT_POLICY = {
  timelock: 24n * 60n * 60n,
  dailyLimit: 100n * 10n ** 18n,
  largeThreshold: 500n * 10n ** 18n,
} as const;
