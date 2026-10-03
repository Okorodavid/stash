"use client";

import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import type { Address } from "viem";
import { HOME, NETWORKS } from "@/lib/config";
import Intro from "./Intro";
import Dashboard from "./Dashboard";
import GuardianView from "./GuardianView";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const chain = NETWORKS[HOME].chain;

/** `guardianOf` set = guardian screen for that vault; otherwise the user's own vault. */
export default function StashApp({ guardianOf }: { guardianOf?: Address }) {
  if (!appId) {
    return <p className="text-danger">Missing NEXT_PUBLIC_PRIVY_APP_ID in app/.env.local.</p>;
  }
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "light", accentColor: "#0f766e", landingHeader: "Sign in to Stash" },
        // Solana wallet creation is added with the Growth pot (needs Privy's Solana connectors + peer deps).
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <Gate guardianOf={guardianOf} />
    </PrivyProvider>
  );
}

function Gate({ guardianOf }: { guardianOf?: Address }) {
  const { ready, authenticated, login } = usePrivy();
  if (!ready) return <Intro loading guardian={!!guardianOf} />;
  if (!authenticated) return <Intro onStart={login} guardian={!!guardianOf} />;
  return guardianOf ? <GuardianView vault={guardianOf} /> : <Dashboard />;
}
