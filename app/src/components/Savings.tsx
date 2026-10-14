"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useConnectWallet, type ConnectedWallet } from "@privy-io/react-auth";
import { erc20Abi, parseUnits, type Address } from "viem";
import { publicClient, readVault, vaultCall } from "@/lib/chain";
import { usePreview } from "@/lib/preview";
import { useSender } from "@/lib/useSender";
import type { Goal } from "@/lib/useVault";
import { useNow } from "@/lib/useNow";
import { useNotify } from "@/lib/notify";
import { btn, btnDanger, btnGhost, card, cardTitle, cleanAmount, input, short, textLink, tint, usd, type Loaded } from "./ui";

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

const FREQUENCIES = [
  { label: "every day", seconds: DAY },
  { label: "every week", seconds: 7 * DAY },
  { label: "every month", seconds: 30 * DAY },
];

// Wallets that pay into a vault by auto-save, remembered in this browser so their plans show up
// (the vault only stores plans by paying wallet; listing them all would need an event scan).
const sourcesKey = (vault: string) => `stash:autosave-sources:${vault.toLowerCase()}`;
function rememberedSources(vault: string): Address[] {
  try {
    return JSON.parse(localStorage.getItem(sourcesKey(vault)) || "[]");
  } catch {
    return [];
  }
}
function rememberSource(vault: string, source: Address) {
  try {
    const all = rememberedSources(vault);
    if (!all.some((a) => a.toLowerCase() === source.toLowerCase())) localStorage.setItem(sourcesKey(vault), JSON.stringify([...all, source]));
  } catch {
    // Storage unavailable: the plan still runs; it just won't be listed after a reload.
  }
}

type Plan = { source: Address; amount: bigint; interval: number; goalId: number; nextAt: number };

/**
 * Auto-save: a fixed amount on a schedule from a paying wallet into the vault. By default the paying
 * wallet is another one the user owns (MetaMask, Rabby, Coinbase Wallet…), so savings move out of an
 * everyday wallet and into the vault's protection. The vault can only pull that amount, only into
 * itself; the paying wallet or the vault owner can stop it any time.
 */
