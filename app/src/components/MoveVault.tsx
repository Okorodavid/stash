"use client";

import { useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { useNow } from "@/lib/useNow";
import { btn, btnGhost, card, cardTitle, input, short, timeLeft, tint, type Loaded } from "./ui";

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Owner side of moving the vault to a new owner key: for a leaked recovery key, or a new login.
 * The owner key and a guardian must name the same key; the move then waits the vault's waiting period.
 */
export default function MoveVaultCard({ ctx }: { ctx: Loaded }) {
  const { state: s, busy, actions } = ctx;
  const [to, setTo] = useState("");
  const now = useNow();
  const m = s.ownerMove;

  const title = <h3 className={cardTitle}>Move your vault to a new login</h3>;

  if (!m) {
    return (
      <section className={card}>
        {title}
        <p className="mt-1 text-sm text-muted">Not available for this vault. A guardian can still freeze it.</p>
      </section>
    );
  }

  if (m.pendingOwnerAt > 0) {
    const ready = now > 0 && now >= m.pendingOwnerAt;
    return (
      <section className={`${card} border-warn`}>
        {title}
        <p className="mt-1 text-sm">
          Moving to <span className="font-mono">{short(m.pendingOwner!)}</span>.{" "}
          {ready ? "The wait is over." : now > 0 ? `Happens in ${timeLeft(m.pendingOwnerAt - now)}.` : ""}
        </p>
        <p className="mt-1 text-xs text-muted">After the move, only the new login controls this vault.</p>
        {ready && (
          <button className={`${btn} mt-3`} disabled={!!busy} onClick={() => actions.applyOwnerChange()}>
            Complete the move
          </button>
        )}
      </section>
    );
  }

  const valid = isAddress(to) && !same(to, ctx.owner);
  // A guardian already named a key: the owner can agree to it with one tap.
  const offers = m.guardianNominees.filter((g) => !same(g.nominee, m.ownerNominee));

  return (
    <section className={card}>
      {title}

      {m.ownerNominee && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${tint.warn}`}>
          Moving to <span className="font-mono">{short(m.ownerNominee)}</span>: waiting for a guardian to confirm.
        </p>
      )}

      {offers.map((g) => (
        <div key={g.guardian} className={`mt-3 rounded-lg px-3 py-2 text-sm ${tint.warn}`}>
          <p>
            Guardian <span className="font-mono">{short(g.guardian)}</span> proposed moving your vault to{" "}
            <span className="font-mono">{short(g.nominee)}</span>.
          </p>
          <p className="mt-1 text-xs">Don&apos;t recognise it? Ignore it.</p>
          <button className={`${btnGhost} mt-2 bg-card`} disabled={!!busy} onClick={() => actions.nominateOwner(g.nominee)}>
            That&apos;s my new login: agree
          </button>
        </div>
      ))}

      <label htmlFor="move-to" className="mt-3 block text-sm text-muted">
        New login&apos;s address (sign up in a private window)
      </label>
      <input
        id="move-to"
        className={`${input} mt-1 font-mono text-sm`}
        placeholder="0x…"
        spellCheck={false}
        value={to}
        onChange={(e) => setTo(e.target.value.trim())}
      />
      {to && !valid && <p className="mt-1 text-xs text-warn-ink">Enter a different 0x address from this login.</p>}
      <button
        className={`${btnGhost} mt-2 w-full`}
        disabled={!!busy || !valid}
        onClick={() => actions.nominateOwner(getAddress(to) as Address).then((h) => h && setTo(""))}
      >
        Request the move
      </button>
      <p className="mt-1 text-xs text-muted">Then call a guardian to confirm it. Not by text alone.</p>
    </section>
  );
}
