"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { runDrain, snapshot, type Outcome, type SimResult, type SimStep, type VaultSnapshot } from "@/lib/drainSim";
import { net } from "@/lib/chain";
import { btn, card, short, usd } from "./ui";

const LABEL: Record<Outcome, string> = {
  blocked: "Blocked",
  lost: "Went through",
  waiting: "Waiting",
  stopped: "Stopped",
  failed: "Failed",
};
const TONE: Record<Outcome, string> = {
  blocked: "bg-accent/10 text-accent",
  stopped: "bg-accent/10 text-accent",
  waiting: "bg-warn/10 text-warn",
  lost: "bg-danger/10 text-danger",
  failed: "bg-danger/10 text-danger",
};

const STEP_MS = 650;

/** Thief-with-your-login simulation against a live vault. Read-only: nothing is signed or sent. */
export default function DrainSim({ vault }: { vault: Address }) {
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

  if (error && !snap) return <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>;
  if (!snap) return <p className="text-muted">Reading the vault…</p>;

  const d = snap.token.decimals;
  const done = !!result && shown >= result.steps.length;

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold leading-tight">What if someone stole the login?</h1>
        <p className="text-muted">
          A thief has the owner key for vault <span className="font-mono">{short(vault)}</span>, holding{" "}
          <span className="font-medium text-foreground">{usd(snap.balance, d)}</span>. Watch what they can and can&apos;t
          do. Every step runs against the real contract on {net.chain.name}, but nothing is sent and no money moves.
        </p>
      </section>

      {snap.balance === 0n && (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
          This vault is empty, so there&apos;s nothing to steal. Save a few dollars first to see the full attack.
        </p>
      )}
      {snap.frozen && (
        <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm">This vault is already frozen. The thief starts out blocked.</p>
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

      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {result && (
        <>
          <Timeline steps={result.steps.slice(0, shown)} timelock={snap.timelock} />
          {done && <Summary snap={snap} result={result} respond={respond} />}
        </>
      )}

      <p className="text-xs text-muted">
        Simulated with eth_simulateV1 on {net.chain.name} at block {snap.block.toString()}. The thief&apos;s
        wallet ({short("0x000000000000000000000000000000000000dEaD")}) is a placeholder.
      </p>
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
        <p className="text-muted">
          With an ordinary wallet, the same stolen key moves all {usd(snap.balance, d)} in one transaction.
        </p>
      </div>

      <p className="text-sm">
        {respond
          ? "The thief only got what the daily instant limit allows. Everything bigger had to wait in the open, and one guardian stopped it."
          : `Nobody acted during the ${Math.round(snap.timelock / 3600)}-hour wait, so the queued withdrawal went through. That's why every vault starts with the Stash guardian, and why you and your guardians should turn on Telegram alerts. You can cancel too: the thief has a copy of your key, not your account.`}
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
