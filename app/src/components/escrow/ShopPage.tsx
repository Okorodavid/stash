"use client";

import type { Address } from "viem";
import { readListings } from "@/lib/escrow";
import { short } from "../ui";
import { ChainTabs, useEscrow } from "./EscrowShell";
import { useLoad } from "./hooks";
import { CopyLink, Empty, ListingCard, withDetails } from "./parts";

/** A seller's shop: everything they have for sale, under the name on their newest listing. */
export default function ShopPage({ seller }: { seller: Address }) {
  const { net } = useEscrow();
  const listings = useLoad(
    async () => withDetails((await readListings(net)).filter((l) => l.active && l.seller.toLowerCase() === seller.toLowerCase())),
    `${net}:${seller}`,
  );
  const name = listings.data?.[0]?.details.shop;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{name ?? short(seller)}</h1>
        <CopyLink label="Copy shop link" />
      </div>
      <ChainTabs />
      {listings.error ? (
        <p className="text-danger">{listings.error}</p>
      ) : listings.loading ? (
        <div className="h-72 rounded-2xl bg-card motion-safe:animate-pulse" aria-busy="true" />
      ) : listings.data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.data.map((l) => (
            <ListingCard key={String(l.id)} l={l} />
          ))}
        </div>
      ) : (
        <Empty>Nothing for sale here right now.</Empty>
      )}
    </div>
  );
}
