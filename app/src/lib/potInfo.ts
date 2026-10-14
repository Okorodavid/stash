// What each pot depends on, shown to users so they can judge protocol risk themselves.
// Keep entries factual and sourced; update when protocols or their status change.

import { HOME_CHAIN } from "./config";

export type Dependency = { name: string; role: string; url?: string };

// Public source repo, once published (shown as the vault contract link).
const REPO = process.env.NEXT_PUBLIC_REPO_URL || undefined;
export type PotInfo = { dependsOn: Dependency[]; notes: string[] };

export const POT_INFO: Record<"vault" | "save" | "growth", PotInfo> = {
  vault: {
    dependsOn: [
      { name: "Stash vault contract", role: "Holds your dollars and enforces limits, waiting period and guardians", url: REPO },
      ...(HOME_CHAIN === "base"
        ? [
            { name: "USDC (Circle)", role: "The dollar stablecoin itself", url: "https://www.circle.com/usdc" },
            { name: "Base", role: "The blockchain the vault runs on", url: "https://base.org" },
          ]
        : [
            { name: "pathUSD", role: "Tempo's dollar stablecoin, the default for saving (it also pays network fees)", url: "https://tempo.xyz" },
            { name: "Open USD (OUSD)", role: "Also accepted: a dollar stablecoin issued by Open Standard on Tempo", url: "https://joinopenstandard.com" },
            { name: "Tempo", role: "The blockchain the vault runs on", url: "https://tempo.xyz" },
            {
              name: "Morpho (Sentora pathUSD vault)",
              role: "Lends the pathUSD you choose to put to work, to earn interest",
              url: "https://app.morpho.org/tempo/vault/0x9a044AE05E5e6290DcF56afd69548565e957a626",
            },
          ]),
    ],
    notes:
      HOME_CHAIN === "base"
        ? ["No yield protocol: this money isn't lent out, so a DeFi hack elsewhere can't touch it."]
        : [
            "Only the money you choose to put to work is lent out through Morpho. The rest isn't lent out at all.",
            "Your vault protects against thieves, not against the lending protocol itself failing.",
            "Earning on Tempo runs on mainnet only: Tempo's testnet has no Morpho vaults.",
          ],
  },
  save: {
    dependsOn: [
      { name: "Stash vault contract", role: "Same protections as your main vault", url: REPO },
      { name: "Morpho (curated USDC vault)", role: "Lends your USDC to borrowers to earn interest", url: "https://morpho.org" },
      { name: "USDC (Circle)", role: "The dollar stablecoin", url: "https://www.circle.com/usdc" },
      { name: "Base", role: "The blockchain this pot runs on", url: "https://base.org" },
    ],
    notes: [
      "Your vault protects against thieves, not against the lending protocol itself failing.",
      "Per public reports, the Stream xUSD collapse in Nov 2025 left bad debt in some Morpho vaults; we only use curated vaults with blue-chip collateral.",
      "On testnet this pot uses a stand-in vault that earns nothing.",
    ],
  },
  growth: {
    dependsOn: [
      { name: "Reflect (Protected tranche)", role: "Puts you on the senior side: junior holders absorb the first losses", url: "https://reflect.money" },
      { name: "Hylo (sHYUSD)", role: "The yield-bearing dollar the tranche is built on", url: "https://hylo.so" },
      { name: "Jupiter", role: "Swaps your USDC into sHYUSD and back", url: "https://jup.ag" },
      { name: "Solana", role: "The blockchain this pot runs on", url: "https://solana.com" },
    ],
    notes: [
      "Higher yield means more risk. The protection only covers losses up to the size of the junior side.",
      "Per public reports, Reflect's separate USDC+ product lost ~$1.95M in the Apr 2026 Drift exploit and was frozen. This pot uses the sHYUSD tranche, not USDC+.",
      "This pot isn't inside your Stash vault yet: no daily limit or guardians apply.",
    ],
  },
};
