"use client";

import { useState } from "react";
import Link from "next/link";
import { dealView, FILE_ACCEPT, loadMeta, MAX_FILE_BYTES, readDeal, readListing, State, type Deal } from "@/lib/escrow";
import { stashEscrowAbi } from "@/lib/escrowAbi";
import { useNow } from "@/lib/useNow";
import { btn, btnDanger, btnGhost, card, short, tint, waitText, when } from "../ui";
import { StateChip } from "./Board";
import DisputeNotes from "./DisputeNotes";
import { useEscrow, useHref } from "./EscrowShell";
import { downloadDealFile, routeError, useEscrowWallet, useFunds, useLoad } from "./hooks";
import { FundsNote, listingHref, shopHref, useMoney } from "./parts";

/** One deal, from both sides: where it stands, and the buttons the person looking may press now. */
export default function DealRoom({ id }: { id: bigint }) {
  const { net } = useEscrow();
  const wallet = useEscrowWallet();
  const now = useNow(15_000);
  const money = useMoney();
  const href = useHref();
  const deal = useLoad(async () => {
    const d = await readDeal(net, id);
    if (!d) return null;
    const l = await readListing(net, d.listingId);
    return { d, details: l ? await loadMeta(l.meta) : null };
  }, `${net}:${id}`);

  if (deal.error) return <p className="text-danger">{deal.error}</p>;
  if (deal.loading || !now) return <div className={`${card} h-96 motion-safe:animate-pulse`} aria-busy="true" />;
  if (!deal.data) return <p className="text-muted">This deal doesn&apos;t exist.</p>;
  const { d, details } = deal.data;
  // `now` is 0 for the first instant; deadline-based buttons then appear a tick later.
  const v = dealView(d, wallet.me, now);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
            <Link href={href(listingHref(d.listingId))} className="hover:underline">
              {details?.title ?? `Deal ${d.id}`}
            </Link>
          </h1>
          <StateChip d={d} />
        </div>
        <section className={`${card} space-y-5`}>
          <Steps d={d} reviewEnds={v.reviewEnds} disputeEnds={v.disputeEnds} />
          {(v.isBuyer || v.isSeller) && d.state === State.Disputed && <DisputeNotes deal={d.id} side={v.isBuyer ? "buyer" : "seller"} />}
          {v.isBuyer || v.isSeller ? (
            <Actions d={d} v={v} reload={deal.reload} />
          ) : (
            <p className="text-sm text-muted">Only the buyer and seller can act on this deal.</p>
          )}
        </section>
      </div>
      <dl className={`${card} h-fit space-y-2 text-sm`}>
        <Row k="Price" v={money(d.price)} />
        <Row k="Stash fee (paid by the seller)" v={money(d.fee)} />
        <Row k="Seller" v={<Link className="underline underline-offset-2" href={href(shopHref(d.seller))}>{details?.shop ?? short(d.seller)}</Link>} />
        <Row k="Buyer" v={short(d.buyer)} />
        <Row k={`Buyer silent for ${waitText(d.reviewWindow)} after delivery`} v="Seller is paid" />
        <Row k="If it's wrong" v="Stash decides" />
      </dl>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

/** The deal's record, in order, with the times both sides can point to. */
function Steps({ d, reviewEnds, disputeEnds }: { d: Deal; reviewEnds: number; disputeEnds: number }) {
  const items: { label: string; at?: string; state: "done" | "now" | "later" }[] = [{ label: "Money held by the contract", state: "done" }];
  if (d.deliveredAt) items.push({ label: "File delivered", at: when(d.deliveredAt), state: "done" });
  else if (d.state === State.Funded) items.push({ label: `Seller delivers by ${when(d.deliverBy)}`, state: "now" });
  if (d.state === State.Delivered) items.push({ label: `Buyer checks it until ${when(reviewEnds)}`, state: "now" });
  if (d.state === State.Disputed) items.push({ label: `In dispute: Stash decides (by ${when(disputeEnds)}, or the buyer is refunded)`, state: "now" });
  if (d.state === State.Released) items.push({ label: "Seller paid", state: "done" });
  else if (d.state === State.Refunded) items.push({ label: "Buyer refunded in full", state: "done" });
  else items.push({ label: "Seller paid, or buyer refunded", state: "later" });
  return (
    <ol className="space-y-3">
      {items.map((s) => (
        <li key={s.label} className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-1.5 size-2.5 shrink-0 rounded-full ${s.state === "done" ? "bg-accent" : s.state === "now" ? "bg-warn" : "border border-line-strong"}`}
          />
          <span className={s.state === "later" ? "text-muted" : ""}>
            {s.label}
            {s.at && <span className="block text-sm text-muted">{s.at}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Actions({ d, v, reload }: { d: Deal; v: ReturnType<typeof dealView>; reload: () => void }) {
  const { net, escrow } = useEscrow();
  const wallet = useEscrowWallet();
  const funds = useFunds(wallet.me);
  const money = useMoney();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  /** Actions that can't be undone ask once more. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const busy = step ?? wallet.busy;

  const call = async (label: string, functionName: string, args: readonly unknown[]) => {
    setProblem(null);
    setConfirming(null);
    if (await wallet.send(label, [{ address: escrow, abi: stashEscrowAbi, functionName, args }])) {
      // A delivery or a dispute emails the other side.
      if (functionName === "deliver" || functionName === "dispute") wallet.notify(d.id);
      reload();
    }
  };
  const sure = (key: string, run: () => void) => (confirming === key ? run() : setConfirming(key));

  const deliver = async () => {
    if (!file) return;
    setProblem(null);
    try {
      setStep("Uploading the file");
      const body = new FormData();
      body.set("net", net);
      body.set("deal", String(d.id));
      body.set("file", file);
      const res = await wallet.authFetch("/api/escrow/deliver", { method: "POST", body });
      if (!res.ok) throw new Error(await routeError(res));
      const { hash } = (await res.json()) as { hash: `0x${string}` };
      setStep(null);
      await call("Recording the delivery", "deliver", [d.id, hash]);
    } catch (e) {
      setStep(null);
      setProblem((e as Error).message);
    }
  };

  const download = async () => {
    setProblem(null);
    try {
      setStep("Downloading");
      await downloadDealFile(wallet.authFetch, net, d.id);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setStep(null);
    }
  };

  const buttons: React.ReactNode[] = [];
  if (v.canDownload) {
    buttons.push(
      <button key="dl" className={v.isBuyer && d.state === State.Delivered ? btnGhost + " w-full" : btn} disabled={!!busy} onClick={download}>
        Download the file
      </button>,
    );
  }
  if (v.canDeliver) {
    buttons.push(
      <div key="deliver" className="space-y-2">
        <input
          type="file"
          accept={FILE_ACCEPT}
          aria-label="Final file"
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-line-strong file:bg-transparent file:px-3 file:text-foreground"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setProblem(f && f.size > MAX_FILE_BYTES ? "Keep the file under 4 MB. Zip it if it's bigger." : null);
            setFile(f && f.size <= MAX_FILE_BYTES ? f : null);
          }}
        />
        <button className={btn} disabled={!file || !!busy} onClick={deliver}>
          Deliver the file
        </button>
        <p className="text-sm text-muted">The buyer can download it straight away, and has a few days to check it before you&apos;re paid.</p>
      </div>,
    );
  }
  if (v.canRelease) {
    const early = d.state === State.Funded;
    buttons.push(
      <button key="release" className={early ? btnGhost + " w-full" : btn} disabled={!!busy} onClick={() => sure("release", () => call("Paying the seller", "release", [d.id]))}>
        {confirming === "release"
          ? `Yes, pay the seller ${money(d.price)}`
          : early
            ? "I got it some other way: pay the seller"
            : "It's right: pay the seller"}
      </button>,
    );
  }
  if (v.canDispute) {
    buttons.push(
      <button key="dispute" className={btnDanger} disabled={!!busy} onClick={() => sure("dispute", () => call("Opening a dispute", "dispute", [d.id]))}>
        {confirming === "dispute" ? "Yes, ask Stash to decide" : "Something's wrong: open a dispute"}
      </button>,
    );
  }
  if (v.canClaim) {
    buttons.push(
      <button key="claim" className={btn} disabled={!!busy} onClick={() => call("Paying the seller", "claim", [d.id])}>
        The buyer had their time: pay the seller
      </button>,
    );
  }
  if (v.canBuyerRefund) {
    buttons.push(
      <button key="brefund" className={btn} disabled={!!busy} onClick={() => call("Getting your money back", "refund", [d.id])}>
        Nothing arrived in time: get my money back
      </button>,
    );
  }
  if (v.canExpireDispute) {
    buttons.push(
      <button key="expire" className={btn} disabled={!!busy} onClick={() => call("Refunding the buyer", "expireDispute", [d.id])}>
        No decision in 30 days: refund the buyer
      </button>,
    );
  }
  if (v.canSellerRefund) {
    buttons.push(
      <button key="srefund" className={btnGhost + " w-full"} disabled={!!busy} onClick={() => sure("srefund", () => call("Refunding the buyer", "refund", [d.id]))}>
        {confirming === "srefund" ? `Yes, send ${money(d.price)} back` : "Give the buyer their money back"}
      </button>,
    );
  }

  const waiting =
    d.state === State.Funded && v.isBuyer && !v.canBuyerRefund
      ? "Waiting for the seller to deliver."
      : d.state === State.Delivered && v.isSeller && !v.canClaim
        ? "Waiting for the buyer to check it."
        : d.state === State.Disputed
          ? "Stash is looking at this deal."
          : null;

  return (
    <div className="space-y-3">
      {waiting && <p className="text-muted">{waiting}</p>}
      {d.state === State.Delivered && v.isBuyer && (
        <p className={`rounded-xl p-3 text-sm ${tint.warn}`}>
          Check the file before {when(v.reviewEnds)}. If you say nothing by then, the seller is paid.
        </p>
      )}
      {d.state === State.Released && v.isSeller && <p className="text-sm text-muted">{money(d.price - d.fee)} was paid to your wallet {short(d.seller)}.</p>}
      {funds.data && wallet.me && buttons.length > 0 && <FundsNote gas={funds.data.gas} net={net} me={wallet.me} />}
      {busy && <p className="text-sm" role="status">{busy}…</p>}
      {buttons}
      {(problem || wallet.error) && <p className="text-sm text-danger">{problem ?? wallet.error}</p>}
    </div>
  );
}
