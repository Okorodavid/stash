"use client";

import { useState, type ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import type { Chain } from "viem";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { SOLANA_RPC } from "@/lib/growth";
import { resolvedTheme } from "@/lib/theme";

/** Stash's sign-in, shared by the vault and escrow, so one account works across both. */
export default function PrivyShell({
  appId,
  defaultChain,
  chains,
  children,
}: {
  appId: string;
  defaultChain: Chain;
  /** Every chain the embedded wallet may be switched to. */
  chains: Chain[];
  children: ReactNode;
}) {
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
        defaultChain,
        supportedChains: chains,
      }}
    >
      {children}
    </PrivyProvider>
  );
}
