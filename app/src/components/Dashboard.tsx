"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useCreateWallet, usePrivy } from "@privy-io/react-auth";
import {
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  type Address,
} from "viem";
import { HOME_CHAIN, HOME_IS_SAVE, MODE, STASH_GUARDIAN, switchHome, type HomeChain } from "@/lib/config";
import { HAS_TEST_FAUCET } from "@/lib/chain";
import { sampleVaultState, useVault, type Pending } from "@/lib/useVault";
import { useNow } from "@/lib/useNow";
import { PreviewProvider, signUpInstead, usePreview } from "@/lib/preview";
import RecoveryCard, { RecoverySettings } from "./Recovery";
import MoveVaultCard from "./MoveVault";
import DepositFromWallet from "./DepositFromWallet";
import AlertsButton from "./AlertsButton";
import SavePotCard from "./SavePot";
import PotInfo from "./PotInfo";
import HoldButton from "./HoldButton";
import { HomeIcon, HourglassIcon, JarIcon, ShieldIcon, SnowflakeIcon, SwapIcon, UserIcon } from "./Icons";
import { useSavePot } from "@/lib/useSavePot";
import dynamic from "next/dynamic";

// Solana code is heavy; load it after the vault screen is up.
const GrowthPotCard = dynamic(() => import("./GrowthPot"), {
  ssr: false,
  loading: () => <section className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">Loading Growth pot…</section>,
});
import { AutoSaveCard, GoalsCard } from "./Savings";

// Swap pulls in Relay and Solana code; load it only when the tab is opened.
const SwapTab = dynamic(() => import("./Swap"), {
  ssr: false,
  loading: () => <section className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">Loading swaps…</section>,
});
import { btn, btnGhost, btnWarn, card, input, short, timeLeft, usd, waitAdj, waitText, type Loaded } from "./ui";

const dollars = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" });

export default function Dashboard() {
  const { logout: signOut } = usePrivy();
  const { preview, signUp } = usePreview();
  // In the signed-out preview the footer link signs up instead of out.
  const logout = preview ? signUp : signOut;
  const ctx = useVault();
  const { owner, network, configured, state } = ctx;

  // Someone who signed in with a Solana-only wallet (e.g. Phantom) has no EVM wallet to own a vault,
  // and Privy only auto-creates one for users with no wallet at all. Create an embedded one for them.
  const { createWallet } = useCreateWallet();
  useEffect(() => {
    if (preview || !ctx.ready || owner) return;
    const t = setTimeout(() => createWallet().catch(() => {}), 0);
    return () => clearTimeout(t);
  }, [preview, ctx.ready, owner, createWallet]);

  if (!configured) {
    return (
      <div className={`${card} mx-auto max-w-md`}>
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
  if (!state) return <p className="mx-auto max-w-md text-muted">Loading your vault…</p>;

  if (!state.vault) return <NoVaultYet ctx={{ ...ctx, state }} onLogout={logout} />;
  return <Vault ctx={{ ...ctx, state }} onLogout={logout} />;
}

/**
 * Signed in, no vault yet: show the whole app with a sample vault (their real wallet balance) instead
 * of a form. Creating the vault opens on demand: from the banner or from any action they try.
 */
function NoVaultYet({ ctx, onLogout }: { ctx: Loaded; onLogout: () => void }) {
  const [creating, setCreating] = useState(false);
  const open = () => setCreating(true);
  const sample: Loaded = { ...ctx, state: sampleVaultState(ctx.state), actions: signUpInstead(ctx.actions, open) };
  return (
    <PreviewProvider signUp={open}>
      <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">You&apos;re signed in. Create your vault to start saving.</p>
          <p className="text-sm text-muted">This is a sample of your vault. It takes one tap, and you pick your own waiting period.</p>
        </div>
        <button className="shrink-0 rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-fg" onClick={open}>
          Create vault
        </button>
      </section>
      <Vault ctx={sample} onLogout={onLogout} />
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Create your vault"
          onClick={(e) => e.target === e.currentTarget && !ctx.busy && setCreating(false)}
        >
          <div className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto">
            <Status busy={ctx.busy} error={ctx.error} />
            <CreateVault onCreate={ctx.actions.createVault} disabled={!!ctx.busy} />
            <button className={`${btnGhost} w-full bg-card`} disabled={!!ctx.busy} onClick={() => setCreating(false)}>
              Not now
            </button>
          </div>
        </div>
      )}
    </PreviewProvider>
  );
}

