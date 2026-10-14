"use client";

import { useId, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getAddress, isAddress, type Address } from "viem";
import { net, type OwnerMove } from "@/lib/chain";
import { useGuardian } from "@/lib/useGuardian";
import { useNow } from "@/lib/useNow";
import { NotifyProvider, StatusDock, useNotify } from "@/lib/notify";
import AlertsButton from "./AlertsButton";
import HoldButton from "./HoldButton";
import TimeGlass from "./TimeGlass";
import { SnowflakeIcon } from "./Icons";
import { btn, btnDanger, btnGhost, card, cardTitle, dollars, input, short, textLink, timeLeft, tint, usd, waitText, when } from "./ui";

const money = (v: bigint) => usd(v, 18);

export default function GuardianView({ vault }: { vault: Address }) {
  return (
    <NotifyProvider>
      <Guardian vault={vault} />
    </NotifyProvider>
  );
}

function Guardian({ vault }: { vault: Address }) {
  const { logout } = usePrivy();
  const notify = useNotify();
  const { account, isGuardian, me, state, busy, error, actions } = useGuardian(vault);
  const now = useNow();
  const token = net.tokens[0];

  if (!state) return <p role="status" className="text-muted">Loading the vault you guard…</p>;
  const established = (at: number) => now > 0 && at > 0 && now >= at;
  const iAmEstablished = me ? established(me.establishedAt) : false;
  const newGuardians = state.guardians.filter((g) => !established(g.establishedAt));

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <section className={card}>
        <h1 className="text-sm text-muted">
          You are guarding <span className="font-mono">{short(vault)}</span>
        </h1>
        <p className="mt-1 text-3xl font-semibold tracking-tight">{dollars(state.totalUsd)}</p>
        <p className="mt-1 text-sm">
          {state.frozen ? <span className="font-medium text-danger">Frozen: nothing can leave.</span> : "Active: nothing unusual unless shown below."}
        </p>
        {!isGuardian && (
          <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${tint.warn}`}>
            Your account ({account ? short(account) : "…"}) is not a guardian of this vault, so these buttons won&apos;t work.
            Ask the owner to add this address.
          </p>
        )}
      </section>

      {isGuardian && <AlertsButton label="Alert me on Telegram if something happens" />}

      <section className={card}>
        <h2 className={`${cardTitle} mb-2`}>Waiting withdrawals</h2>
        {state.pending.length === 0 && <p className="text-sm text-muted">Nothing waiting. All quiet.</p>}
        <ul className="space-y-3">
          {state.pending.map((p) => {
            const ready = now > 0 && now >= p.unlockAt;
            const elapsed = now > 0 ? 1 - (p.unlockAt - now) / state.timelock : 0;
            return (
              <li key={p.id.toString()} className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <span className="text-warn">
                    <TimeGlass elapsed={ready ? 1 : elapsed} size={56} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xl font-semibold">{usd(p.amount, token.decimals)} is leaving</p>
                    <p className="text-muted">
                      to <span className="font-mono">{short(p.to)}</span>
                      {p.guardianApproved && " · you marked it reviewed"}
                    </p>
                    <p className="mt-1 font-semibold text-warn-ink">
                      {ready
                        ? "The wait is over: it can be released now"
                        : now > 0
                          ? `Goes through in ${timeLeft(p.unlockAt - now)} · you can stop it until ${when(p.unlockAt, now)}`
                          : "…"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    className={`${btnDanger} sm:flex-1`}
                    disabled={!!busy}
                    onClick={() =>
                      actions
                        .cancelWithdrawal(p.id)
                        .then((h) => h && notify(`Stopped. ${usd(p.amount, token.decimals)} stays in the vault. Let the owner know.`))
                    }
                  >
                    Stop it
                  </button>
                  {!p.guardianApproved && (
                    <button
                      className={`${btnGhost} bg-card`}
                      disabled={!!busy}
                      onClick={() => actions.approveWithdrawal(p.id).then((h) => h && notify("Marked as reviewed. The wait still runs in full."))}
                    >
                      Looks fine
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">
          &quot;Looks fine&quot; only marks it as reviewed; it never speeds the wait up. If you don&apos;t recognise a withdrawal, stop it.
        </p>
      </section>

      {state.pendingPolicy && (
        <section className={`${card} border-warn`}>
          <h2 className={cardTitle}>Someone wants to loosen the limits</h2>
          <p className="mt-1 text-sm">
            Instant limit {money(state.dailyLimitUsd)} to {money(state.pendingPolicy.dailyLimitUsd)} a day; waiting period{" "}
            {waitText(state.timelock)} to {waitText(state.pendingPolicy.timelock)}. Takes effect{" "}
            {when(state.pendingPolicy.effectiveAt, now || undefined)}.
          </p>
          <p className="mt-1 text-xs text-muted">If the owner didn&apos;t tell you about this, block it: a thief may be loosening the rules first.</p>
          <button
            className={`${btnGhost} mt-2 w-full text-danger-ink`}
            disabled={!!busy}
            onClick={() => actions.cancelPolicy().then((h) => h && notify("Blocked. The current limits stay."))}
          >
            Block this change
          </button>
        </section>
      )}

      {isGuardian && state.ownerMove && (
        <OwnerMoveSection
          move={state.ownerMove}
          owner={state.owner}
          me={account}
          iAmEstablished={iAmEstablished}
          frozen={state.frozen}
          now={now}
          busy={!!busy}
          actions={actions}
        />
      )}

      <section className={card}>
        <h2 className={`${cardTitle} mb-2`}>Guardians</h2>
        <ul className="space-y-2 text-sm">
          {state.guardians.map((g) => {
            const isMe = g.address.toLowerCase() === account?.toLowerCase();
            const isNew = !established(g.establishedAt);
            return (
              <li key={g.address} className="flex min-h-11 items-center justify-between gap-2">
                <span>
                  <span className="font-mono">{short(g.address)}</span>
                  {isMe && " (you)"}
                  {isNew && <span className="text-warn-ink"> · new, can help unfreeze from {when(g.establishedAt, now || undefined)}</span>}
                  {g.removalAt > 0 && <span className="text-warn-ink"> · removal requested</span>}
                </span>
                <span className="flex gap-2">
                  {g.removalAt > 0 && (
                    <button className={btnGhost} disabled={!!busy} onClick={() => actions.cancelGuardianRemoval(g.address)}>
                      Keep
                    </button>
                  )}
                  {isNew && !isMe && iAmEstablished && (
                    <button className={`${btnGhost} text-danger-ink`} disabled={!!busy} onClick={() => actions.vetoGuardian(g.address)}>
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
            If you didn&apos;t expect a new guardian, remove it: someone with the owner&apos;s key may be trying to plant one.
          </p>
        )}
      </section>

      {state.frozen ? (
        <section className={card}>
          <h2 className={cardTitle}>Vault is frozen</h2>
          {state.unfreezeApprovedBy ? (
            <p className="mt-1 text-sm text-muted">
              Unfreeze approved by {short(state.unfreezeApprovedBy)}. The owner can now unfreeze from their app.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                Only approve once you&apos;ve talked to the owner and you&apos;re sure their account is safe again.
              </p>
              <button
                className={`${btn} mt-2`}
                disabled={!!busy || !iAmEstablished}
                onClick={() => actions.approveUnfreeze().then((h) => h && notify("Approved. The owner can now unfreeze from their app."))}
              >
                Approve unfreeze
              </button>
              {isGuardian && !iAmEstablished && <p className="mt-1 text-xs text-muted">You were added recently, so you can&apos;t approve unfreezing yet.</p>}
            </>
          )}
        </section>
      ) : (
        <HoldButton
          className="min-h-11 w-full rounded-xl border border-danger/60 px-4 py-3 text-sm font-semibold text-danger disabled:opacity-50"
          disabled={!!busy}
          onHold={() =>
            actions.freeze().then((h) => h && notify("Frozen. Nothing can leave. Call the owner, and only approve unfreezing once their account is safe.", "danger"))
          }
        >
          <SnowflakeIcon width={18} height={18} /> Hold to freeze this vault
        </HoldButton>
      )}

      <footer className="flex items-center justify-between gap-3 pt-2 text-xs text-muted">
        <span>
          Instant limit {money(state.dailyLimitUsd)}/day · {money(state.largeThresholdUsd)} or more always waits {waitText(state.timelock)} · owner{" "}
          <span className="font-mono">{short(state.owner)}</span>
        </span>
        <button className={`${textLink} shrink-0`} onClick={logout}>
          Sign out
        </button>
      </footer>
      <StatusDock busy={busy} error={error} />
    </div>
  );
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Guardian side of moving the vault to a new owner key. A move needs the owner key and an established
 * guardian to name the same key, then waits; only guardians can cancel it.
 */
function OwnerMoveSection({
  move,
  owner,
  me,
  iAmEstablished,
  frozen,
  now,
  busy,
  actions,
}: {
  move: OwnerMove;
  owner: Address;
  me?: Address;
  iAmEstablished: boolean;
  frozen: boolean;
  now: number;
  busy: boolean;
  actions: ReturnType<typeof useGuardian>["actions"];
}) {
  const [to, setTo] = useState("");
  const inputId = useId();
  const mine = move.guardianNominees.find((g) => same(g.guardian, me))?.nominee ?? null;
  const valid = isAddress(to) && !same(to, owner);

  if (move.pendingOwnerAt > 0) {
    const ready = now > 0 && now >= move.pendingOwnerAt;
    return (
      <section className={`${card} border-warn`}>
        <h2 className={cardTitle}>This vault is moving to a new owner</h2>
        <p className="mt-1 text-sm">
          New owner <span className="font-mono">{short(move.pendingOwner!)}</span>.{" "}
          {ready ? "The wait is over." : now > 0 ? `Happens in ${timeLeft(move.pendingOwnerAt - now)}.` : ""}
        </p>
        <p className="mt-1 text-xs text-muted">If the owner didn&apos;t ask for this, stop it. The owner&apos;s key can&apos;t.</p>
        <div className="mt-2 flex gap-2">
          <button className={`${btnGhost} text-danger-ink`} disabled={busy || !iAmEstablished} onClick={() => actions.cancelOwnerChange()}>
            Stop the move
          </button>
          {ready && (
            <button className={btnGhost} disabled={busy} onClick={() => actions.applyOwnerChange()}>
              Complete the move
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={card}>
      <h2 className={cardTitle}>Move to a new owner login</h2>
      {move.ownerNominee && !same(move.ownerNominee, mine) && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-sm ${tint.warn}`}>
          <p>
            The owner asked to move this vault to <span className="font-mono">{short(move.ownerNominee)}</span>.
          </p>
          <p className="mt-1 text-xs">
            Call the owner and check the address with them first. Someone with a stolen key could ask for this too.
          </p>
          <button
            className={`${btnGhost} mt-2 bg-card`}
            disabled={busy || !iAmEstablished}
            onClick={() => actions.nominateOwner(move.ownerNominee!)}
          >
            I&apos;ve checked with the owner: confirm
          </button>
        </div>
      )}
      <p className="mt-2 text-sm text-muted">
        If the owner&apos;s recovery key leaked, help them move the vault to a new login. {frozen ? "" : "Freeze the vault first. "}
        Get their new address from them directly, enter it here, then they confirm it from their old login.
      </p>
      {mine && (
        <p className="mt-2 text-sm">
          You named <span className="font-mono">{short(mine)}</span>. Waiting for the owner to confirm it.
        </p>
      )}
      <label htmlFor={inputId} className="mt-2 block text-sm text-muted">
        Owner&apos;s new address
      </label>
      <input
        id={inputId}
        className={`${input} mt-1 font-mono text-sm`}
        placeholder="0x…"
        spellCheck={false}
        value={to}
        onChange={(e) => setTo(e.target.value.trim())}
      />
      <button
        className={`${btnGhost} mt-2 w-full`}
        disabled={busy || !valid || !iAmEstablished}
        onClick={() => actions.nominateOwner(getAddress(to) as Address).then((h) => h && setTo(""))}
      >
        Name the new owner
      </button>
      {!iAmEstablished && <p className="mt-1 text-xs text-muted">You were added recently, so you can&apos;t do this yet.</p>}
    </section>
  );
}
