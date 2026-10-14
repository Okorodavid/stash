"use client";

import { useEffect, useState } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import type { Address } from "viem";
import { HOME, NETWORKS } from "@/lib/config";
import { resolvedTheme } from "@/lib/theme";
import { PreviewProvider } from "@/lib/preview";
import Intro from "./Intro";
import AppSkeleton from "./AppSkeleton";
import Dashboard from "./Dashboard";
import GuardianView from "./GuardianView";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const chain = NETWORKS[HOME].chain;

/** `guardianOf` set = guardian screen for that vault; otherwise the user's own vault. */
export default function StashApp({ guardianOf }: { guardianOf?: Address }) {
  if (!appId) {
    return <p className="text-danger">Missing NEXT_PUBLIC_PRIVY_APP_ID in arc/.env.local.</p>;
  }
  return <Providers guardianOf={guardianOf} appId={appId} />;
}

function Providers({ guardianOf, appId }: { guardianOf?: Address; appId: string }) {
  // Privy's login window matches the theme in use when the app loads (this component never renders on the server).
  const [dark] = useState(() => resolvedTheme() === "dark");
  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Email/Google get an embedded wallet; "wallet" lets people sign in with MetaMask, Rabby,
        // Coinbase Wallet… and keep their own key.
        loginMethods: ["email", "google", "wallet"],
        appearance: {
          theme: dark ? "dark" : "light",
          accentColor: dark ? "#2dd4bf" : "#0f766e",
          landingHeader: "Sign in to Stash",
          walletChainType: "ethereum-only",
        },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <Gate guardianOf={guardianOf} />
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

function Gate({ guardianOf }: { guardianOf?: Address }) {
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
  const screen = <Dashboard />;
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
        <p className="font-semibold">Dollar savings on Arc that a stolen key or seed phrase can&apos;t drain.</p>
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