function Status({ busy, error }: { busy?: string | null; error?: string | null }) {
  return (
    <>
      {busy && <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm">{busy}…</p>}
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
    </>
  );
}

type Tab = "home" | "pots" | "swap" | "protect" | "account";
const TABS: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "pots", label: "Pots", Icon: JarIcon },
  { id: "swap", label: "Swap", Icon: SwapIcon },
  { id: "protect", label: "Protect", Icon: ShieldIcon },
  { id: "account", label: "Account", Icon: UserIcon },
];

/**
 * Phone: one tab at a time with a bottom tab bar. Desktop: sidebar, the tab in the middle, and the
 * protection summary always visible on the right. Hidden tabs stay mounted so forms keep their input.
 */
function Vault({ ctx, onLogout }: { ctx: Loaded; onLogout: () => void }) {
  const { state: s } = ctx;
  const [tab, setTab] = useState<Tab>("home");
  const pot = useSavePot();
  const [growthUsd, setGrowthUsd] = useState<number | null>(null);
  const mainUsd = s.balances.reduce((sum, b) => sum + Number(formatUnits(b.total, b.token.decimals)), 0);
  // With Base as home, the main account already is the vault's idle USDC: only the earning part is extra.
  const saveUsd = pot.state
    ? Number(formatUnits(HOME_IS_SAVE ? pot.state.earning : pot.state.idle + pot.state.earning, pot.usdc.decimals))
    : 0;
  const allUsd = mainUsd + saveUsd + (growthUsd ?? 0);
  const show = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="lg:grid lg:grid-cols-[168px_minmax(0,1fr)_300px] lg:items-start lg:gap-8">
      <nav className="sticky top-6 hidden flex-col gap-1 lg:flex" aria-label="Sections">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => show(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
              tab === id ? "bg-accent/10 text-accent" : "text-muted hover:bg-panel hover:text-foreground"
            }`}
          >
            <Icon />
            {label}
          </button>
        ))}
        <div className="mt-6 border-t border-line pt-3">
          <Footer owner={ctx.owner} onLogout={onLogout} stacked />
        </div>
      </nav>

      <div className="min-w-0 space-y-4 pb-24 lg:pb-0">
        <Status busy={ctx.busy} error={ctx.error} />

        <div hidden={tab !== "home"} className="space-y-4">
          <Hero ctx={ctx} allUsd={allUsd} mainUsd={mainUsd} />
          {HOME_IS_SAVE && ctx.owner && pot.state?.walletGas === 0n && (
            <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
              Your main account is on Base, where network fees are paid in ETH. Send a little ETH on Base to{" "}
              <span className="font-mono">{short(ctx.owner)}</span> before saving or sending.
            </p>
          )}
          {s.pending.length > 0 && <PendingCard ctx={ctx} />}
          {ctx.owner && ctx.embedded && <RecoveryCard owner={ctx.owner} />}
          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <SendCard ctx={ctx} />
            <SaveCard ctx={ctx} />
          </div>
          {/* People who signed in with their own wallet already save from it with the Save card. */}
          {(!ctx.owner || ctx.embedded) && <DepositFromWallet ctx={ctx} />}
          <DrainLink vault={s.vault!} />
        </div>

        <div hidden={tab !== "pots"} className="space-y-4">
          <Jars
            main={mainUsd}
            save={pot.enabled ? saveUsd : null}
            saveRate={pot.enabled ? `${pot.network.chain.name}` : ""}
            growth={growthUsd}
          />
          <GoalsCard ctx={ctx} />
          {HOME_CHAIN === "tempo" && <TempoEarnSoon />}
          <div id="save-pot" className="scroll-mt-6">
            <SavePotCard home={ctx} pot={pot} />
          </div>
          <div id="growth-pot" className="scroll-mt-6">
            <GrowthPotCard otherSavingsUsd={mainUsd + saveUsd} onValueUsd={setGrowthUsd} />
          </div>
          <AutoSaveCard ctx={ctx} />
        </div>

        {tab === "swap" && <SwapTab />}

        <div hidden={tab !== "protect"} className="space-y-4">
          <div className="lg:hidden">
            <ProtectSummary ctx={ctx} />
          </div>
          <GuardiansCard ctx={ctx} />
          <RulesCard ctx={ctx} />
          <DrainLink vault={s.vault!} />
        </div>

        <div hidden={tab !== "account"} className="space-y-4">
          {!ctx.owner && <PreviewAccountCard />}
          <HomeChainCard />
          {ctx.owner && (ctx.embedded ? <RecoverySettings owner={ctx.owner} /> : <OwnKeyCard owner={ctx.owner} />)}
          <MoveVaultCard ctx={ctx} />
        </div>

        <div className="lg:hidden">
          <Footer owner={ctx.owner} onLogout={onLogout} />
        </div>
      </div>

      <aside className="sticky top-6 hidden lg:block">
        <ProtectSummary ctx={ctx} />
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Sections"
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => show(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pt-2.5 pb-2 text-xs font-medium ${
              tab === id ? "text-accent" : "text-muted"
            }`}
          >
            <Icon width={22} height={22} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Balance with the instant-send allowance as a ring that refills through the day. */
