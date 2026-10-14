// What the vault and its earning option depend on, shown to users so they can judge protocol risk themselves.
// Keep entries factual and sourced; update when protocols or their status change.

export type Dependency = { name: string; role: string; url?: string };

// Public source repo (shown as the vault contract link).
const REPO = process.env.NEXT_PUBLIC_REPO_URL || undefined;
export type PotInfo = { dependsOn: Dependency[]; notes: string[] };

export const POT_INFO: Record<"vault" | "earn", PotInfo> = {
  vault: {
    dependsOn: [
      { name: "Stash vault contract", role: "Holds your dollars and enforces limits, waiting period and guardians", url: REPO },
      { name: "USDC (Circle)", role: "The dollar stablecoin, which also pays Arc's network fees", url: "https://www.circle.com/usdc" },
      { name: "Arc", role: "Circle's stablecoin blockchain the vault runs on", url: "https://arc.io" },
    ],
    notes: ["Until you choose to earn, this money isn't lent out, so a DeFi hack elsewhere can't touch it."],
  },
  earn: {
    dependsOn: [
      { name: "Stash vault contract", role: "Same protections as the rest of your vault", url: REPO },
      {
        name: "Galaxy USDC (Morpho vault)",
        role: "Lends your USDC to borrowers who post cirBTC as collateral",
        url: "https://explorer.arc.io/address/0x8E357432CC12ff425c36432F312968aEb16112AF",
      },
      { name: "Morpho", role: "The lending protocol underneath", url: "https://morpho.org" },
      { name: "USDC (Circle)", role: "The dollar stablecoin", url: "https://www.circle.com/usdc" },
    ],
    notes: [
      "Your vault protects against thieves, not against the lending protocol itself failing.",
      "The rate floats with borrowing demand. Taking money out depends on the vault having idle liquidity.",
    ],
  },
};
