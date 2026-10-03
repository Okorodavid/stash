"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  type Address,
} from "viem";
import { STASH_GUARDIAN } from "@/lib/config";
import { useVault, type Pending } from "@/lib/useVault";
import { useNow } from "@/lib/useNow";
import RecoveryCard from "./Recovery";
import SavePotCard from "./SavePot";
import PotInfo from "./PotInfo";
import { useSavePot } from "@/lib/useSavePot";
import dynamic from "next/dynamic";

// Solana code is heavy; load it after the vault screen is up.
const GrowthPotCard = dynamic(() => import("./GrowthPot"), {
  ssr: false,
  loading: () => <section className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">Loading Growth pot…</section>,
});
import { AutoSaveCard, GoalsCard } from "./Savings";
import { btn, btnGhost, card, input, short, usd, type Loaded } from "./ui";


export default function Dashboard() {
  const { logout } = usePrivy();
  const ctx = useVault();
  const { owner, network, configured, state, busy, error, actions } = ctx;

  if (!configured) {
    return (
      <div className={card}>
        <p className="font-medium">
          Vault contracts not deployed on {network.chain.name} yet.
        </p>
        <p className="mt-1 text-sm text-muted">
          Set NEXT_PUBLIC_FACTORY_* in app/.env.local after running the deploy
          script.
        </p>
        <Footer owner={owner} onLogout={logout} />
      </div>
    );
  }
  if (!state) return <p className="text-muted">Loading your vault…</p>;

  return (
    <div className="space-y-4">
      {busy && (
        <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm">{busy}…</p>
      )}
      {error && (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {state.vault ? (
        <Vault ctx={{ ...ctx, state }} />
      ) : (
        <CreateVault onCreate={actions.createVault} disabled={!!busy} />
      )}
      <Footer owner={owner} onLogout={logout} />
    </div>
  );
}

function Vault({ ctx }: { ctx: Loaded }) {
  const { state: s, busy, actions } = ctx;
  const pot = useSavePot();
  const total = s.balances.reduce(
    (sum, b) => sum + Number(formatUnits(b.total, b.token.decimals)),
    0,
  );
  const saveTotal = pot.state ? Number(formatUnits(pot.state.idle + pot.state.earning, pot.usdc.decimals)) : 0;
  return (
    <>
      <section className={card}>
        <p className="text-sm text-muted">Your savings</p>
        <p className="text-4xl font-semibold">
          {total.toLocaleString(undefined, {
            style: "currency",
            currency: "USD",
          })}
        </p>
        <p className="mt-2 text-sm text-muted">
          {s.frozen ? (
            <span className="font-medium text-danger">
              Frozen by a guardian: nothing can leave.
            </span>
          ) : (
            <>Instant send left today: {usd(s.allowanceUsd, 18)}</>
          )}
        </p>
        <PotInfo pot="vault" />
      </section>
      {ctx.owner && <RecoveryCard owner={ctx.owner} />}
      <SaveCard ctx={ctx} />
      <GoalsCard ctx={ctx} />
      <SavePotCard home={ctx} pot={pot} />
      <GrowthPotCard otherSavingsUsd={total + saveTotal} />
      <AutoSaveCard ctx={ctx} />
      <SendCard ctx={ctx} />
      {s.pending.length > 0 && <PendingCard ctx={ctx} />}
      <GuardiansCard ctx={ctx} />
      {s.frozen ? (
        <section className={card}>
          <p className="font-medium">Your vault is frozen</p>
          <p className="mt-1 text-sm text-muted">
            {s.unfreezeApprovedBy
              ? `Guardian ${short(s.unfreezeApprovedBy)} approved unfreezing.`
              : "To unfreeze, ask one of your guardians to approve it from their guardian link. This stops a thief with your login from undoing a freeze."}
          </p>
          <button className={`${btn} mt-2`} disabled={!!busy || !s.unfreezeApprovedBy} onClick={() => actions.unfreeze()}>
            Unfreeze
          </button>
        </section>
      ) : (
        <button className={`${btnGhost} w-full text-danger`} disabled={!!busy} onClick={() => actions.freeze()}>
          Freeze my vault (emergency stop)
        </button>
      )}
    </>
  );
}

function SaveCard({ ctx }: { ctx: Loaded }) {
  const { busy, actions } = ctx;
  const [amount, setAmount] = useState("");
  const t = ctx.state.balances[0];
  return (
    <section className={card}>
      <p className="font-medium">Save</p>
      <p className="mb-2 text-sm text-muted">
        Wallet balance: {usd(t.wallet, t.token.decimals)} {t.token.symbol}
      </p>
      <input
        className={input}
        inputMode="decimal"
        placeholder="Amount in $"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button
        className={`${btn} mt-2`}
        disabled={!!busy || !amount}
        onClick={() =>
          actions
            .deposit(t.token, parseUnits(amount, t.token.decimals))
            .then(() => setAmount(""))
        }
      >
        Save to vault
      </button>
    </section>
  );
}

function SendCard({ ctx }: { ctx: Loaded }) {
  const { state: s, busy, actions } = ctx;
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const t = s.balances[0].token;
  const amt = Number(amount || 0);
  const allowance = Number(formatUnits(s.allowanceUsd, 18));
  const large = Number(formatUnits(s.largeThresholdUsd, 18));
  const instant = amt > 0 && amt <= allowance && amt < large;
  const valid = isAddress(to) && amt > 0;
  return (
    <section className={card}>
      <p className="font-medium">Send</p>
      <input
        className={`${input} mt-2 font-mono text-sm`}
        placeholder="Recipient 0x…"
        value={to}
        onChange={(e) => setTo(e.target.value.trim())}
      />
      <input
        className={`${input} mt-2`}
        inputMode="decimal"
        placeholder="Amount in $"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      {amt > 0 && (
        <p className="mt-2 text-sm text-muted">
          {instant
            ? "Arrives instantly (within today's limit)."
            : `Above your instant limit: it will wait ${s.timelock / 3600}h, and your guardians can stop it.`}
        </p>
      )}
      <button
        className={`${btn} mt-2`}
        disabled={!!busy || !valid || s.frozen}
        onClick={() => {
          const value = parseUnits(amount, t.decimals);
          const dest = getAddress(to) as Address;
          (instant
            ? actions.withdraw(t, dest, value)
            : actions.requestWithdrawal(t, dest, value)
          ).then(() => {
            setTo("");
            setAmount("");
          });
        }}
      >
        {instant ? "Send now" : "Start 24h wait"}
      </button>
    </section>
  );
}

function PendingCard({ ctx }: { ctx: Loaded }) {
  const { state, busy, actions } = ctx;
  const pending: Pending[] = state.pending;
  const now = useNow();
  const t = state.balances[0].token;
  return (
    <section className={card}>
      <p className="mb-2 font-medium">Waiting withdrawals</p>
      <ul className="space-y-3">
        {pending.map((p) => {
          const ready = now > 0 && now >= p.unlockAt;
          return (
            <li
              key={p.id.toString()}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <div>
                <p>
                  {usd(p.amount, t.decimals)} →{" "}
                  <span className="font-mono">{short(p.to)}</span>
                </p>
                <p className="text-muted">
                  {ready
                    ? "Ready to release"
                    : `Unlocks ${new Date(p.unlockAt * 1000).toLocaleString()}`}
                  {p.guardianApproved && " · ✓ guardian approved"}
                </p>
              </div>
              <div className="flex gap-2">
                {ready && (
                  <button
                    className={btnGhost}
                    disabled={!!busy || state.frozen}
                    onClick={() => actions.executeWithdrawal(p.id)}
                  >
                    Release
                  </button>
                )}
                <button
                  className={`${btnGhost} text-danger`}
                  disabled={!!busy}
                  onClick={() => actions.cancelWithdrawal(p.id)}
                >
                  Cancel
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GuardiansCard({ ctx }: { ctx: Loaded }) {
  const { busy, actions } = ctx;
  const guardians: Address[] = ctx.state.guardians;
  const [g, setG] = useState("");
  return (
    <section className={card}>
      <p className="font-medium">Guardians ({guardians.length}/3)</p>
      <p className="mb-2 text-sm text-muted">
        Any guardian can stop a withdrawal or freeze your vault. None can take
        your money.
      </p>
      <GuardianLink vault={ctx.state.vault!} />
      <ul className="mb-2 space-y-1 font-mono text-sm">
        {guardians.map((a) => (
          <li key={a}>
            {short(a)}{" "}
            {STASH_GUARDIAN &&
              a.toLowerCase() === STASH_GUARDIAN.toLowerCase() && (
                <span className="font-sans text-muted">(Stash)</span>
              )}
          </li>
        ))}
      </ul>
      {guardians.length < 3 && (
        <div className="flex gap-2">
          <input
            className={`${input} font-mono text-sm`}
            placeholder="Second phone or trusted person 0x…"
            value={g}
            onChange={(e) => setG(e.target.value.trim())}
          />
          <button
            className={btnGhost}
            disabled={!!busy || !isAddress(g)}
            onClick={() =>
              actions.addGuardian(getAddress(g)).then(() => setG(""))
            }
          >
            Add
          </button>
        </div>
      )}
    </section>
  );
}

function CreateVault({
  onCreate,
  disabled,
}: {
  onCreate: (g: Address[]) => Promise<unknown>;
  disabled: boolean;
}) {
  const [guardian, setGuardian] = useState("");
  const guardians = [
    STASH_GUARDIAN,
    isAddress(guardian) ? getAddress(guardian) : undefined,
  ].filter(Boolean) as Address[];
  return (
    <section className={card}>
      <p className="font-medium">Create your vault</p>
      <p className="mt-1 text-sm text-muted">
        Default rules: send up to $100 a day instantly; anything over $500 waits
        24 hours. You need at least one guardian.
      </p>
      {STASH_GUARDIAN && (
        <p className="mt-2 text-sm">✓ Stash guardian included</p>
      )}
      <input
        className={`${input} mt-3 font-mono text-sm`}
        placeholder={
          STASH_GUARDIAN
            ? "Optional: another guardian 0x…"
            : "Guardian address 0x… (required)"
        }
        value={guardian}
        onChange={(e) => setGuardian(e.target.value.trim())}
      />
      <button
        className={`${btn} mt-3`}
        disabled={disabled || guardians.length === 0}
        onClick={() => onCreate(guardians)}
      >
        Create vault
      </button>
    </section>
  );
}

function Footer({ owner, onLogout }: { owner?: string; onLogout: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!owner) return;
    try {
      await navigator.clipboard.writeText(owner);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Your wallet address:", owner);
    }
  };
  return (
    <footer className="flex items-center justify-between pt-2 text-xs text-muted">
      <button className="font-mono underline" onClick={copy} disabled={!owner} title={owner}>
        {owner ? (copied ? "Address copied ✓" : `${short(owner)} · copy address`) : ""}
      </button>
      <button className="underline" onClick={onLogout}>
        Sign out
      </button>
    </footer>
  );
}

function GuardianLink({ vault }: { vault: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}/guardian?vault=${vault}`;
    try {
      if (navigator.share) await navigator.share({ title: "Guard my Stash savings", url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Share sheet dismissed: nothing to do.
    }
  };
  return (
    <button className={`${btnGhost} mb-3 w-full`} onClick={share}>
      {copied ? "Guardian link copied ✓" : "Share guardian link"}
    </button>
  );
}