function Hero({ ctx, allUsd, mainUsd }: { ctx: Loaded; allUsd: number; mainUsd: number }) {
  const s = ctx.state;
  const allowance = Number(formatUnits(s.allowanceUsd, 18));
  const limit = Number(formatUnits(s.dailyLimitUsd, 18));
  const frac = limit > 0 ? Math.min(1, allowance / limit) : 0;
  const r = 52;
  const circ = 2 * Math.PI * r;
  return (
    <section className={card}>
      <div className="flex items-center gap-5">
        <div className="relative size-28 shrink-0">
          <svg viewBox="0 0 120 120" className="size-28 -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
            <circle
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={s.frozen ? "var(--danger)" : "var(--accent)"}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${frac * circ} ${circ}`}
              className="transition-[stroke-dasharray] duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-base font-semibold">{s.frozen ? "$0" : usd(s.allowanceUsd, 18)}</span>
            <span className="text-[11px] text-muted">of {usd(s.dailyLimitUsd, 18)}</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted">Your savings</p>
          <p className="truncate text-3xl font-semibold sm:text-4xl">{dollars(allUsd)}</p>
          <p className="mt-1 text-sm text-muted">Main account {dollars(mainUsd)}</p>
          {/* Where the main account lives, switchable right here (each chain keeps its own vault). */}
          <div className="mt-2 inline-flex rounded-full border border-line p-0.5" role="group" aria-label="Main account chain">
            {HOME_CHAINS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={HOME_CHAIN === c.id}
                title={c.note}
                onClick={() => c.id !== HOME_CHAIN && switchHome(c.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  HOME_CHAIN === c.id ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm">
        {s.frozen ? (
          <span className="font-medium text-danger">Frozen by a guardian: nothing can leave.</span>
        ) : (
          <span className="text-muted">
            The ring is what you can send instantly right now. It refills gradually through the day; anything bigger waits{" "}
            {waitText(s.timelock)}.
          </span>
        )}
      </p>
      <PotInfo pot="vault" />
    </section>
  );
}

/** Each pot as a jar filled to its share of all savings. */
function Jars({ main, save, saveRate, growth }: { main: number; save: number | null; saveRate: string; growth: number | null }) {
  const total = main + (save ?? 0) + (growth ?? 0);
  const share = (v: number) => (total > 0 && v > 0 ? Math.min(0.9, Math.max(0.08, v / total)) : 0);
  return (
    <section className={card}>
      <p className="font-medium">Your pots</p>
      <p className="text-sm text-muted">Each jar fills with its share of your savings.</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Jar label="Main" value={dollars(main)} sub="Instant, protected" fill={share(main)} color="var(--muted)" />
        {save !== null && (
          <Jar label="Save" value={dollars(save)} sub={`Earning · ${saveRate}`} fill={share(save)} color="var(--accent)" href="#save-pot" />
        )}
        <Jar
          label="Growth"
          value={growth === null ? "…" : dollars(growth)}
          sub="Earning · Solana"
          fill={share(growth ?? 0)}
          color="var(--growth)"
          href="#growth-pot"
        />
      </div>
    </section>
  );
}

const JAR_PATH = "M14 14Q8 20 8 34V66Q8 74 16 74H48Q56 74 56 66V34Q56 20 50 14Z";

function Jar({ label, value, sub, fill, color, href }: { label: string; value: string; sub: string; fill: number; color: string; href?: string }) {
  const clip = useId();
  const top = 74 - fill * 60; // the body spans y=14..74
  const body: ReactNode = (
    <>
      <svg viewBox="0 0 64 80" className="mx-auto h-24 w-20" aria-hidden="true">
        <defs>
          <clipPath id={clip}>
            <path d={JAR_PATH} />
          </clipPath>
        </defs>
        <rect x="18" y="4" width="28" height="8" rx="2" fill={color} />
        <rect x="0" y={top} width="64" height={80 - top} fill={color} opacity="0.85" clipPath={`url(#${clip})`} className="transition-all duration-700" />
        <path d={JAR_PATH} fill="none" stroke={color} strokeWidth="3" />
      </svg>
      <p className="mt-1 text-sm font-medium">{label}</p>
      <p className="truncate text-base font-semibold">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </>
  );
  return href ? (
    <a href={href} className="rounded-xl p-1 hover:bg-panel">
      {body}
    </a>
  ) : (
    <div className="p-1">{body}</div>
  );
}

/** Always-visible safety status: worst case, rules, guardians, and the emergency stop. */
function ProtectSummary({ ctx }: { ctx: Loaded }) {
  const { state: s, busy, actions } = ctx;
  const waiting = s.pending.length;
  const status = s.frozen
    ? { cls: "bg-danger/10 text-danger", title: "Frozen", body: "Nothing can leave until a guardian approves unfreezing." }
    : waiting > 0
      ? {
          cls: "bg-warn/10 text-warn",
          title: `${waiting} withdrawal${waiting > 1 ? "s" : ""} waiting`,
          body: "Check it's you. If not, cancel it or freeze your vault.",
        }
      : {
          cls: "bg-accent/10 text-accent",
          title: "Protected",
          body: `A stolen Key can move at most ${usd(s.dailyLimitUsd, 18)} a day instantly. Anything more waits ${waitText(s.timelock)}.`,
        };
  return (
    <section className={`${card} space-y-4`}>
      <div className={`rounded-xl px-3 py-2.5 ${status.cls}`}>
        <p className="flex items-center gap-2 text-sm font-semibold">
          {s.frozen ? <SnowflakeIcon width={18} height={18} /> : waiting > 0 ? <HourglassIcon width={18} height={18} /> : <ShieldIcon width={18} height={18} />}
          {status.title}
        </p>
        <p className="mt-0.5 text-xs">{status.body}</p>
      </div>
      <dl className="divide-y divide-line text-sm">
        <div className="flex justify-between py-2">
          <dt className="text-muted">Instant limit</dt>
          <dd>{usd(s.dailyLimitUsd, 18)} / day</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-muted">Bigger withdrawals wait</dt>
          <dd>{waitText(s.timelock)}</dd>
        </div>
        <div className="py-2">
          <dt className="text-muted">Guardians ({s.guardians.length}/3)</dt>
          <dd className="mt-1 space-y-1 font-mono text-xs">
            {s.guardians.map((a) => (
              <p key={a}>
                {short(a)}
                {STASH_GUARDIAN && a.toLowerCase() === STASH_GUARDIAN.toLowerCase() && <span className="font-sans text-muted"> (Stash)</span>}
              </p>
            ))}
          </dd>
        </div>
      </dl>
      {s.frozen ? (
        <div>
          <p className="text-xs text-muted">
            {s.unfreezeApprovedBy
              ? `Guardian ${short(s.unfreezeApprovedBy)} approved unfreezing.`
              : "To unfreeze, ask a guardian to approve it from their guardian link. This stops a thief with your login from undoing a freeze."}
          </p>
          <button className={`${btn} mt-2`} disabled={!!busy || !s.unfreezeApprovedBy} onClick={() => actions.unfreeze()}>
            Unfreeze
          </button>
        </div>
      ) : (
        <div>
          <HoldButton
            className="w-full rounded-xl border border-danger/40 px-4 py-3 text-sm font-semibold text-danger disabled:opacity-50"
            disabled={!!busy}
            onHold={() => actions.freeze()}
          >
            <SnowflakeIcon width={18} height={18} /> Hold to freeze my vault
          </HoldButton>
          <p className="mt-1 text-center text-xs text-muted">Emergency stop: nothing can leave until a guardian helps unfreeze.</p>
        </div>
      )}
    </section>
  );
}

function DrainLink({ vault }: { vault: string }) {
  // The sample vault isn't real: send visitors to the current network's demo vault instead.
  const { preview } = usePreview();
  return (
    <a href={preview ? "/drain" : `/drain?vault=${vault}`} className={`${card} block hover:border-accent`}>
      <p className="font-medium">What if someone Hacks this Wallet →</p>
      <p className="mt-1 text-sm text-muted">
        Watch a simulated thief try to drain your vault. Nothing is sent.
      </p>
    </a>
  );
}

function SaveCard({ ctx }: { ctx: Loaded }) {
  const { busy, actions } = ctx;
  const [amount, setAmount] = useState("");
  const t = ctx.state.balances[0];
  const room = ctx.state.depositRoomUsd;
  const overCap = room !== null && Number(amount || 0) > Number(formatUnits(room, 18));
  return (
    <section className={card}>
      <p className="font-medium">Save</p>
      <p className="mb-2 text-sm text-muted">
        Wallet balance: {usd(t.wallet, t.token.decimals)} {t.token.symbol}
        {room !== null && <> · beta limit: you can add {usd(room, 18)} more</>}
      </p>
      {HAS_TEST_FAUCET && (
        <button className="mb-2 text-xs underline" disabled={!!busy} onClick={() => actions.getTestDollars()}>
          Testnet: get free test dollars
        </button>
      )}
      <input
        className={input}
        inputMode="decimal"
        placeholder="Amount in $"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button
        className={`${btn} mt-2`}
        disabled={!!busy || !amount || overCap}
        onClick={() =>
          actions
            .deposit(t.token, parseUnits(amount, t.token.decimals))
            .then(() => setAmount(""))
        }
      >
        Save to vault
      </button>
      {overCap && (
        <p className="mt-1 text-xs text-warn">
          While Stash is unaudited, each vault holds at most a set amount. Thanks for testing with small sums.
        </p>
      )}
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
  // Biggest amount that still goes out instantly, rounded down to the cent.
  const maxInstant = Math.floor(Math.min(allowance, large - 0.01) * 100) / 100;
  return (
    <section className={card}>
      <p className="font-medium">Send</p>
      <input
        className={`${input} mt-2 text-2xl font-semibold`}
        inputMode="decimal"
        placeholder="$0.00"
        aria-label="Amount in dollars"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <input
        className={`${input} mt-2 font-mono text-sm`}
        placeholder="Recipient 0x…"
        value={to}
        onChange={(e) => setTo(e.target.value.trim())}
      />
      {amt > 0 &&
        (instant ? (
          <p className="mt-2 rounded-xl bg-accent/10 px-3 py-2 text-sm text-accent">
            Arrives instantly. Within today&apos;s limit ({usd(s.allowanceUsd, 18)} left).
          </p>
        ) : (
          <div className="mt-2 flex gap-2 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
            <HourglassIcon className="mt-0.5 shrink-0" width={18} height={18} />
            <p>
              Over your instant limit, so this waits {waitText(s.timelock)}. Your guardians get an alert and can stop it.
            </p>
          </div>
        ))}
      <button
        className={`${amt > 0 && !instant ? btnWarn : btn} mt-2 flex items-center justify-center gap-2`}
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
        {amt > 0 && !instant ? (
          <>
            <HourglassIcon width={18} height={18} /> Send in {waitText(s.timelock)}
          </>
        ) : (
          "Send now"
        )}
      </button>
      {amt > 0 && !instant && maxInstant >= 0.01 && (
        <button className={`${btnGhost} mt-2 w-full`} onClick={() => setAmount(String(maxInstant))}>
          Send {dollars(maxInstant)} now instead
        </button>
      )}
      <p className="mt-2 text-xs text-muted">Starting a {waitAdj(s.timelock)} wait sends nothing until it ends, and you can cancel any time.</p>
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
      <ul className="space-y-2">
        {pending.map((p) => {
          const ready = now > 0 && now >= p.unlockAt;
          return (
            <li
              key={p.id.toString()}
              className="flex items-center gap-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-sm"
            >
              <HourglassIcon className="shrink-0 text-warn" width={22} height={22} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {usd(p.amount, t.decimals)} →{" "}
                  <span className="font-mono">{short(p.to)}</span>
                </p>
                <p className="text-warn">
                  {ready
                    ? "Ready to release"
                    : now > 0
                      ? `Leaves in ${timeLeft(p.unlockAt - now)}`
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
      <div className="mb-3">
        <AlertsButton label="Get Telegram alerts for my vault" />
      </div>
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
  onCreate: (g: Address[], timelock: bigint) => Promise<unknown>;
  disabled: boolean;
}) {
  const [guardian, setGuardian] = useState("");
  const [hours, setHours] = useState(24);
  const guardians = [
    STASH_GUARDIAN,
    isAddress(guardian) ? getAddress(guardian) : undefined,
  ].filter(Boolean) as Address[];
  return (
    <section className={card}>
      <p className="font-medium">Create your vault</p>
      <p className="mt-1 text-sm text-muted">
        Send up to $100 a day instantly. Anything bigger waits, so you or your
        guardians can stop it. You need at least one guardian.
      </p>
      <WaitPicker hours={hours} onChange={setHours} />
      <HomeChainPicker />
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
        disabled={disabled || guardians.length === 0 || !validHours(hours)}
        onClick={() => onCreate(guardians, BigInt(hours) * 3600n)}
      >
        Create vault
      </button>
    </section>
  );
}

/** Account tab for people who signed in with their own wallet: the key was never with Stash. */
function OwnKeyCard({ owner }: { owner: string }) {
  return (
    <section className={card}>
      <p className="font-medium">Your key</p>
      <p className="mt-1 text-sm text-muted">
        You signed in with your own wallet (<span className="font-mono">{short(owner)}</span>), so the key that controls
        your vault lives in that wallet app. Stash never had it. Back it up the way your wallet app tells you (usually a
        seed phrase), and never share it.
      </p>
      <p className="mt-2 text-sm text-muted">
        If you think it leaked, use &quot;Move your vault to a new login&quot; below with one of your guardians.
      </p>
    </section>
  );
}

/** Account tab for signed-out visitors: what they get by signing up. */
function PreviewAccountCard() {
  const { signUp } = usePreview();
  return (
    <section className={card}>
      <p className="font-medium">Your account</p>
      <p className="mt-1 text-sm text-muted">
        Sign up with email or Google. You get a dollar account on Tempo, a Save pot on Base and a Growth pot on Solana,
        plus a recovery key only you can see, so your money is never stuck with us.
      </p>
      <button className={`${btn} mt-3`} onClick={signUp}>
        Sign up
      </button>
    </section>
  );
}

function Footer({ owner, onLogout, stacked }: { owner?: string; onLogout: () => void; stacked?: boolean }) {
  const { preview } = usePreview();
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
    <footer className={`flex pt-2 text-xs text-muted ${stacked ? "flex-col items-start gap-2" : "items-center justify-between"}`}>
      <button className="font-mono underline" onClick={copy} disabled={!owner} title={owner}>
        {owner ? (copied ? "Address copied ✓" : `${short(owner)} · copy address`) : ""}
      </button>
      <button className="underline" onClick={onLogout}>
        {preview && !owner ? "Sign up · Log in" : "Sign out"}
      </button>
    </footer>
  );
}

function GuardianLink({ vault }: { vault: string }) {
  const { preview, signUp } = usePreview();
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (preview) return signUp();
    const url = `${window.location.origin}/guardian?vault=${vault}&network=${MODE}&home=${HOME_CHAIN}`;
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

const MIN_HOURS = 24;
const MAX_HOURS = 30 * 24; // the contract's limits
const PRESETS = [24, 48, 72, 168];
const validHours = (h: number) => Number.isInteger(h) && h >= MIN_HOURS && h <= MAX_HOURS;

/** Waiting period for big withdrawals: presets, or any whole number of hours from 24 up to 30 days. */
function WaitPicker({ hours, onChange }: { hours: number; onChange: (h: number) => void }) {
  const [custom, setCustom] = useState(PRESETS.includes(hours) ? "" : String(hours));
  return (
    <div className="mt-3">
      <p className="text-sm font-medium">Waiting period for big withdrawals</p>
      <p className="text-xs text-muted">Longer gives you and your guardians more time to stop a thief. 24 hours minimum.</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {PRESETS.map((h) => (
          <button
            key={h}
            type="button"
            className={`${btnGhost} ${hours === h && !custom ? "border-accent bg-accent/10 text-accent" : ""}`}
            onClick={() => {
              setCustom("");
              onChange(h);
            }}
          >
            {waitText(h * 3600).replace(" hours", "h")}
          </button>
        ))}
      </div>
      <input
        className={`${input} mt-2 text-sm`}
        inputMode="numeric"
        placeholder="Or type hours (24–720)"
        value={custom}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "");
          setCustom(v);
          if (v) onChange(Number(v));
        }}
      />
      {custom && !validHours(Number(custom)) && (
        <p className="mt-1 text-xs text-warn">Choose between 24 and 720 hours (30 days).</p>
      )}
    </div>
  );
}

const MAX_DAILY_LIMIT = 1_000_000; // dollars; a sanity bound for the form, not a contract rule

/** Policy for a chosen daily limit and waiting period. Instant sends must stay under the large threshold,
 *  so a limit at or above it lifts the threshold just past the limit; otherwise the threshold stays. */
function rulesFor(limit: string, hours: number, s: Loaded["state"]) {
  let dailyLimit: bigint;
  try {
    dailyLimit = parseUnits(limit.trim(), 18);
  } catch {
    return null;
  }
  if (limit.trim() === "" || dailyLimit < 0n || dailyLimit > BigInt(MAX_DAILY_LIMIT) * 10n ** 18n || !validHours(hours)) return null;
  const largeThreshold = dailyLimit >= s.largeThresholdUsd ? dailyLimit + 10n ** 18n : s.largeThresholdUsd;
  return { timelock: BigInt(hours) * 3600n, dailyLimit, largeThreshold };
}

/**
 * The vault's rules: daily instant limit and waiting period. Anything that loosens them only takes effect
 * after the current waiting period (owner or any guardian can cancel); tightening applies at once.
 */
function RulesCard({ ctx }: { ctx: Loaded }) {
  const { state: s, busy, actions } = ctx;
  const current = Math.round(s.timelock / 3600);
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(current);
  const [limit, setLimit] = useState(formatUnits(s.dailyLimitUsd, 18));
  const now = useNow();
  const p = s.pendingPolicy;
  const ready = p !== null && now > 0 && now >= p.effectiveAt;

  const next = rulesFor(limit, hours, s);
  const changed =
    next !== null &&
    (next.dailyLimit !== s.dailyLimitUsd || next.timelock !== BigInt(s.timelock) || next.largeThreshold !== s.largeThresholdUsd);
  const immediate =
    next !== null &&
    next.dailyLimit <= s.dailyLimitUsd &&
    next.largeThreshold <= s.largeThresholdUsd &&
    next.timelock >= BigInt(s.timelock);
  const takesEffect = now > 0 ? new Date((now + s.timelock) * 1000).toLocaleString() : null;

  const startEditing = () => {
    setHours(current);
    setLimit(formatUnits(s.dailyLimitUsd, 18));
    setEditing(true);
  };

  return (
    <section className={card}>
      <p className="font-medium">Your rules</p>
      <p className="mt-1 text-sm text-muted">
        Instant up to {usd(s.dailyLimitUsd, 18)} a day. Bigger withdrawals wait {waitText(s.timelock)}.
      </p>

      {p ? (
        <div className="mt-3 rounded-xl bg-warn/10 p-3 text-sm">
          <p className="font-medium">Rules change waiting</p>
          <ul className="mt-1 space-y-0.5">
            {p.dailyLimitUsd !== s.dailyLimitUsd && (
              <li>
                Instant limit {usd(s.dailyLimitUsd, 18)} → {usd(p.dailyLimitUsd, 18)} a day
              </li>
            )}
            {p.timelock !== s.timelock && (
              <li>
                Waiting period {waitText(s.timelock)} → {waitText(p.timelock)}
              </li>
            )}
            {p.largeThresholdUsd !== s.largeThresholdUsd && (
              <li>Single instant send under {usd(p.largeThresholdUsd, 18)}</li>
            )}
          </ul>
          <p className="mt-1 text-muted">
            {ready
              ? "The wait is over. Apply it to switch the new rules on."
              : `Takes effect ${new Date(p.effectiveAt * 1000).toLocaleString()}. You or any guardian can cancel it before then.`}
          </p>
          <div className="mt-2 flex gap-2">
            {ready && (
              <button className={btnGhost} disabled={!!busy || s.frozen} onClick={() => actions.applyRules()}>
                Apply
              </button>
            )}
            <button className={`${btnGhost} text-danger`} disabled={!!busy} onClick={() => actions.cancelRules()}>
              Cancel change
            </button>
          </div>
        </div>
      ) : editing ? (
        <div className="mt-3">
          <label className="block text-sm font-medium" htmlFor="daily-limit">
            Instant limit per day
          </label>
          <p className="text-xs text-muted">What can leave without waiting. Lower is safer; $0 means every send waits.</p>
          <div className="relative mt-2">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">$</span>
            <input
              id="daily-limit"
              className={`${input} pl-7`}
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value.replace(",", "."))}
            />
          </div>
          {next === null && limit.trim() !== "" && (
            <p className="mt-1 text-xs text-warn">Enter an amount from $0 to ${MAX_DAILY_LIMIT.toLocaleString()}.</p>
          )}

          <WaitPicker hours={hours} onChange={setHours} />

          {changed && (
            <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${immediate ? "bg-accent/10" : "bg-warn/10"}`}>
              {immediate
                ? "These rules are stricter, so they apply right away."
                : `These rules loosen your protection, so they only take effect after your current ${waitText(s.timelock)} wait${
                    takesEffect ? ` (${takesEffect})` : ""
                  }. You and your guardians get an alert and can cancel it before then.`}
            </p>
          )}
          {!immediate && changed && s.frozen && (
            <p className="mt-1 text-xs text-warn">Your vault is frozen, so you can only make the rules stricter.</p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              className={`${btn} flex-1`}
              disabled={!!busy || !next || !changed || (!immediate && s.frozen)}
              onClick={() => next && actions.setRules(next).then((hash) => hash && setEditing(false))}
            >
              {immediate || !changed ? "Save rules" : `Request change (applies in ${waitText(s.timelock)})`}
            </button>
            <button className={btnGhost} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className={`${btnGhost} mt-3 w-full`} disabled={!!busy} onClick={startEditing}>
          Edit rules
        </button>
      )}
    </section>
  );
}

const HOME_CHAINS: { id: HomeChain; label: string; note: string }[] = [
  { id: "tempo", label: "Tempo", note: "Recommended. Fees are paid in dollars (a fraction of a cent)." },
  { id: "base", label: "Base", note: "Fees are paid in ETH, so your wallet needs a little ETH. Save and earn in the same vault." },
];

/** Where the main account lives. Each chain has its own vault; switching reloads the app. */
function HomeChainPicker() {
  return (
    <div className="mt-3">
      <p className="text-sm font-medium">Main account on</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {HOME_CHAINS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`${btnGhost} text-left ${HOME_CHAIN === c.id ? "border-accent bg-accent/10" : ""}`}
            onClick={() => c.id !== HOME_CHAIN && switchHome(c.id)}
          >
            <span className={`block font-semibold ${HOME_CHAIN === c.id ? "text-accent" : ""}`}>{c.label}</span>
            <span className="block text-xs font-normal text-muted">{c.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Account tab: choose the main account's chain (each chain keeps its own vault). */
function HomeChainCard() {
  return (
    <section className={card}>
      <p className="font-medium">Main account network</p>
      <p className="mt-1 text-sm text-muted">
        Your main account lives on one chain. Switching shows that chain&apos;s vault; your vault on the other chain
        stays where it is, with its own money and guardians.
      </p>
      <HomeChainPicker />
    </section>
  );
}

/** Earning on the Tempo main account isn't wired up yet: Morpho on Tempo is still very new. */
function TempoEarnSoon() {
  return (
    <section className={`${card} border-dashed`}>
      <div className="flex items-baseline justify-between">
        <p className="font-medium">Earn on your Tempo savings</p>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">Coming soon</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Your vault already supports earning. It will plug into Morpho on Tempo once those lending markets mature.
        Until then, your Tempo dollars aren&apos;t lent out, so a DeFi hack can&apos;t touch them.
      </p>
      <p className="mt-2 text-sm">Want to earn now?</p>
      <a href="#save-pot" className={`${btnGhost} mt-2 block text-center`}>
        Use the Save pot (Base)
      </a>
    </section>
  );
}
