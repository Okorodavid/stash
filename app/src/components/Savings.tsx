"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import type { Goal } from "@/lib/useVault";
import { useNow } from "@/lib/useNow";
import { btn, btnGhost, card, input, usd, type Loaded } from "./ui";

// Goal names are kept in the browser (not on-chain) to avoid paying for extra storage on Tempo.
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

  const create = async () => {
    const unlockAt = Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000);
    const nextId = Math.max(0, ...state.goals.map((g) => g.id)) + 1;
    saveGoalName(vault, nextId, name.trim() || `Goal #${nextId}`);
    await actions.createGoal(token, unlockAt, feeBps);
    setCreating(false);
    setName("");
    setDate("");
  };

  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <p className="font-medium">Savings goals</p>
        {!creating && (
          <button className={btnGhost} onClick={() => setCreating(true)}>
            New goal
          </button>
        )}
      </div>
      <p className="mb-2 text-sm text-muted">Lock money until a date. Unlocking early costs a small fee.</p>

      {state.goals.length === 0 && !creating && <p className="text-sm text-muted">No goals yet.</p>}
      <ul className="space-y-3">
        {state.goals.map((g) => (
          <GoalRow key={g.id} goal={g} ctx={ctx} />
        ))}
      </ul>

      {creating && (
        <div className="mt-3 space-y-2">
          <input className={input} placeholder="Name, e.g. Rent" value={name} onChange={(e) => setName(e.target.value)} />
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
        <input className={`${input} py-2`} inputMode="decimal" placeholder="Add $" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button
          className={btnGhost}
          disabled={!!busy || !amount}
          onClick={() => actions.fundGoal(goal.id, parseUnits(amount, token.decimals)).then(() => setAmount(""))}
        >
          Lock
        </button>
        {goal.locked > 0n && (
          <button
            className={`${btnGhost} ${matured ? "" : "text-warn"}`}
            disabled={!!busy || state.frozen}
            onClick={() => {
              if (!matured && fee > 0n && !confirm(`Unlocking early costs ${usd(fee, token.decimals)}. Continue?`)) return;
              actions.releaseGoal(goal.id);
            }}
          >
            Unlock
          </button>
        )}
      </div>
    </li>
  );
}

const FREQUENCIES = [
  { label: "every day", seconds: DAY },
  { label: "every week", seconds: 7 * DAY },
  { label: "every month", seconds: 30 * DAY },
];

export function AutoSaveCard({ ctx }: { ctx: Loaded }) {
  const { state, busy, actions } = ctx;
  const token = state.balances[0].token;
  const plan = state.autoSave;
  const [amount, setAmount] = useState("");
  const [interval, setIntervalSeconds] = useState(DAY);
  const [goalId, setGoalId] = useState(0);
  const now = useNow();

  const destination = (id: number) => (id === 0 ? "your vault" : goalName(state.vault!, id));
  const frequency = (s: number) => FREQUENCIES.find((f) => f.seconds === s)?.label ?? `every ${days(s)} days`;

  if (plan) {
    const due = now > 0 && now >= plan.nextAt;
    return (
      <section className={card}>
        <p className="font-medium">Auto-save is on</p>
        <p className="mt-1 text-sm">
          {usd(plan.amount, token.decimals)} {frequency(plan.interval)} from your wallet into {destination(plan.goalId)}.
        </p>
        <p className="text-sm text-muted">
          {due ? "Next save is due now." : `Next save: ${new Date(plan.nextAt * 1000).toLocaleString()}`}
        </p>
        <div className="mt-2 flex gap-2">
          {due && (
            <button className={btnGhost} disabled={!!busy} onClick={() => actions.runAutoSaveNow()}>
              Save now
            </button>
          )}
          <button className={`${btnGhost} text-danger`} disabled={!!busy} onClick={() => actions.stopAutoSave()}>
            Stop auto-save
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={card}>
      <p className="font-medium">Auto-save</p>
      <p className="mb-2 text-sm text-muted">
        Save a fixed amount on a schedule from your wallet. The vault can only pull that amount, only into your savings.
      </p>
      <div className="flex gap-2">
        <input className={input} inputMode="decimal" placeholder="$ amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className={input} value={interval} onChange={(e) => setIntervalSeconds(Number(e.target.value))}>
          {FREQUENCIES.map((f) => (
            <option key={f.seconds} value={f.seconds}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <label className="mt-2 block text-sm text-muted">
        Into
        <select className={`${input} mt-1`} value={goalId} onChange={(e) => setGoalId(Number(e.target.value))}>
          <option value={0}>My vault</option>
          {state.goals.map((g) => (
            <option key={g.id} value={g.id}>
              {goalName(state.vault!, g.id)}
            </option>
          ))}
        </select>
      </label>
      <button
        className={`${btn} mt-2`}
        disabled={!!busy || !amount}
        onClick={() => actions.startAutoSave(token, parseUnits(amount, token.decimals), interval, goalId).then(() => setAmount(""))}
      >
        Start auto-save
      </button>
    </section>
  );
}
