"use client";

import { useId, useState } from "react";
import { parseUnits } from "viem";
import type { Goal } from "@/lib/useVault";
import { useNow } from "@/lib/useNow";
import { useNotify } from "@/lib/notify";
import { btn, btnDanger, btnGhost, card, cardTitle, cleanAmount, input, tint, usd, type Loaded } from "./ui";

// Goal names are kept in the browser (not on-chain) to avoid paying for extra on-chain storage.
const nameKey = (vault: string, id: number) => `stash:goal:${vault.toLowerCase()}:${id}`;
function goalName(vault: string, id: number) {
  try {
    return localStorage.getItem(nameKey(vault, id)) || `Goal #${id}`;
  } catch {
    return `Goal #${id}`;
  }
}
function saveGoalName(vault: string, id: number, name: string) {
  try {
    localStorage.setItem(nameKey(vault, id), name);
  } catch {
    // Storage unavailable (private mode): the goal just shows its number.
  }
}

const DAY = 86_400;
const days = (seconds: number) => Math.max(0, Math.ceil(seconds / DAY));

export function GoalsCard({ ctx }: { ctx: Loaded }) {
  const { state, busy, actions } = ctx;
  const vault = state.vault!;
  const token = state.balances[0].token;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [feeBps, setFeeBps] = useState(500);
  const now = useNow();
  const notify = useNotify();

  const create = async () => {
    const unlockAt = Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000);
    const nextId = Math.max(0, ...state.goals.map((g) => g.id)) + 1;
    saveGoalName(vault, nextId, name.trim() || `Goal #${nextId}`);
    const hash = await actions.createGoal(token, unlockAt, feeBps);
    if (hash) notify(`Goal "${name.trim() || `Goal #${nextId}`}" created. Lock money in it whenever you like.`);
    setCreating(false);
    setName("");
    setDate("");
  };

  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <h3 className={cardTitle}>Savings goals</h3>
        {!creating && (
          <button className={btnGhost} onClick={() => setCreating(true)}>
            New goal
          </button>
        )}
      </div>
      <p className="mb-2 text-sm text-muted">Lock money until a date. Unlocking early costs a small fee.</p>

      {state.goals.length === 0 && !creating && (
        <p className="text-sm">Saving for rent, school fees or a trip? Make it a goal and the money stays put until the date you pick.</p>
      )}
      <ul className="space-y-3">
        {state.goals.map((g) => (
          <GoalRow key={g.id} goal={g} ctx={ctx} />
        ))}
      </ul>

      {creating && (
        <div className="mt-3 space-y-2">
          <label className="block text-sm text-muted">
            What it&apos;s for
            <input className={`${input} mt-1`} placeholder="Rent" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm text-muted">
            Unlock date
            <input
              className={`${input} mt-1`}
              type="date"
              min={now ? new Date((now + DAY) * 1000).toISOString().slice(0, 10) : undefined}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block text-sm text-muted">
            Fee if you unlock early
            <select className={`${input} mt-1`} value={feeBps} onChange={(e) => setFeeBps(Number(e.target.value))}>
              <option value={0}>No fee</option>
              <option value={200}>2%</option>
              <option value={500}>5%</option>
              <option value={1000}>10%</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button className={btn} disabled={!!busy || !date} onClick={create}>
              Create goal
            </button>
            <button className={btnGhost} onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function GoalRow({ goal, ctx }: { goal: Goal; ctx: Loaded }) {
  const { state, busy, actions } = ctx;
  const token = state.balances.find((b) => b.token.address.toLowerCase() === goal.token.toLowerCase())?.token ?? state.balances[0].token;
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const id = useId();
  const notify = useNotify();
  const unlock = () =>
    actions.releaseGoal(goal.id).then((h) => h && notify(`${goalName(state.vault!, goal.id)} unlocked. The money is back in your vault.`));
  const now = useNow();
  const matured = now > 0 && now >= goal.unlockAt;
  const fee = (goal.locked * BigInt(goal.breakFeeBps)) / 10_000n;

  return (
    <li className="rounded-xl border border-line p-3 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{goalName(state.vault!, goal.id)}</span>
        <span className="text-lg font-semibold">{usd(goal.locked, token.decimals)}</span>
      </div>
      <p className="text-muted">
        {matured ? "Unlocked: free to use" : `Unlocks ${new Date(goal.unlockAt * 1000).toLocaleDateString()} · ${days(goal.unlockAt - now)} days left`}
        {!matured && goal.breakFeeBps > 0 && ` · ${goal.breakFeeBps / 100}% early fee`}
      </p>
      <div className="mt-2 flex gap-2">
        <label htmlFor={id} className="sr-only">
          Amount to lock in {goalName(state.vault!, goal.id)}
        </label>
        <input id={id} className={`${input} py-2`} inputMode="decimal" placeholder="Add $" value={amount} onChange={(e) => setAmount(cleanAmount(e.target.value))} />
        <button
          className={btnGhost}
          disabled={!!busy || !amount}
          onClick={() =>
            actions.fundGoal(goal.id, parseUnits(amount, token.decimals)).then((h) => {
              if (!h) return;
              notify(`Locked $${amount} in ${goalName(state.vault!, goal.id)}.`);
              setAmount("");
            })
          }
        >
          Lock
        </button>
        {goal.locked > 0n && (
          <button
            className={`${btnGhost} ${matured ? "" : "text-warn-ink"}`}
            disabled={!!busy || state.frozen}
            onClick={() => (!matured && fee > 0n ? setConfirming(true) : unlock())}
          >
            Unlock
          </button>
        )}
      </div>
      {/* In-page confirm: browser pop-ups are blocked in many in-app browsers. */}
      {confirming && (
        <div className={`mt-2 rounded-lg p-3 ${tint.warn}`} role="group" aria-label="Confirm early unlock">
          <p>Unlocking early costs {usd(fee, token.decimals)}. The rest goes back to your vault.</p>
          <div className="mt-2 flex gap-2">
            <button
              className={btnDanger}
              disabled={!!busy}
              onClick={() => {
                setConfirming(false);
                unlock();
              }}
            >
              Unlock and pay {usd(fee, token.decimals)}
            </button>
            <button className={`${btnGhost} shrink-0 bg-card`} onClick={() => setConfirming(false)}>
              Keep it locked
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
