"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getAddress, isAddress, type Address } from "viem";
import { net, type OwnerMove } from "@/lib/chain";
import { useGuardian } from "@/lib/useGuardian";
import { useNow } from "@/lib/useNow";
import HoldButton from "./HoldButton";
import { HourglassIcon, SnowflakeIcon } from "./Icons";
import { btn, btnGhost, card, input, short, timeLeft, usd } from "./ui";

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
          {state.totalUsd.toLocaleString(undefined, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" })}
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
            <li key={p.id.toString()} className="rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm">
              <div className="flex items-start gap-3">
                <HourglassIcon className="mt-1 shrink-0 text-warn" width={24} height={24} />
                <div className="min-w-0">
                  <p className="text-xl font-semibold">{usd(p.amount, token.decimals)} is leaving</p>
                  <p className="text-muted">
                    to <span className="font-mono">{short(p.to)}</span>
                    {p.guardianApproved && " · ✓ reviewed"}
                  </p>
                  <p className="mt-1 font-medium text-warn">
                    {now >= p.unlockAt ? "Can be released now" : now > 0 ? `Goes through in ${timeLeft(p.unlockAt - now)}` : "…"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  className="flex-1 rounded-xl bg-danger px-4 py-3 font-semibold text-white disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() => actions.cancelWithdrawal(p.id)}
                >
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
        <HoldButton
          className="w-full rounded-xl border border-danger/40 px-4 py-3 text-sm font-semibold text-danger disabled:opacity-50"
          disabled={!!busy}
          onHold={() => actions.freeze()}
        >
          <SnowflakeIcon width={18} height={18} /> Hold to freeze this vault
        </HoldButton>
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
  const mine = move.guardianNominees.find((g) => same(g.guardian, me))?.nominee ?? null;
  const valid = isAddress(to) && !same(to, owner);

  if (move.pendingOwnerAt > 0) {
    const ready = now > 0 && now >= move.pendingOwnerAt;
    return (
      <section className={`${card} border-warn`}>
        <p className="font-medium">This vault is moving to a new owner</p>
        <p className="mt-1 text-sm">
          New owner <span className="font-mono">{short(move.pendingOwner!)}</span>.{" "}
          {ready ? "The wait is over." : now > 0 ? `Happens in ${timeLeft(move.pendingOwnerAt - now)}.` : ""}
        </p>
        <p className="mt-1 text-xs text-muted">If the owner didn&apos;t ask for this, stop it. The owner&apos;s login can&apos;t.</p>
        <div className="mt-2 flex gap-2">
          <button className={`${btnGhost} text-danger`} disabled={busy || !iAmEstablished} onClick={() => actions.cancelOwnerChange()}>
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
      <p className="font-medium">Move to a new owner login</p>
      {move.ownerNominee && !same(move.ownerNominee, mine) && (
        <div className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-sm">
          <p>
            The owner asked to move this vault to <span className="font-mono">{short(move.ownerNominee)}</span>.
          </p>
          <p className="mt-1 text-xs text-muted">
            Call the owner and check the address with them first. Someone with a stolen key could ask for this too.
          </p>
          <button
            className={`${btnGhost} mt-2`}
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
      <input
        className={`${input} mt-2 font-mono text-sm`}
        placeholder="Owner's new address 0x…"
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
