"use client";

import { useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { useNow } from "@/lib/useNow";
import { btn, btnGhost, card, input, short, timeLeft, waitText, type Loaded } from "./ui";

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

  const title = <p className="font-medium">Move your vault to a new login</p>;

  if (!m) {
    return (
      <section className={card}>
        {title}
        <p className="mt-1 text-sm text-muted">
          This vault was created before moving was available. If your recovery key leaks, a guardian can still freeze it so
          nothing leaves.
        </p>
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
        <p className="mt-1 text-xs text-muted">
          Any guardian can still cancel it. After the move, sign in with the new login to see this vault; this login will
          no longer control it.
        </p>
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
      <p className="mt-1 text-sm text-muted">
        Use this if your recovery key may have leaked, or you want this vault under a different account. One of your
        guardians has to agree, then it waits {waitText(s.timelock)}. Your limits and guardians protect your money the
        whole time.
      </p>

      {m.ownerNominee && (
        <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-sm">
          You asked to move to <span className="font-mono">{short(m.ownerNominee)}</span>. Waiting for a guardian to
          confirm the same address from their guardian page.
        </p>
      )}

      {offers.map((g) => (
        <div key={g.guardian} className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-sm">
          <p>
            Guardian <span className="font-mono">{short(g.guardian)}</span> proposed moving your vault to{" "}
            <span className="font-mono">{short(g.nominee)}</span>.
          </p>
          <p className="mt-1 text-xs text-muted">Only agree if that is your own new login. If you don&apos;t recognise it, ignore it.</p>
          <button className={`${btnGhost} mt-2`} disabled={!!busy} onClick={() => actions.nominateOwner(g.nominee)}>
            That&apos;s my new login: agree
          </button>
        </div>
      ))}

      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        <li>Open Stash in a private window and sign up with a new email.</li>
        <li>Copy that account&apos;s address (bottom of the page) and paste it below.</li>
        <li>Call one of your guardians and ask them to confirm the same address. Don&apos;t rely on a text message alone.</li>
      </ol>
      <input
        className={`${input} mt-3 font-mono text-sm`}
        placeholder="New login's address 0x…"
        value={to}
        onChange={(e) => setTo(e.target.value.trim())}
      />
      {to && !valid && <p className="mt-1 text-xs text-warn">Enter a different 0x address from this login.</p>}
      <button
        className={`${btnGhost} mt-2 w-full`}
        disabled={!!busy || !valid}
        onClick={() => actions.nominateOwner(getAddress(to) as Address).then((h) => h && setTo(""))}
      >
        Request the move
      </button>
    </section>
  );
}