export function AutoSaveCard({ ctx }: { ctx: Loaded }) {
  const { state, busy, actions, owner } = ctx;
  const { preview, signUp } = usePreview();
  const { connectWallet } = useConnectWallet();
  const token = state.balances[0].token;
  const vault = state.vault as Address;
  const [amount, setAmount] = useState("");
  const [interval, setIntervalSeconds] = useState(DAY);
  const [goalId, setGoalId] = useState(0);
  const [payFrom, setPayFrom] = useState<"other" | "stash">("other");
  const [plans, setPlans] = useState<Plan[]>([]);
  const now = useNow();
  const notify = useNotify();

  const me = owner?.toLowerCase();
  const pick = useCallback(
    (ws: ConnectedWallet[]) => ws.find((w) => w.walletClientType !== "privy" && w.address.toLowerCase() !== me),
    [me],
  );
  const ext = useSender(pick);
  const [extBalance, setExtBalance] = useState<bigint | null>(null);

  // Plans from the user's other wallets: the connected one plus any set up before in this browser.
  const loadPlans = useCallback(async () => {
    if (preview || !state.vault) return;
    const sources = [...rememberedSources(state.vault), ...(ext.account ? [ext.account] : [])].filter(
      (a, i, all) => a.toLowerCase() !== me && all.findIndex((b) => b.toLowerCase() === a.toLowerCase()) === i,
    );
    const found = await Promise.all(
      sources.map(async (source) => {
        const p = (await readVault(state.vault!, "autoSaves", [source])) as readonly [Address, bigint, number, bigint, bigint];
        return p[4] === 0n ? null : { source, interval: Number(p[1]), goalId: Number(p[2]), amount: p[3], nextAt: Number(p[4]) };
      }),
    );
    setPlans(found.filter((p): p is Plan => p !== null));
    if (ext.account) {
      setExtBalance(await publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [ext.account] }));
    }
  }, [preview, state.vault, ext.account, me, token.address]);
  useEffect(() => {
    const first = setTimeout(() => loadPlans().catch(() => {}), 0);
    const t = setInterval(() => loadPlans().catch(() => {}), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadPlans]);

  const all: Plan[] = [
    ...(state.autoSave && owner ? [{ source: owner, ...state.autoSave }] : []),
    ...plans,
  ];
  const destination = (id: number) => (id === 0 ? "your vault" : goalName(state.vault!, id));
  const frequency = (s: number) => FREQUENCIES.find((f) => f.seconds === s)?.label ?? `every ${days(s)} days`;
  const fromName = (source: Address) => (source.toLowerCase() === me ? "your Stash wallet" : `wallet ${short(source)}`);

  let parsed = 0n;
  try {
    parsed = amount ? parseUnits(amount, token.decimals) : 0n;
  } catch {
    parsed = 0n;
  }

  const startFromOther = async () => {
    if (preview) return signUp();
    if (!ext.account || parsed === 0n) return;
    const current = await publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "allowance", args: [ext.account, vault] });
    const yearOfPulls = parsed * BigInt(Math.ceil((365 * DAY) / interval));
    const hash = await ext.send("Starting auto-save", [
      { address: token.address, abi: erc20Abi, functionName: "approve", args: [vault, current + yearOfPulls] },
      vaultCall(vault, "authorizeAutoSave", [token.address, parsed, BigInt(interval), goalId]),
    ]);
    if (!hash) return;
    rememberSource(vault, ext.account);
    notify(`Auto-save on: $${amount} ${frequency(interval)} from ${short(ext.account)} into ${destination(goalId)}.`);
    setAmount("");
    await loadPlans();
  };
  const startFromStash = () =>
    actions.startAutoSave(token, parsed, interval, goalId).then((h) => {
      if (!h) return;
      notify(`Auto-save on: $${amount} ${frequency(interval)} into ${destination(goalId)}.`);
      setAmount("");
    });

  const other = payFrom === "other";
  const needsWallet = other && (!ext.account || preview);

  return (
    <section className={card}>
      <h3 className={cardTitle}>Auto-save</h3>
      <p className="mb-2 text-sm text-muted">
        Move a fixed amount from another wallet into your vault on a schedule. Once it lands, it&apos;s behind your
        limits and guardians. The vault can only pull that amount, only into your savings.
      </p>

      {all.length > 0 && (
        <ul className="mb-3 space-y-2">
          {all.map((p) => {
            const due = now > 0 && now >= p.nextAt;
            return (
              <li key={p.source} className="rounded-xl border border-line px-3 py-2 text-sm">
                <p>
                  {usd(p.amount, token.decimals)} {frequency(p.interval)} from {fromName(p.source)} into {destination(p.goalId)}
                </p>
                <p className="text-xs text-muted">
                  {due ? "Next save is due now." : `Next save: ${new Date(p.nextAt * 1000).toLocaleString()}`}
                </p>
                <div className="mt-2 flex gap-2">
                  {due && (
                    <button
                      className={btnGhost}
                      disabled={!!busy}
                      onClick={() => actions.runAutoSaveNow(p.source).then((h) => h && (notify("Saved this round of auto-save."), loadPlans()))}
                    >
                      Save now
                    </button>
                  )}
                  <button
                    className={`${btnGhost} text-danger-ink`}
                    disabled={!!busy}
                    onClick={() =>
                      actions.stopAutoSave(p.source).then((h) => h && (notify("Auto-save stopped. Nothing more will be pulled from that wallet."), loadPlans()))
                    }
                  >
                    Stop
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mb-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pay from">
        {(
          [
            ["other", "Another wallet"],
            ["stash", "My Stash wallet"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={payFrom === id}
            className={`${btnGhost} ${payFrom === id ? "border-accent bg-accent/10 text-accent" : ""}`}
            onClick={() => setPayFrom(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {needsWallet ? (
        <button
          className={`${btn} w-full`}
          onClick={() => (preview ? signUp() : connectWallet({ walletChainType: "ethereum-only" }))}
        >
          Connect the wallet to save from
        </button>
      ) : (
        <>
          {other && ext.account && (
            <p className="mb-2 text-sm">
              From <span className="font-mono">{short(ext.account)}</span> ·{" "}
              {extBalance === null ? "…" : `${usd(extBalance, token.decimals)} ${token.symbol}`}{" "}
              <button className={`${textLink} ml-1 text-xs`} onClick={() => ext.wallet?.disconnect()}>
                Use a different wallet
              </button>
            </p>
          )}
          <div className="flex gap-2">
            <input
              className={input}
              inputMode="decimal"
              placeholder="$ amount"
              aria-label="Amount to save each time, in dollars"
              value={amount}
              onChange={(e) => setAmount(cleanAmount(e.target.value))}
            />
            <select className={input} aria-label="How often" value={interval} onChange={(e) => setIntervalSeconds(Number(e.target.value))}>
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
            disabled={!preview && (!!busy || !!ext.busy || parsed === 0n)}
            onClick={other ? startFromOther : startFromStash}
          >
            Start auto-save
          </button>
          {other && (
            <p className="mt-2 text-xs text-muted">
              That wallet approves a year of saves and pays a small network fee once. Keep enough {token.symbol} in it for each save.
            </p>
          )}
          {ext.busy && <p role="status" className={`mt-2 rounded-lg px-3 py-2 text-sm ${tint.accent}`}>{ext.busy}…</p>}
          {ext.error && <p role="alert" className={`mt-2 rounded-lg px-3 py-2 text-sm ${tint.danger}`}>{ext.error}</p>}
        </>
      )}
    </section>
  );
}
