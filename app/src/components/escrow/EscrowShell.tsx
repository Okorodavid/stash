"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Address } from "viem";
import { MODE, NETWORKS, switchMode, type Token } from "@/lib/config";
import { CHAIN_NAME, CHAIN_SLUGS, ESCROW, escrowToken, netFor, type ChainSlug, type EscrowNet } from "@/lib/escrow";
import PrivyShell from "../PrivyShell";
import { btnGhost, card } from "../ui";

const MAINNET = MODE === "mainnet";
/** Chains with an escrow on the network picked in the header (testnet or mainnet). */
export const LIVE_SLUGS = CHAIN_SLUGS.filter((s) => ESCROW[netFor(s, MAINNET)]);

type Ctx = { net: EscrowNet; escrow: Address; token: Token; slug: ChainSlug };
const EscrowContext = createContext<Ctx | null>(null);

/** The network, contract and token of the chain this page is on. */
export function useEscrow(): Ctx {
  const ctx = useContext(EscrowContext);
  if (!ctx) throw new Error("useEscrow outside OnChain");
  return ctx;
}

/** Links within escrow keep their chain: `/escrow/l/3?chain=bnb`. */
export function useHref() {
  const { slug } = useEscrow();
  return (path: string) => (slug === "base" ? path : `${path}?chain=${slug}`);
}

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/** Sign-in for every escrow page (it lives in the escrow layout), knowing every escrow chain in use. */
export default function EscrowShell({ children }: { children: ReactNode }) {
  if (!appId) return <p className="text-danger">Missing NEXT_PUBLIC_PRIVY_APP_ID in app/.env.local.</p>;
  if (!LIVE_SLUGS.length) {
    const other = CHAIN_SLUGS.some((s) => ESCROW[netFor(s, !MAINNET)]);
    return (
      <section className={`${card} space-y-3`}>
        <p className="font-semibold">Escrow isn&apos;t on {MAINNET ? "mainnet" : "testnet"} yet.</p>
        {other && (
          <button className={btnGhost} onClick={() => switchMode(MAINNET ? "testnet" : "mainnet")}>
            Use the {MAINNET ? "testnet" : "mainnet"} escrow
          </button>
        )}
      </section>
    );
  }
  const chains = LIVE_SLUGS.map((s) => NETWORKS[netFor(s, MAINNET)].chain);
  return (
    <PrivyShell appId={appId} defaultChain={chains[0]} chains={chains}>
      {children}
    </PrivyShell>
  );
}

/** Puts a page on one chain. Pages read `?chain=` on the server and pass it here. */
export function OnChain({ slug, children }: { slug: ChainSlug; children: ReactNode }) {
  const net = netFor(slug, MAINNET);
  const escrow = ESCROW[net];
  if (!escrow) {
    return (
      <section className={`${card} space-y-3`}>
        <p className="font-semibold">
          Escrow isn&apos;t on {CHAIN_NAME[slug]} {MAINNET ? "mainnet" : "testnet"} yet.
        </p>
        <Link className={btnGhost + " inline-flex items-center"} href="/escrow">
          See what&apos;s for sale
        </Link>
      </section>
    );
  }
  return <EscrowContext.Provider value={{ net, escrow, token: escrowToken(net), slug }}>{children}</EscrowContext.Provider>;
}

/** Base / BNB Chain switch for pages that list things (board, shop). Hidden when only one chain is live. */
export function ChainTabs() {
  const { slug } = useEscrow();
  const path = usePathname();
  if (LIVE_SLUGS.length < 2) return null;
  return (
    <nav className="flex gap-2" aria-label="Chain">
      {LIVE_SLUGS.map((s) => (
        <Link
          key={s}
          href={s === "base" ? path : `${path}?chain=${s}`}
          aria-current={s === slug ? "page" : undefined}
          className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm aria-[current=page]:border-accent aria-[current=page]:bg-accent/10 aria-[current=page]:text-accent-ink"
        >
          {CHAIN_NAME[s]} · {escrowToken(netFor(s, MAINNET)).symbol}
        </Link>
      ))}
    </nav>
  );
}
