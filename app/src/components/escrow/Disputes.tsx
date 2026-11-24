"use client";

import { useState } from "react";
import Link from "next/link";
import { DISPUTE_TIMEOUT, loadMeta, readArbiter, readDeals, readListing, State, ZERO_HASH, type Deal, type Meta } from "@/lib/escrow";
import { stashEscrowAbi } from "@/lib/escrowAbi";
import { btn, btnDanger, btnGhost, card, short, when } from "../ui";
import DisputeNotes from "./DisputeNotes";
import { ChainTabs, useEscrow, useHref } from "./EscrowShell";
import { downloadDealFile, useEscrowWallet, useLoad } from "./hooks";
import { dealHref, Empty, useMoney } from "./parts";

/**
 * Stash's dispute desk: every disputed deal on this chain, both sides' notes, the delivered file, and the
 * two rulings. Only the arbiter wallet named in the contract can rule; the page checks before showing it.
 */
export default function Disputes() {
  const { net } = useEscrow();
  const wallet = useEscrowWallet();
  const arbiter = useLoad(() => readArbiter(net), net);
  const isArbiter = !!wallet.me && !!arbiter.data && wallet.me.toLowerCase() === arbiter.data.toLowerCase();
  const deals = useLoad(async () => {
    if (!isArbiter) return [];
    const open = (await readDeals(net)).filter((d) => d.state === State.Disputed).sort((a, b) => a.disputedAt - b.disputedAt);
    return Promise.all(
      open.map(async (d) => {
        const l = await readListing(net, d.listingId);
        return { d, details: l ? await loadMeta(l.meta) : null };
      }),
    );
  }, `${net}:${isArbiter}`);

  if (!wallet.me) {
    return (
      <section className={`${card} space-y-3`}>
        <h1 className="text-xl font-semibold">Disputes</h1>
        <p className="text-muted">Sign in with Stash&apos;s dispute wallet.</p>
        <button className={btn + " sm:w-auto"} onClick={wallet.login}>
          Sign in
        </button>
      </section>
    );
  }
  if (arbiter.loading) return <div className={`${card} h-48 motion-safe:animate-pulse`} aria-busy="true" />;
  if (!isArbiter) {
    return (
      <section className={`${card} space-y-2`}>
        <h1 className="text-xl font-semibold">Disputes</h1>
        <p className="text-muted">Only Stash&apos;s dispute wallet can open this page. You&apos;re signed in as {short(wallet.me)}.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Disputes</h1>
        <ChainTabs />
      </div>
      {deals.error ? (
        <p className="text-danger">{deals.error}</p>
      ) : deals.loading ? (
        <div className={`${card} h-48 motion-safe:animate-pulse`} aria-busy="true" />
      ) : deals.data?.length ? (
        deals.data.map(({ d, details }) => <Case key={String(d.id)} d={d} details={details} reload={deals.reload} />)
      ) : (
        <Empty>No open disputes.</Empty>
      )}
    </div>
  );
}

function Case({ d, details, reload }: { d: Deal; details: Meta | null; reload: () => void }) {
  const { net, escrow } = useEscrow();
  const wallet = useEscrowWallet();
  const money = useMoney();
  const href = useHref();
  const [confirming, setConfirming] = useState<"seller" | "buyer" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const rule = async (sellerWins: boolean) => {
    setConfirming(null);
    const done = await wallet.send(sellerWins ? "Paying the seller" : "Refunding the buyer", [
      { address: escrow, abi: stashEscrowAbi, functionName: "rule", args: [d.id, sellerWins] },
    ]);
    if (done) reload();
  };
  const download = () => downloadDealFile(wallet.authFetch, net, d.id).catch((e: Error) => setProblem(e.message));

  return (
    <section className={`${card} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold break-words">
            <Link href={href(dealHref(d.id))} className="hover:underline">
              {details?.title ?? `Deal ${d.id}`}
            </Link>
          </h2>
          <p className="text-sm text-muted">
            {details?.shop ?? short(d.seller)} · bought by {short(d.buyer)}
          </p>
        </div>
        <p className="text-right">
          <span className="block font-semibold tabular-nums">{money(d.price)}</span>
          <span className="text-sm text-muted">Refunds itself {when(d.disputedAt + DISPUTE_TIMEOUT)}</span>
        </p>
      </div>
      {details?.description && <p className="whitespace-pre-wrap break-words text-sm text-muted">{details.description}</p>}
      <DisputeNotes deal={d.id} side="arbiter" />
      {d.fileHash !== ZERO_HASH && (
        <button className={btnGhost} onClick={download}>
          Download the delivered file
        </button>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <button className={btn} disabled={!!wallet.busy} onClick={() => (confirming === "seller" ? rule(true) : setConfirming("seller"))}>
          {confirming === "seller" ? `Yes, pay the seller ${money(d.price - d.fee)}` : "Seller is right: pay them"}
        </button>
        <button className={btnDanger} disabled={!!wallet.busy} onClick={() => (confirming === "buyer" ? rule(false) : setConfirming("buyer"))}>
          {confirming === "buyer" ? `Yes, refund ${money(d.price)}` : "Buyer is right: refund them"}
        </button>
      </div>
      {wallet.busy && <p className="text-sm" role="status">{wallet.busy}…</p>}
      {(problem || wallet.error) && <p className="text-sm text-danger">{problem ?? wallet.error}</p>}
    </section>
  );
}
