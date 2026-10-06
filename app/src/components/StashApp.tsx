"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import type { Address } from "viem";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { SOLANA_RPC } from "@/lib/growth";
import { HOME, NETWORKS, SAVE } from "@/lib/config";
import { CHAINS } from "@/lib/swap";
import { resolvedTheme } from "@/lib/theme";
import Intro from "./Intro";
import Dashboard from "./Dashboard";
import GuardianView from "./GuardianView";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const chain = NETWORKS[HOME].chain;
// The Save pot lives on a second chain, and swaps run on Tempo and Base mainnet; Privy must know
// every chain it switches the embedded wallet to.
const chains = [
  chain,
  ...(NETWORKS[SAVE].factory ? [NETWORKS[SAVE].chain] : []),
  NETWORKS[CHAINS.tempo.evm!].chain,
  NETWORKS[CHAINS.base.evm!].chain,
].filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i);

const Swap = dynamic(() => import("./Swap"), { ssr: false, loading: () => <Intro loading /> });

/** `guardianOf` set = guardian screen for that vault; `swap` = the swap screen; otherwise the user's own vault. */
export default function StashApp({ guardianOf, swap }: { guardianOf?: Address; swap?: boolean }) {
  if (!appId) {
    return <p className="text-danger">Missing NEXT_PUBLIC_PRIVY_APP_ID in app/.env.local.</p>;
  }
  return <Providers guardianOf={guardianOf} swap={swap} appId={appId} />;
}

function Providers({ guardianOf, swap, appId }: { guardianOf?: Address; swap?: boolean; appId: string }) {
  // Privy's login window matches the theme in use when the app loads (this component never renders on the server).
  const [dark] = useState(() => resolvedTheme() === "dark");
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: dark ? "dark" : "light", accentColor: dark ? "#2dd4bf" : "#0f766e", landingHeader: "Sign in to Stash" },
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
      <Gate guardianOf={guardianOf} swap={swap} />
    </PrivyProvider>
  );
}

function Gate({ guardianOf, swap }: { guardianOf?: Address; swap?: boolean }) {
  const { ready, authenticated, login } = usePrivy();
  if (!ready) return <Intro loading guardian={!!guardianOf} />;
  if (!authenticated) return <Intro onStart={login} guardian={!!guardianOf} />;
  if (guardianOf) return <GuardianView vault={guardianOf} />;
  return swap ? <Swap /> : <Dashboard />;
}
