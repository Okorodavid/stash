"use client";

import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import type { Address } from "viem";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { SOLANA_RPC } from "@/lib/growth";
import { HOME, NETWORKS, SAVE } from "@/lib/config";
import Intro from "./Intro";
import Dashboard from "./Dashboard";
import GuardianView from "./GuardianView";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const chain = NETWORKS[HOME].chain;
// The Save pot lives on a second chain; Privy must know it to switch the embedded wallet there.
const chains = NETWORKS[SAVE].factory ? [chain, NETWORKS[SAVE].chain] : [chain];

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
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          solana: { createOnLogin: "users-without-wallets" }, // Growth pot (Solana mainnet)
        },
        solana: {
          rpcs: {
            "solana:mainnet": {
              rpc: createSolanaRpc(SOLANA_RPC),
              rpcSubscriptions: createSolanaRpcSubscriptions(SOLANA_RPC.replace(/^http/, "ws")),
            },
          },
        },
        defaultChain: chain,
        supportedChains: chains,
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
