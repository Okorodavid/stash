"use client";

import { useState } from "react";
import Link from "next/link";
import { KINDS, readDeals, readListings, State, type Deal, type Kind } from "@/lib/escrow";
import { btn, card } from "../ui";
import { ChainTabs, useEscrow, useHref } from "./EscrowShell";
import { useEscrowWallet, useLoad } from "./hooks";
import { dealHref, Empty, ListingCard, useMoney, withDetails } from "./parts";

const OPEN = new Set([State.Funded, State.Delivered, State.Disputed]);

export default function Board() {
  const { net } = useEscrow();
  const { me } = useEscrowWallet();
  const listings = useLoad(async () => withDetails((await readListings(net)).filter((l) => l.active)), net);
  const [kind, setKind] = useState<Kind | "All">("All");
  const shown = (listings.data ?? []).filter((l) => kind === "All" || l.details.kind === kind);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">Buy and sell with the money held in the middle.</h1>
        <Link href="/escrow/new" className={`${btn} text-center sm:w-auto sm:shrink-0`}>
          List something
        </Link>
      </div>

      <ChainTabs />

      {me && <MyDeals />}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
        {(["All", ...KINDS] as const).map((k) => (
          <button
            key={k}
            aria-pressed={k === kind}
            onClick={() => setKind(k)}
            className="min-h-11 rounded-full border border-line px-4 text-sm aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-accent-ink"
          >
            {k}
          </button>
        ))}
      </div>

      {listings.error ? (
        <p className="text-danger">{listings.error}</p>
      ) : listings.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${card} h-72 motion-safe:animate-pulse`} />
          ))}
        </div>
      ) : shown.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((l) => (
            <ListingCard key={String(l.id)} l={l} />
          ))}
        </div>
      ) : (
        <Empty>Nothing listed yet.</Empty>
      )}
    </div>
  );
}

/** Deals the signed-in person is buying or selling, open ones first. */
function MyDeals() {
  const { net } = useEscrow();
  const { me } = useEscrowWallet();
  const money = useMoney();
  const href = useHref();
  const deals = useLoad(async () => {
    const mine = (await readDeals(net)).filter((d) => [d.buyer, d.seller].some((a) => a.toLowerCase() === me!.toLowerCase()));
    return mine.sort((a, b) => Number(OPEN.has(b.state)) - Number(OPEN.has(a.state)));
  }, `${net}:${me}`);
  if (!deals.data?.length) return null;
  return (
    <section className={`${card} space-y-2`}>
      <h2 className="font-semibold">Your deals</h2>
      <ul className="divide-y divide-line">
        {deals.data.slice(0, 8).map((d) => (
          <li key={String(d.id)}>
            <Link href={href(dealHref(d.id))} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:text-accent-ink">
              <span>
                Deal {String(d.id)} · {d.buyer.toLowerCase() === me!.toLowerCase() ? "buying" : "selling"}
              </span>
              <span className="flex items-center gap-3 text-sm">
                <span className="tabular-nums">{money(d.price)}</span>
                <StateChip d={d} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StateChip({ d }: { d: Deal }) {
  const [label, tone] = {
    [State.None]: ["", ""],
    [State.Funded]: ["Money held", "bg-warn/10 text-warn-ink"],
    [State.Delivered]: ["Delivered", "bg-warn/10 text-warn-ink"],
    [State.Disputed]: ["In dispute", "bg-danger/10 text-danger-ink"],
    [State.Released]: ["Seller paid", "bg-accent/10 text-accent-ink"],
    [State.Refunded]: ["Refunded", "bg-panel text-muted"],
  }[d.state];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}
