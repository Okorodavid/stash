// Where each pot's live rate comes from: Morpho's API (Tempo and Base) and Reflect's (Solana).
// No React here, so the /api/rates route can use it on the server.
import { TEMPO_EARN_MAINNET } from "./config";
import { trancheStats } from "./growth";

/** The Save pot's curated Morpho vault on Base mainnet (Gauntlet USDC Prime). */
const SAVE_EARN_MAINNET = "0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61";

const toBps = (apy: unknown) => (typeof apy === "number" && Number.isFinite(apy) ? Math.round(apy * 10_000) : null);

async function morphoRates(): Promise<{ tempo: number | null; save: number | null }> {
  const query = `{
    tempo: vaultV2ByAddress(address: "${TEMPO_EARN_MAINNET}", chainId: 4217) { netApy }
    save: vaultByAddress(address: "${SAVE_EARN_MAINNET}", chainId: 8453) { state { netApy } }
  }`;
  const res = await fetch("https://blue-api.morpho.org/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const { data } = await res.json();
  return { tempo: toBps(data?.tempo?.netApy), save: toBps(data?.save?.state?.netApy) };
}

/** Fetches every pot's mainnet rate straight from Morpho and Reflect (used by /api/rates, and as a fallback). */
export async function fetchRates(): Promise<{ tempo: number | null; save: number | null; growth: number | null }> {
  const [m, growth] = await Promise.all([
    morphoRates().catch(() => ({ tempo: null, save: null })),
    trancheStats().then((s) => s.apyBps, () => null),
  ]);
  return { ...m, growth };
}

