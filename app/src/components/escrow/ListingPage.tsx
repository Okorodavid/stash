"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { erc20Abi } from "viem";
import { readListing } from "@/lib/escrow";
import { stashEscrowAbi } from "@/lib/escrowAbi";
import { btn, btnGhost, card, waitText } from "../ui";
import { useEscrow, useHref } from "./EscrowShell";
import { idFrom, useEscrowWallet, useFunds, useLoad } from "./hooks";
import { CopyLink, dealHref, FundsNote, Preview, shopHref, useMoney, withDetails } from "./parts";

export default function ListingPage({ id }: { id: bigint }) {
  const { net, escrow, token } = useEscrow();
  const router = useRouter();
  const wallet = useEscrowWallet();
  const money = useMoney();
  const href = useHref();
  const listing = useLoad(async () => {
    const l = await readListing(net, id);
    return l ? ((await withDetails([l]))[0] ?? null) : null;
  }, `${net}:${id}`);
  const funds = useFunds(wallet.me);

  if (listing.error) return <p className="text-danger">{listing.error}</p>;
  if (listing.loading) return <div className={`${card} h-96 motion-safe:animate-pulse`} aria-busy="true" />;
  const l = listing.data;
  if (!l) return <p className="text-muted">This listing doesn&apos;t exist.</p>;

  const mine = !!wallet.me && wallet.me.toLowerCase() === l.seller.toLowerCase();
  const f = funds.data;
  const short = f && f.balance < l.price ? `You need ${money(l.price)} in ${token.symbol} on this network; you have ${money(f.balance)}.` : undefined;

  const buy = async () => {
    if (!wallet.me) return wallet.login();
    const calls = [];
    if (!f || f.allowance < l.price) {
      calls.push({ address: token.address, abi: erc20Abi, functionName: "approve", args: [escrow, l.price] });
    }
    calls.push({ address: escrow, abi: stashEscrowAbi, functionName: "buy", args: [l.id] });
    const dealId = idFrom(await wallet.send("Paying into escrow", calls), "Funded");
    if (dealId !== undefined) {
      wallet.notify(dealId);
      router.push(href(dealHref(dealId)));
    }
  };

  const delist = async () => {
    if (await wallet.send("Taking the listing down", [{ address: escrow, abi: stashEscrowAbi, functionName: "delist", args: [l.id] }])) {
      listing.reload();
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Preview details={l.details} />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{l.details.title}</h1>
          <p className="text-sm text-muted">
            <Link href={href(shopHref(l.seller))} className="underline underline-offset-2 hover:text-foreground">
              {l.details.shop}
            </Link>{" "}
            · {l.details.kind}
          </p>
        </div>
        {l.details.description && <p className="whitespace-pre-wrap break-words">{l.details.description}</p>}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className={`${card} space-y-4`}>
          <p className="text-3xl font-semibold tabular-nums">{money(l.price)}</p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Delivered within</dt>
              <dd>{waitText(l.deliverWindow)}, or your money back</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Time to check it</dt>
              <dd>{waitText(l.reviewWindow)}, then the seller is paid</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">If it&apos;s wrong</dt>
              <dd>Stash decides</dd>
            </div>
          </dl>
          {!l.active ? (
            <p className="text-muted">No longer for sale.</p>
          ) : mine ? (
            <button className={btnGhost + " w-full"} disabled={!!wallet.busy} onClick={delist}>
              {wallet.busy ?? "Take it down"}
            </button>
          ) : (
            <>
              {f && wallet.me && <FundsNote gas={f.gas} short={short} net={net} me={wallet.me} />}
              <button className={btn} disabled={!!wallet.busy || (!!f && (!!short || f.gas === 0n))} onClick={buy}>
                {wallet.busy ?? (wallet.me ? `Pay ${money(l.price)} into escrow` : "Sign in to buy")}
              </button>
              <p className="text-sm text-muted">Pay only with this button. Stash can&apos;t protect money sent to an address in the description.</p>
            </>
          )}
          {wallet.error && <p className="text-sm text-danger">{wallet.error}</p>}
        </section>
        <CopyLink label="Copy listing link" />
      </aside>
    </div>
  );
}
