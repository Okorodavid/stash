"use client";

import { usePrivy } from "@privy-io/react-auth";
import type { Address } from "viem";
import { net } from "@/lib/chain";
import { useGuardian } from "@/lib/useGuardian";
import { useNow } from "@/lib/useNow";
import { btn, btnGhost, card, short, usd } from "./ui";

const money = (v: bigint) => usd(v, 18);

export default function GuardianView({ vault }: { vault: Address }) {
  const { logout } = usePrivy();
  const { account, isGuardian, me, state, busy, error, actions } = useGuardian(vault);
  const now = useNow();
  const token = net.tokens[0];

  if (!state) return <p className="text-muted">Loading vault…</p>;
  const established = (at: number) => now > 0 && at > 0 && now >= at;
  const iAmEstablished = me ? established(me.establishedAt) : false;
  const newGuardians = state.guardians.filter((g) => !established(g.establishedAt));

  return (
    <div className="space-y-4">
      <section className={card}>
        <p className="text-sm text-muted">You are guarding</p>
        <p className="font-mono text-sm">{short(vault)}</p>
        <p className="mt-1 text-3xl font-semibold">
          {state.totalUsd.toLocaleString(undefined, { style: "currency", currency: "USD" })}
        </p>
        <p className="mt-1 text-sm">
          {state.frozen ? <span className="font-medium text-danger">Frozen: nothing can leave.</span> : "Active"}
        </p>
        {!isGuardian && (
          <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
            Your account ({account ? short(account) : "…"}) is not a guardian of this vault, so these buttons won&apos;t work.
            Ask the owner to add this address.
          </p>
        )}
      </section>

      {busy && <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm">{busy}…</p>}
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <section className={card}>
        <p className="mb-2 font-medium">Waiting withdrawals</p>
        {state.pending.length === 0 && <p className="text-sm text-muted">Nothing waiting. All quiet.</p>}
        <ul className="space-y-3">
          {state.pending.map((p) => (
            <li key={p.id.toString()} className="rounded-xl border border-line p-3 text-sm">
              <p className="font-medium">
                {usd(p.amount, token.decimals)} to <span className="font-mono">{short(p.to)}</span>
              </p>
              <p className="text-muted">
                {now >= p.unlockAt ? "Can be released now" : `Leaves ${new Date(p.unlockAt * 1000).toLocaleString()}`}
                {p.guardianApproved && " · ✓ reviewed"}
              </p>
              <div className="mt-2 flex gap-2">
                <button className={`${btnGhost} text-danger`} disabled={!!busy} onClick={() => actions.cancelWithdrawal(p.id)}>
                  Stop it
                </button>
                {!p.guardianApproved && (
                  <button className={btnGhost} disabled={!!busy} onClick={() => actions.approveWithdrawal(p.id)}>
                    Looks fine ✓
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          &quot;Looks fine&quot; only marks it as reviewed; it never speeds the wait up. If you don&apos;t recognise a withdrawal, stop it.
        </p>
      </section>

      {state.pendingPolicy && (
        <section className={`${card} border-warn`}>
          <p className="font-medium">Someone wants to loosen the limits</p>
          <p className="mt-1 text-sm">
            Instant limit {money(state.dailyLimitUsd)} → {money(state.pendingPolicy.dailyLimitUsd)} a day; waiting period{" "}
            {state.timelock / 3600}h → {state.pendingPolicy.timelock / 3600}h. Takes effect{" "}
            {new Date(state.pendingPolicy.effectiveAt * 1000).toLocaleString()}.
          </p>
          <button className={`${btnGhost} mt-2 text-danger`} disabled={!!busy} onClick={() => actions.cancelPolicy()}>
            Block this change
          </button>
        </section>
      )}

      <section className={card}>
        <p className="mb-2 font-medium">Guardians</p>
        <ul className="space-y-2 text-sm">
          {state.guardians.map((g) => {
            const isMe = g.address.toLowerCase() === account?.toLowerCase();
            const isNew = !established(g.establishedAt);
            return (
              <li key={g.address} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-mono">{short(g.address)}</span>
                  {isMe && " (you)"}
                  {isNew && <span className="text-warn"> · new, active for unfreezing {new Date(g.establishedAt * 1000).toLocaleString()}</span>}
                  {g.removalAt > 0 && <span className="text-warn"> · removal requested</span>}
                </span>
                <span className="flex gap-2">
                  {g.removalAt > 0 && (
                    <button className={btnGhost} disabled={!!busy} onClick={() => actions.cancelGuardianRemoval(g.address)}>
                      Keep
                    </button>
                  )}
                  {isNew && !isMe && iAmEstablished && (
                    <button className={`${btnGhost} text-danger`} disabled={!!busy} onClick={() => actions.vetoGuardian(g.address)}>
                      Remove
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {newGuardians.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            If you didn&apos;t expect a new guardian, remove it: someone with the owner&apos;s login may be trying to plant one.
          </p>
        )}
      </section>

      {state.frozen ? (
        <section className={card}>
          <p className="font-medium">Vault is frozen</p>
          {state.unfreezeApprovedBy ? (
            <p className="mt-1 text-sm text-muted">
              Unfreeze approved by {short(state.unfreezeApprovedBy)}. The owner can now unfreeze from their app.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                Only approve once you&apos;ve talked to the owner and you&apos;re sure their account is safe again.
              </p>
              <button className={`${btn} mt-2`} disabled={!!busy || !iAmEstablished} onClick={() => actions.approveUnfreeze()}>
                Approve unfreeze
              </button>
              {isGuardian && !iAmEstablished && <p className="mt-1 text-xs text-muted">You were added recently, so you can&apos;t approve unfreezing yet.</p>}
            </>
          )}
        </section>
      ) : (
        <button className={`${btnGhost} w-full text-danger`} disabled={!!busy} onClick={() => actions.freeze()}>
          Freeze this vault (emergency stop)
        </button>
      )}

      <footer className="flex items-center justify-between pt-2 text-xs text-muted">
        <span>
          Instant limit {money(state.dailyLimitUsd)}/day · {money(state.largeThresholdUsd)}+ always waits {state.timelock / 3600}h · owner{" "}
          <span className="font-mono">{short(state.owner)}</span>
        </span>
        <button className="underline" onClick={logout}>
          Sign out
        </button>
      </footer>
    </div>
  );
}
