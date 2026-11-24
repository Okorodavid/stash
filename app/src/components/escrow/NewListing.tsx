"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseUnits } from "viem";
import { checkMeta, feeFor, hasLink, KINDS, LIMITS, loadMeta, MAX_PREVIEW_BYTES, readListings, readTerms, type Kind } from "@/lib/escrow";
import { stashEscrowAbi } from "@/lib/escrowAbi";
import { btn, card, cleanAmount, input, waitText } from "../ui";
import { LIVE_SLUGS, useEscrow, useHref } from "./EscrowShell";
import { idFrom, routeError, useEscrowWallet, useFunds, useLoad } from "./hooks";
import { FundsNote, listingHref, useMoney } from "./parts";

const label = "block space-y-1.5 text-sm font-medium";

export default function NewListing() {
  const { net, escrow, token } = useEscrow();
  const router = useRouter();
  const wallet = useEscrowWallet();
  const money = useMoney();
  const href = useHref();
  const { slug } = useEscrow();
  const terms = useLoad(() => readTerms(net), net);
  const funds = useFunds(wallet.me);

  const [shop, setShop] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("Design");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  // Returning sellers keep the shop name from their newest listing.
  useEffect(() => {
    if (!wallet.me) return;
    let live = true;
    readListings(net)
      .then((all) => all.find((l) => l.seller.toLowerCase() === wallet.me!.toLowerCase()))
      .then((l) => (l ? loadMeta(l.meta) : null))
      .then((m) => live && m && setShop((s) => s || m.shop))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [net, wallet.me]);

  const t = terms.data;
  let amount: bigint | null = null;
  try {
    amount = price ? parseUnits(price, token.decimals) : null;
  } catch {
    amount = null;
  }
  const fee = t && amount ? feeFor(amount, t.feeBps, t.minFee) : null;
  const priceProblem =
    !t || amount === null
      ? null
      : fee !== null && fee >= amount
        ? `The price must be more than the ${money(t.minFee)} minimum fee.`
        : amount > t.maxPrice
          ? `Escrow is capped at ${money(t.maxPrice)} per sale during the beta.`
          : null;
  const linkIn = [shop, title, description].some(hasLink);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.me) return wallet.login();
    if (!t || amount === null || fee === null || priceProblem) return;
    setProblem(null);
    wallet.setError(null);
    try {
      let preview: string | undefined;
      if (image) {
        setStep("Uploading the preview");
        const body = new FormData();
        body.set("image", image);
        const res = await wallet.authFetch("/api/escrow/media", { method: "POST", body });
        if (!res.ok) throw new Error(await routeError(res));
        preview = ((await res.json()) as { name: string }).name;
      }
      const checked = checkMeta({ shop, title, description, kind, preview });
      if ("error" in checked) throw new Error(checked.error);
      setStep("Saving the listing");
      const body = new FormData();
      body.set("meta", JSON.stringify(checked.meta));
      const res = await wallet.authFetch("/api/escrow/media", { method: "POST", body });
      if (!res.ok) throw new Error(await routeError(res));
      const { hash } = (await res.json()) as { hash: `0x${string}` };
      setStep(null);
      // maxFee = the fee shown above, so a fee change landing first can't take more than that.
      const events = await wallet.send("Listing it", [
        { address: escrow, abi: stashEscrowAbi, functionName: "list", args: [token.address, amount, fee, hash] },
      ]);
      const id = idFrom(events, "Listed");
      if (id !== undefined) router.push(href(listingHref(id)));
    } catch (err) {
      setStep(null);
      setProblem((err as Error).message);
    }
  };

  const busy = step ?? wallet.busy;
  const unavailable = t && (t.paused || !t.allowed);

  return (
    <form onSubmit={submit} className={`${card} mx-auto max-w-xl space-y-5`}>
      <h1 className="text-2xl font-semibold tracking-tight">List something</h1>
      <label className={label}>
        <span>Your shop name</span>
        <input className={input} value={shop} onChange={(e) => setShop(e.target.value)} maxLength={LIMITS.shop} required autoComplete="organization" />
      </label>
      <label className={label}>
        <span>What you&apos;re selling</span>
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.title} required />
      </label>
      <label className={label}>
        <span>Kind</span>
        <select className={input} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label className={label}>
        <span>Details</span>
        <textarea className={`${input} min-h-32`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.description} />
      </label>
      {linkIn && <p className="text-sm text-danger">Links aren&apos;t allowed. Wallet and contract addresses are fine.</p>}
      <label className={label}>
        <span>Price in dollars</span>
        <input className={input} value={price} onChange={(e) => setPrice(cleanAmount(e.target.value))} inputMode="decimal" required />
      </label>
      {priceProblem ? (
        <p className="text-sm text-danger">{priceProblem}</p>
      ) : (
        fee !== null &&
        amount !== null && (
          <p className="text-sm text-muted">
            You get {money(amount - fee)} after Stash&apos;s {money(fee)} fee, paid in {token.symbol}.
          </p>
        )
      )}
      {LIVE_SLUGS.length > 1 && (
        <label className={label}>
          <span>Get paid in</span>
          <select
            className={input}
            value={slug}
            onChange={(e) => router.replace(e.target.value === "base" ? "/escrow/new" : `/escrow/new?chain=${e.target.value}`)}
          >
            {LIVE_SLUGS.map((s) => (
              <option key={s} value={s}>
                {s === "bnb" ? "USDT on BNB Chain" : "USDC on Base"}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={label}>
        <span>Preview the buyer sees before paying</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-line-strong file:bg-transparent file:px-3 file:text-foreground"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setProblem(f && f.size > MAX_PREVIEW_BYTES ? "Keep the preview under 2 MB." : null);
            setImage(f && f.size <= MAX_PREVIEW_BYTES ? f : null);
          }}
        />
      </label>
      {t && (
        <p className="text-sm text-muted">
          You deliver within {waitText(t.deliverWindow)}. The buyer has {waitText(t.reviewWindow)} to check it, then you&apos;re paid.
        </p>
      )}
      {funds.data && wallet.me && <FundsNote gas={funds.data.gas} net={net} me={wallet.me} />}
      {unavailable && <p className="text-sm text-danger">New listings are paused right now.</p>}
      {(problem || wallet.error) && <p className="text-sm text-danger">{problem ?? wallet.error}</p>}
      <button className={btn} disabled={!!busy || !!priceProblem || linkIn || !!unavailable || !t}>
        {busy ?? (wallet.me ? "List it and get my link" : "Sign in to list")}
      </button>
    </form>
  );
}
