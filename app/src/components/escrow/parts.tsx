"use client";

import { useState } from "react";
import Link from "next/link";
import { formatUnits, type Address } from "viem";
import { isTestNet, loadMeta, mediaUrl, type EscrowNet, type Listing, type Meta } from "@/lib/escrow";
import { NETWORKS } from "@/lib/config";
import { btnGhost, card, dollars, tint } from "../ui";
import { useEscrow, useHref } from "./EscrowShell";

export type Shown = Listing & { details: Meta };

/** Listings with their details, dropping any whose details are missing or don't match their hash. */
export async function withDetails(listings: Listing[]): Promise<Shown[]> {
  const metas = await Promise.all(listings.map((l) => loadMeta(l.meta)));
  return listings.flatMap((l, i) => (metas[i] ? [{ ...l, details: metas[i] }] : []));
}

/** Token amount as dollars (the escrow only takes dollar stablecoins). */
export function useMoney() {
  const { token } = useEscrow();
  return (v: bigint) => dollars(Number(formatUnits(v, token.decimals)));
}

export const listingHref = (id: bigint) => `/escrow/l/${id}`;
export const shopHref = (seller: Address) => `/escrow/shop/${seller}`;
export const dealHref = (id: bigint) => `/escrow/deal/${id}`;

/** The seller's preview image, or a quiet placeholder with the first letter of the title. */
export function Preview({ details, className = "" }: { details: Meta; className?: string }) {
  if (details.preview) {
    // eslint-disable-next-line @next/next/no-img-element -- our own content-addressed file, already sized by the seller
    return <img src={mediaUrl(details.preview)} alt="" className={`aspect-[4/3] w-full rounded-xl bg-panel object-cover ${className}`} />;
  }
  return (
    <div className={`grid aspect-[4/3] w-full place-items-center rounded-xl bg-panel text-4xl font-semibold text-muted ${className}`} aria-hidden="true">
      {details.title.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function ListingCard({ l }: { l: Shown }) {
  const money = useMoney();
  const href = useHref();
  return (
    <Link href={href(listingHref(l.id))} className={`${card} block space-y-3 transition-colors hover:border-line-strong`}>
      <Preview details={l.details} />
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 font-semibold break-words">{l.details.title}</h2>
        <span className="shrink-0 font-semibold tabular-nums">{money(l.price)}</span>
      </div>
      <p className="flex justify-between gap-3 text-sm text-muted">
        <span className="min-w-0 truncate">{l.details.shop}</span>
        <span className="shrink-0">{l.details.kind}</span>
      </p>
    </Link>
  );
}

/** Copies a link to this page, keeping the network so test listings open on testnet. */
export function CopyLink({ label = "Copy link" }: { label?: string }) {
  const { net, slug } = useEscrow();
  const [done, setDone] = useState(false);
  const copy = async () => {
    const url = new URL(window.location.href);
    url.search = "";
    if (slug !== "base") url.searchParams.set("chain", slug);
    url.searchParams.set("network", isTestNet(net) ? "testnet" : "mainnet");
    try {
      await navigator.clipboard.writeText(url.toString());
    } catch {
      // Clipboard blocked: the address bar still has the link.
    }
    setDone(true);
  };
  return (
    <button className={btnGhost} onClick={copy}>
      {done ? "Link copied" : label}
    </button>
  );
}

/** Warns when the wallet can't pay network fees or the price yet, and shows where to send money. */
export function FundsNote({ gas, short, net, me }: { gas: bigint; short?: string; net: EscrowNet; me: Address }) {
  const { name: chain, nativeCurrency } = NETWORKS[net].chain;
  const [copied, setCopied] = useState(false);
  if (gas > 0n && !short) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(me);
      setCopied(true);
    } catch {
      // Clipboard blocked: the address is on screen to copy by hand.
    }
  };
  return (
    <div className={`space-y-2 rounded-xl p-3 text-sm ${tint.warn}`}>
      <p>
        {short ?? ""}
        {short && gas === 0n ? " " : ""}
        {gas === 0n && `Your wallet needs a little ${nativeCurrency.symbol} on ${chain} for network fees.`}
      </p>
      <p className="flex flex-wrap items-center gap-2">
        <span>Your wallet on {chain}:</span>
        <code className="break-all">{me}</code>
        <button type="button" className="min-h-11 underline underline-offset-2" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </p>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">{children}</p>;
}
