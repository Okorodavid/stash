"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import type { Address } from "viem";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { SOLANA_RPC } from "@/lib/growth";
import { HOME, NETWORKS, SAVE } from "@/lib/config";
import { CHAINS } from "@/lib/swap";
import { resolvedTheme } from "@/lib/theme";
import { PreviewProvider } from "@/lib/preview";
import Intro from "./Intro";
import AppSkeleton from "./AppSkeleton";
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

const Swap = dynamic(() => import("./Swap"), { ssr: false, loading: () => <AppSkeleton /> });

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
        // Email/Google get an embedded wallet; "wallet" lets people sign in with MetaMask, Rabby,
        // Coinbase Wallet, Phantom… and keep their own key.
        loginMethods: ["email", "google", "wallet"],
        appearance: {
          theme: dark ? "dark" : "light",
          accentColor: dark ? "#2dd4bf" : "#0f766e",
          landingHeader: "Sign in to Stash",
          walletChainType: "ethereum-and-solana",
        },
        externalWallets: { solana: { connectors: toSolanaWalletConnectors() } },
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

/** True if this browser holds a Privy sign-in; without one, nobody can turn out to be signed in. */
function hasSavedSession() {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith("privy:") && k.includes("token"));
  } catch {
    return true; // can't tell: wait for Privy as before
  }
}

function Gate({ guardianOf, swap }: { guardianOf?: Address; swap?: boolean }) {
  const { ready, authenticated, login: privyLogin } = usePrivy();
  const [maybeSignedIn] = useState(hasSavedSession);
  // A tap on "Sign up" before Privy has started is held and opens the login once it's ready.
  const [wantsLogin, setWantsLogin] = useState(false);
  useEffect(() => {
    if (ready && wantsLogin) {
      setWantsLogin(false);
      privyLogin();
    }
  }, [ready, wantsLogin, privyLogin]);
  const login = () => (ready ? privyLogin() : setWantsLogin(true));
  // While sign-in starts up: guardians keep their own screen; returning users see the app taking shape;
  // first-time visitors get the preview straight away instead of waiting on Privy.
  if (!ready && (guardianOf || maybeSignedIn)) return guardianOf ? <Intro loading guardian /> : <AppSkeleton />;
  // Guardian links are for one specific person, so they always sign in first.
  if (guardianOf) return authenticated ? <GuardianView vault={guardianOf} /> : <Intro onStart={login} guardian />;
  const screen = swap ? <Swap /> : <Dashboard />;
  if (authenticated) return screen;
  // Signed-out visitors look around freely; any action asks them to sign up.
  return (
    <PreviewProvider signUp={login}>
      <PreviewBanner onSignUp={login} />
      {screen}
    </PreviewProvider>
  );
}

function PreviewBanner({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">Save and gain interest. A Stolen Key or seedphrase can&apos;t drain you.</p>
        <p className="text-sm text-muted">
          Sign up with email or Google to start saving.
        </p>
      </div>
      <button
        className="shrink-0 rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-fg"
        onClick={onSignUp}
      >
        Sign up
      </button>
    </section>
  );
}
