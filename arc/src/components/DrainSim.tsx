"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { runDrain, snapshot, type Outcome, type SimResult, type SimStep, type VaultSnapshot } from "@/lib/drainSim";
import { net } from "@/lib/chain";
import { DEMO_VAULT } from "@/lib/config";
import { btn, card, short, usd } from "./ui";

const LABEL: Record<Outcome, string> = {
  blocked: "Blocked",
  lost: "Went through",
  waiting: "Waiting",
  stopped: "Stopped",
  failed: "Failed",
};
const TONE: Record<Outcome, string> = {
  blocked: "bg-accent/10 text-accent-ink",
  stopped: "bg-accent/10 text-accent-ink",
  waiting: "bg-warn/10 text-warn-ink",
  lost: "bg-danger/10 text-danger-ink",
  failed: "bg-danger/10 text-danger-ink",
};

const STEP_MS = 400;

/**
 * Picks the vault in the browser: the one in the link, else the demo vault.
 */
export default function DrainSim({ vault }: { vault?: Address }) {
  const [target, setTarget] = useState<Address | null | undefined>(undefined);
  useEffect(() => {
    const t = setTimeout(() => setTarget(vault ?? DEMO_VAULT ?? null), 0);
    return () => clearTimeout(t);
  }, [vault]);
  if (target === undefined) return <p className="text-muted">Reading the vault…</p>;
  if (target === null) {
    return (
      <p className="text-muted">
        No demo vault on {net.chain.name}. Open this from your dashboard.
      </p>
    );
  }
  return <DrainSimFor vault={target} />;
}

/** Thief-with-your-login simulation against a live vault. Read-only: nothing is signed or sent. */
function DrainSimFor({ vault }: { vault: Address }) {
  const [snap, setSnap] = useState<VaultSnapshot | null>(null);
  const [respond, setRespond] = useState(true);
  const [result, setResult] = useState<SimResult | null>(null);
  const [shown, setShown] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    snapshot(vault)
      .then(setSnap)
      .catch((e) => setError(e.shortMessage ?? e.message));
  }, [vault]);

  // Reveal steps one at a time so the attack reads as a sequence (instantly with reduced motion).
  useEffect(() => {
    if (!result || shown >= result.steps.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setShown(reduce ? result.steps.length : shown + 1), reduce ? 0 : STEP_MS);
    return () => clearTimeout(t);
  }, [result, shown]);

  const run = async (guardiansRespond: boolean) => {
    if (!snap) return;
    setRespond(guardiansRespond);
    setRunning(true);
    setError(null);
    setResult(null);
    setShown(0);
    try {
      // Re-read so the run reflects the vault right now.
      const fresh = await snapshot(vault);
      setSnap(fresh);
      setResult(await runDrain(fresh, guardiansRespond));
    } catch (e) {
      const err = e as { shortMessage?: string; message: string };
      setError(err.shortMessage ?? err.message);
    } finally {
      setRunning(false);
    }
  };

  if (error && !snap) return <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger-ink">{error}</p>;
  if (!snap) return <p className="text-muted">Reading the vault…</p>;

  const d = snap.token.decimals;
  const done = !!result && shown >= result.steps.length;

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold leading-tight">What if someone stole the key?</h1>
        <p className="text-muted">
          <span className="font-mono">{short(vault)}</span> ·{" "}
          <span className="font-medium text-foreground">{usd(snap.balance, d)}</span> · simulated on {net.chain.name}, no
          money moves
        </p>
      </section>

      {snap.balance === 0n && (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn-ink">Empty vault: nothing to steal.</p>
      )}
      {snap.frozen && (
        <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm">Already frozen: the thief starts blocked.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button className={btn} disabled={running} onClick={() => run(true)}>
          {running && respond ? "Running…" : "Run the attack"}
        </button>
        <button
          className="w-full rounded-xl border border-line px-4 py-3 font-semibold disabled:opacity-50"
          disabled={running}
          onClick={() => run(false)}
        >
          {running && !respond ? "Running…" : "…if nobody responds"}
        </button>
      </div>

      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger-ink">{error}</p>}

      {result && (
        <>
          <Timeline steps={result.steps.slice(0, shown)} timelock={snap.timelock} />
          {done && <Summary snap={snap} result={result} respond={respond} />}
        </>
      )}
    </div>
  );
}

function Timeline({ steps, timelock }: { steps: SimStep[]; timelock: number }) {
  const firstLater = steps.findIndex((s) => s.later);
  const firstGuardian = steps.findIndex((s) => s.actor === "guardian");
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="motion-safe:animate-[step-in_250ms_ease-out]">
          {i === firstGuardian && <Divider text="A guardian gets the Telegram alert" />}
          {i === firstLater && <Divider text={`${Math.round(timelock / 3600)} hours later`} />}
          <div className={`${card} flex items-start gap-3 p-3`}>
            <span
              aria-hidden
              className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm ${
                s.actor === "thief" ? "bg-danger/10" : "bg-accent/10"
              }`}
            >
              {s.actor === "thief" ? "🦹" : "🛡️"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {s.actor === "thief" ? "Thief" : "Guardian"}
              </p>
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-muted">{s.detail}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[s.outcome]}`}>
              {LABEL[s.outcome]}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Divider({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 py-2 text-xs font-medium text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
      {text}
    </p>
  );
}

function Summary({ snap, result, respond }: { snap: VaultSnapshot; result: SimResult; respond: boolean }) {
  const d = snap.token.decimals;
  const pctLost = snap.balance > 0n ? Number((result.lost * 10_000n) / snap.balance) / 100 : 0;
  return (
    <section className={`${card} motion-safe:animate-[step-in_250ms_ease-out] space-y-4`}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-sm text-muted">Thief got</p>
          <p className="text-2xl font-semibold text-danger">{usd(result.lost, d)}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Still safe</p>
          <p className="text-2xl font-semibold text-accent">{usd(result.kept, d)}</p>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <Bar label="Stash vault" lostPct={pctLost} />
        <Bar label="Ordinary wallet" lostPct={snap.balance > 0n ? 100 : 0} />
      </div>

      <p className="text-sm">
        {respond
          ? "Only the daily limit got out. A guardian stopped the rest."
          : `Nobody acted in the ${Math.round(snap.timelock / 3600)}-hour wait. Turn on Telegram alerts for you and your guardians.`}
      </p>
    </section>
  );
}

function Bar({ label, lostPct }: { label: string; lostPct: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span>{lostPct.toFixed(lostPct % 1 ? 1 : 0)}% stolen</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-accent/20">
        <div className="h-full rounded-full bg-danger" style={{ width: `${lostPct}%` }} />
      </div>
    </div>
  );
}
