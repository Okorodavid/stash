"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useCreateWallet, usePrivy } from "@privy-io/react-auth";
import {
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  type Address,
} from "viem";
import { HOME_CHAIN, HOME_IS_SAVE, MODE, STASH_GUARDIAN, TEMPO_EARN, askForMainnet, switchHome, type HomeChain } from "@/lib/config";
import { pct, useRates } from "@/lib/rates";
import { HAS_TEST_FAUCET } from "@/lib/chain";
import { sampleVaultState, useVault, type Pending } from "@/lib/useVault";
import { useNow } from "@/lib/useNow";
import { PreviewProvider, signUpInstead, usePreview } from "@/lib/preview";
import { NotifyProvider, StatusDock, useNotify } from "@/lib/notify";
import { useAddressBook, type AddressBook } from "@/lib/addressBook";
import RecoveryCard, { RecoverySettings } from "./Recovery";
import MoveVaultCard from "./MoveVault";
import DepositFromWallet from "./DepositFromWallet";
import AlertsButton from "./AlertsButton";
import SavePotCard from "./SavePot";
import PotInfo from "./PotInfo";
import HoldButton from "./HoldButton";
import Modal from "./Modal";
import TimeGlass from "./TimeGlass";
import AppSkeleton from "./AppSkeleton";
import { ArrowRightIcon, HomeIcon, HourglassIcon, JarIcon, PhoneIcon, PlusIcon, SendIcon, ShieldIcon, SnowflakeIcon, UserIcon } from "./Icons";
import { useSavePot } from "@/lib/useSavePot";
import dynamic from "next/dynamic";

// Solana code is heavy; load it after the vault screen is up.
const GrowthPotCard = dynamic(() => import("./GrowthPot"), {
  ssr: false,
  loading: () => <section className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">Loading Growth pot…</section>,
});
import { AutoSaveCard, GoalsCard } from "./Savings";

// Swap pulls in Relay and Solana code; load it only when Account is opened.
const SwapTab = dynamic(() => import("./Swap"), {
  ssr: false,
  loading: () => <section className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">Loading swaps…</section>,
});
import {
  btn,
  btnGhost,
  btnWarn,
  card,
  cardTitle,
  cleanAmount,
  dollars,
  input,
  short,
  textLink,
  timeLeft,
  tint,
  usd,
  waitText,
  when,
  type Loaded,
} from "./ui";

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
        <h1 className={cardTitle}>Vault contracts not deployed on {network.chain.name} yet.</h1>
        <p className="mt-1 text-sm text-muted">
          Set NEXT_PUBLIC_FACTORY_* in app/.env.local after running the deploy
          script.
        </p>
        <Footer owner={owner} onLogout={logout} />
      </div>
    );
  }
  if (!state) return <AppSkeleton />;

  return (
    <NotifyProvider>
      {state.vault ? <Vault ctx={{ ...ctx, state }} onLogout={logout} /> : <NoVaultYet ctx={{ ...ctx, state }} onLogout={logout} />}
    </NotifyProvider>
  );
}

/**
 * Signed in, no vault yet: show the whole app with a sample vault (their real wallet balance) instead
 * of a form. Creating the vault opens on demand: from the banner or from any action they try.
 */
function NoVaultYet({ ctx, onLogout }: { ctx: Loaded; onLogout: () => void }) {
  const [creating, setCreating] = useState(false);
  const notify = useNotify();
  const open = () => setCreating(true);
  const sample: Loaded = { ...ctx, state: sampleVaultState(ctx.state), actions: signUpInstead(ctx.actions, open) };
  return (
    <PreviewProvider signUp={open}>
      <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold">You&apos;re signed in. Create your vault to start saving.</p>
        <button className={`${btn} sm:w-auto sm:shrink-0 sm:px-5`} onClick={open}>
          Create vault
        </button>
      </section>
      <Vault ctx={sample} onLogout={onLogout} />
      {creating && (
      <Modal label="Create your vault" onClose={() => !ctx.busy && setCreating(false)}>
        <div className="space-y-3">
          {/* The page's status dock sits under the dialog's backdrop, so report progress here too.
              The dialog is transparent: each tinted box sits on a solid card so it stays readable. */}
          <div role="status" aria-live="polite">
            {ctx.busy && (
              <div className="rounded-xl bg-card">
                <p className={`rounded-xl px-3 py-2 text-sm ${tint.accent}`}>{ctx.busy}…</p>
              </div>
            )}
          </div>
          <div role="alert">
            {ctx.error && (
              <div className="rounded-xl bg-card">
                <p className={`rounded-xl px-3 py-2 text-sm ${tint.danger}`}>{ctx.error}</p>
              </div>
            )}
          </div>
          <CreateVault
            onCreate={(g, t, d) =>
              ctx.actions.createVault(g, t, d).then((hash) => {
                if (hash) notify("Your vault is ready. Small amounts move instantly; anything bigger waits, and your guardians can stop it.");
                return hash;
              })
            }
            disabled={!!ctx.busy}
          />
          <button className={`${btnGhost} w-full bg-card`} disabled={!!ctx.busy} onClick={() => setCreating(false)}>
            Not now
          </button>
        </div>
      </Modal>
      )}
    </PreviewProvider>
  );
}

type Tab = "home" | "pots" | "protect" | "account";
const TABS: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "pots", label: "Earn", Icon: JarIcon },
  { id: "protect", label: "Protect", Icon: ShieldIcon },
  { id: "account", label: "Account", Icon: UserIcon },
];
const TAB_HEADINGS: Record<Tab, string> = {
  home: "Home",
  pots: "Earn",
  protect: "Protection",
  account: "Account",
};

/**
 * Phone: one tab at a time with a bottom tab bar, and the protection status on Home. Desktop: sidebar,
 * the tab in the middle, and the protection summary always visible on the right. A tab mounts the first
 * time it is opened (heavy pots and swaps load only when wanted) and then stays mounted, so forms keep
 * their input when switching back and forth.
 */
function Vault({ ctx, onLogout }: { ctx: Loaded; onLogout: () => void }) {
  const { state: s } = ctx;
  const [tab, setTab] = useState<Tab>("home");
  const [opened, setOpened] = useState<Set<Tab>>(() => new Set<Tab>(["home"]));
  const panels = useRef<Partial<Record<Tab, HTMLHeadingElement | null>>>({});
  const pot = useSavePot();
  const book = useAddressBook(s.vault);
  const [growthUsd, setGrowthUsd] = useState<number | null>(null);
  // Money earning on Tempo is still in the main account (as Morpho shares), so it counts here.
  const mainUsd =
    s.balances.reduce((sum, b) => sum + Number(formatUnits(b.total, b.token.decimals)), 0) +
    (s.earn ? Number(formatUnits(s.earn.earning, s.balances[0].token.decimals)) : 0);
  // With Base as home, the main account already is the vault's idle USDC: only the earning part is extra.
  const saveUsd = pot.state
    ? Number(formatUnits(HOME_IS_SAVE ? pot.state.earning : pot.state.idle + pot.state.earning, pot.usdc.decimals))
    : 0;
  // "Your savings" counts only money behind the vault's limits and guardians; Growth is shown apart.
  const protectedUsd = mainUsd + saveUsd;
  const [action, setAction] = useState<"add" | "send" | null>(null);
  const show = (t: Tab) => {
    setTab(t);
    setOpened((o) => (o.has(t) ? o : new Set(o).add(t)));
    window.scrollTo({ top: 0 });
    // Move focus to the new panel's heading so keyboard and screen-reader users land in it.
    setTimeout(() => panels.current[t]?.focus({ preventScroll: true }), 0);
  };
  const heading = (t: Tab) => (
    <h2 ref={(el) => void (panels.current[t] = el)} tabIndex={-1} className="sr-only">
      {TAB_HEADINGS[t]}
    </h2>
  );

  return (
    <div className="lg:grid lg:grid-cols-[168px_minmax(0,1fr)_300px] lg:items-start lg:gap-8">
      <h1 className="sr-only">Your Stash</h1>
      <nav className="sticky top-6 hidden flex-col gap-1 lg:flex" aria-label="Sections">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => show(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
              tab === id ? "bg-accent/10 text-accent-ink" : "text-muted hover:bg-panel hover:text-foreground"
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

      <div className="min-w-0 space-y-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div hidden={tab !== "home"} className="space-y-4">
          {heading("home")}
          <Hero ctx={ctx} protectedUsd={protectedUsd} mainUsd={mainUsd} growthUsd={growthUsd} />
          <div className="lg:hidden">
            <StatusStrip ctx={ctx} onOpen={() => show("protect")} />
          </div>
          {HOME_IS_SAVE && ctx.owner && pot.state?.walletGas === 0n && (
            <p className={`rounded-xl px-3 py-2 text-sm ${tint.warn}`}>
              Your main account is on Base, where network fees are paid in ETH. Send a little ETH on Base to{" "}
              <span className="font-mono">{short(ctx.owner)}</span> before saving or sending.
            </p>
          )}
          {s.pending.length > 0 && <PendingCard ctx={ctx} book={book} />}
          {ctx.owner && ctx.embedded && <RecoveryCard owner={ctx.owner} />}
          <ActionBar
            open={action}
            onToggle={(a) => setAction((cur) => (cur === a ? null : a))}
            empty={mainUsd === 0}
          />
          <div id="home-action" className="space-y-4">
            {action === "add" && (
              <>
                <SaveCard ctx={ctx} onDone={() => setAction(null)} />
                {/* People who signed in with their own wallet already save from it with the Save card. */}
                {(!ctx.owner || ctx.embedded) && <DepositFromWallet ctx={ctx} />}
              </>
            )}
            {action === "send" && <SendCard ctx={ctx} book={book} onDone={() => setAction(null)} />}
          </div>
        </div>

        {opened.has("pots") && (
          <div hidden={tab !== "pots"} className="space-y-4">
            {heading("pots")}
            <Jars main={mainUsd} save={pot.enabled ? saveUsd : null} saveChain={pot.enabled ? pot.network.chain.name : ""} growth={growthUsd} />
            <GoalsCard ctx={ctx} />
            {HOME_CHAIN === "tempo" && <TempoEarnCard ctx={ctx} />}
            <div id="save-pot" className="scroll-mt-6">
              <SavePotCard home={ctx} pot={pot} />
            </div>
            <div id="growth-pot" className="scroll-mt-6">
              <GrowthPotCard otherSavingsUsd={mainUsd + saveUsd} onValueUsd={setGrowthUsd} />
            </div>
            <AutoSaveCard ctx={ctx} />
          </div>
        )}

        {opened.has("protect") && (
          <div hidden={tab !== "protect"} className="space-y-4">
            {heading("protect")}
            <div className="lg:hidden">
              <ProtectSummary ctx={ctx} book={book} />
            </div>
            <GuardiansCard ctx={ctx} book={book} />
            <RulesCard ctx={ctx} />
            <DrainLink vault={s.vault!} />
          </div>
        )}

        {opened.has("account") && (
          <div hidden={tab !== "account"} className="space-y-4">
            {heading("account")}
            {!ctx.owner && <PreviewAccountCard />}
            <SwapTab embedded />
            {ctx.owner && (ctx.embedded ? <RecoverySettings owner={ctx.owner} /> : <OwnKeyCard owner={ctx.owner} />)}
            <MoveVaultCard ctx={ctx} />
            <HomeChainCard />
          </div>
        )}

        <div className="lg:hidden">
          <Footer owner={ctx.owner} onLogout={onLogout} />
        </div>
      </div>

      <aside className="sticky top-6 hidden lg:block" aria-label="Protection">
        <ProtectSummary ctx={ctx} book={book} />
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Sections"
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => show(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs ${
              tab === id
                ? "font-semibold text-accent before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-full before:bg-accent"
                : "font-medium text-muted"
            }`}
          >
            <Icon width={22} height={22} />
            {label}
          </button>
        ))}
      </nav>

      <StatusDock busy={ctx.busy} error={ctx.error} />
    </div>
  );
}

/** The instant-send allowance: what's left, when it's full again, and that it refills by the hour. */
function useAllowance(s: Loaded["state"]) {
  const now = useNow(60_000);
  const allowance = Number(formatUnits(s.allowanceUsd, 18));
  const limit = Number(formatUnits(s.dailyLimitUsd, 18));
  const held = s.balances.reduce((sum, b) => sum + Number(formatUnits(b.available, b.token.decimals)), 0);
  // What can actually leave right now: the limit's remaining room, but never more than the vault holds.
  const sendable = s.frozen ? 0 : Math.min(allowance, held);
  const frac = limit <= 0 ? 0 : Math.min(1, sendable / limit);
  // The contract refills the allowance continuously at the daily limit per 24 hours.
  const secondsToFull = limit > 0 ? ((limit - allowance) / limit) * 86_400 : 0;
  const fullAt = now > 0 && secondsToFull > 60 ? now + secondsToFull : null;
  return { allowance, limit, sendable, held, frac, perHour: limit / 24, fullAt, now };
}

/**
 * Protected savings, with the instant-send allowance as a ring that refills through the day. The ring
 * shows what can leave right now, so it never suggests money the vault doesn't hold.
 */
function Hero({
  ctx,
  protectedUsd,
  mainUsd,
  growthUsd,
}: {
  ctx: Loaded;
  protectedUsd: number;
  mainUsd: number;
  growthUsd: number | null;
}) {
  const s = ctx.state;
  const a = useAllowance(s);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const empty = a.held === 0;
  const label = s.frozen
    ? "Instant sends: none while frozen"
    : `You can send ${dollars(a.sendable)} instantly right now. Daily limit ${dollars(a.limit)}.`;
  return (
    <section className={card} aria-labelledby="hero-total">
      <div className="flex items-center gap-5">
        <div
          className="relative size-28 shrink-0"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={a.limit}
          aria-valuenow={a.sendable}
          aria-valuetext={label}
        >
          <svg viewBox="0 0 120 120" className="size-28 -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
            {!s.frozen && a.frac > 0 && (
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${a.frac * circ} ${circ}`}
                className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-700"
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
            {s.frozen ? (
              <SnowflakeIcon width={26} height={26} className="text-danger" />
            ) : (
              <>
                <span className="text-lg font-semibold leading-tight">{dollars(a.sendable)}</span>
                <span className="text-xs text-muted">send now</span>
              </>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted">Protected savings</p>
          <p id="hero-total" className="text-[clamp(1.75rem,8vw,2.5rem)] leading-tight font-semibold tracking-tight">
            {dollars(protectedUsd)}
          </p>
          <p className="mt-1 text-sm text-muted">Main account {dollars(mainUsd)}</p>
          {/* Where the main account lives, switchable right here (each network keeps its own vault; the app reloads). */}
          <div className="mt-2 inline-flex rounded-full border border-line-strong p-0.5" role="group" aria-label="Main account network">
            {HOME_CHAINS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={HOME_CHAIN === c.id}
                title={c.note}
                onClick={() => c.id !== HOME_CHAIN && switchHome(c.id)}
                // The pill is small; an invisible pad gives it a 44px tall tap area.
                className={`relative rounded-full px-3 py-1.5 text-xs font-semibold after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] ${
                  HOME_CHAIN === c.id ? "bg-accent/15 text-accent-ink" : "text-muted hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {growthUsd !== null && growthUsd > 0 && (
            <p className="mt-1 text-sm text-growth">+ {dollars(growthUsd)} in Growth (no limits or guardians)</p>
          )}
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-3 text-sm">
        {s.frozen ? (
          <p className="font-medium text-danger">Frozen: nothing can leave until a guardian approves unfreezing.</p>
        ) : empty ? (
          <p>
            <span className="font-medium">Your vault is empty.</span>{" "}
            <span className="text-muted">
              Add dollars to start. Then up to {dollars(a.limit)} a day can leave instantly; anything bigger waits{" "}
              {waitText(s.timelock)}.
            </span>
          </p>
        ) : (
          <p>
            <span className="font-medium">Send instantly now: {dollars(a.sendable)}.</span>{" "}
            <span className="text-muted">
              Your {dollars(a.limit)} daily limit refills {dollars(a.perHour)} an hour
              {a.fullAt ? ` (full again ${when(a.fullAt, a.now)})` : ""}. Bigger amounts wait {waitText(s.timelock)}.
            </span>
          </p>
        )}
      </div>
      <PotInfo pot="vault" />
    </section>
  );
}

/**
 * Home's two money actions. Each opens its form right below, one at a time, so Home stays a single focus
 * instead of a stack of forms. With an empty vault, adding money is the obvious first step.
 */
function ActionBar({
  open,
  onToggle,
  empty,
}: {
  open: "add" | "send" | null;
  onToggle: (a: "add" | "send") => void;
  empty: boolean;
}) {
  const pressed = (a: "add" | "send") => (open === a ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : "");
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        className={`${btn} flex items-center justify-center gap-2 ${pressed("add")}`}
        aria-expanded={open === "add"}
        aria-controls="home-action"
        onClick={() => onToggle("add")}
      >
        <PlusIcon width={18} height={18} /> Add money
      </button>
      <button
        className={`${empty ? `${btnGhost} w-full` : btn} flex items-center justify-center gap-2 ${pressed("send")}`}
        aria-expanded={open === "send"}
        aria-controls="home-action"
        onClick={() => onToggle("send")}
      >
        <SendIcon width={18} height={18} /> Send
      </button>
    </div>
  );
}

/** Phone Home: one line of protection status that always offers the emergency stop. */
function StatusStrip({ ctx, onOpen }: { ctx: Loaded; onOpen: () => void }) {
  const { state: s, busy, actions } = ctx;
  const notify = useNotify();
  const st = protectionStatus(s);
  return (
    <section className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-3 py-2 ${st.border} ${st.tint}`} aria-label="Protection status">
      <button className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm" onClick={onOpen}>
        <st.Icon width={20} height={20} className="shrink-0" />
        <span className="min-w-0">
          <span className="block font-semibold">{st.title}</span>
          <span className="block truncate text-xs">{st.short}</span>
        </span>
      </button>
      {!s.frozen && (
        <HoldButton
          className="min-h-11 shrink-0 rounded-xl border border-danger/60 bg-card px-3 text-sm font-semibold text-danger disabled:opacity-50"
          disabled={!!busy}
          onHold={() => actions.freeze().then((h) => h && notify(FROZEN_RECEIPT, "danger"))}
        >
          <SnowflakeIcon width={16} height={16} /> Freeze
        </HoldButton>
      )}
    </section>
  );
}

const FROZEN_RECEIPT =
  "Vault frozen. Nothing can leave. If your key leaked, ask a guardian to help move your vault to a new login (Account tab). To unfreeze, a guardian must approve.";

function protectionStatus(s: Loaded["state"]) {
  const waiting = s.pending.length;
  if (s.frozen)
    return {
      Icon: SnowflakeIcon,
      title: "Frozen",
      short: "Nothing can leave",
      body: "Nothing can leave until a guardian approves unfreezing.",
      tint: tint.danger,
      border: "border-danger/40",
    };
  if (waiting > 0)
    return {
      Icon: HourglassIcon,
      title: `${waiting} withdrawal${waiting > 1 ? "s" : ""} waiting`,
      short: "Not you? Freeze now.",
      body: "Check it's you. If not, cancel it or freeze your vault.",
      tint: tint.warn,
      border: "border-warn/40",
    };
  return {
    Icon: ShieldIcon,
    title: "Protected",
    short: `Worst case: ${usd(s.dailyLimitUsd, 18)} a day`,
    body: `A stolen key can move at most ${usd(s.dailyLimitUsd, 18)} a day instantly. Anything more waits ${waitText(s.timelock)}, and your guardians can stop it.`,
    tint: tint.accent,
    border: "border-accent/30",
  };
}

/** Each pot as a jar filled to its share of all savings; tapping a jar opens that pot. */
function Jars({ main, save, saveChain, growth }: { main: number; save: number | null; saveChain: string; growth: number | null }) {
  const total = main + (save ?? 0) + (growth ?? 0);
  const share = (v: number) => (total > 0 && v > 0 ? Math.min(0.9, Math.max(0.08, v / total)) : 0);
  const rates = useRates();
  const tempoHome = HOME_CHAIN === "tempo";
  return (
    <section className={card}>
      <h3 className={cardTitle}>Where your money is</h3>
      <p className="text-sm text-muted">
        Each jar fills with its share of your savings.
        {MODE !== "mainnet" && " Rates are live mainnet rates; test dollars don't earn."}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Jar
          label="Main"
          value={dollars(main)}
          sub={tempoHome ? "Earning · Tempo" : "Protected · instant"}
          rate={tempoHome ? rates.tempo : false}
          fill={share(main)}
          color="var(--accent)"
        />
        {save !== null && (
          <Jar label="Save" value={dollars(save)} sub={`Earning · ${saveChain}`} rate={rates.save} fill={share(save)} color="var(--save)" href="#save-pot" />
        )}
        <Jar
          label="Growth"
          value={growth === null ? "…" : dollars(growth)}
          sub="Earning · Solana"
          rate={rates.growth}
          fill={share(growth ?? 0)}
          color="var(--growth)"
          href="#growth-pot"
        />
      </div>
    </section>
  );
}

const JAR_PATH = "M14 14Q8 20 8 34V66Q8 74 16 74H48Q56 74 56 66V34Q56 20 50 14Z";

/** `rate`: yearly rate in basis points; undefined while loading, null if unavailable, false if this jar doesn't earn. */
function Jar({
  label,
  value,
  sub,
  rate,
  fill,
  color,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  rate: number | null | undefined | false;
  fill: number;
  color: string;
  href?: string;
}) {
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
        <rect
          x="0"
          y={top}
          width="64"
          height={80 - top}
          fill={color}
          opacity="0.85"
          clipPath={`url(#${clip})`}
          className="motion-safe:transition-[y,height] motion-safe:duration-700"
        />
        <path d={JAR_PATH} fill="none" stroke={color} strokeWidth="3" />
      </svg>
      <p className="mt-1 text-sm font-medium">{label}</p>
      <p className="truncate text-base font-semibold">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
      {(rate === undefined || typeof rate === "number") && (
        <p className={`mx-auto mt-1 w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${tint.accent}`}>
          {rate === undefined ? "…" : `${pct(rate)} a year`}
        </p>
      )}
    </>
  );
  const rateText = typeof rate === "number" ? `, earning ${pct(rate)} a year` : "";
  return href ? (
    <a href={href} className="rounded-xl p-1 hover:bg-panel" aria-label={`${label} pot: ${value}. ${sub}${rateText}. Open`}>
      {body}
    </a>
  ) : (
    <div className="p-1">{body}</div>
  );
}

/** Safety status: worst case, rules, guardians, and the emergency stop. Always visible on desktop. */
function ProtectSummary({ ctx, book }: { ctx: Loaded; book: AddressBook }) {
  const { state: s, busy, actions } = ctx;
  const notify = useNotify();
  const st = protectionStatus(s);
  return (
    <section className={`${card} space-y-4`}>
      <div className={`rounded-xl px-3 py-2.5 ${st.tint}`}>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <st.Icon width={18} height={18} />
          {st.title}
        </h3>
        <p className="mt-0.5 text-xs">{st.body}</p>
      </div>
      <dl className="divide-y divide-line text-sm">
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-muted">Instant limit</dt>
          <dd>{usd(s.dailyLimitUsd, 18)} / day</dd>
        </div>
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-muted">Bigger withdrawals wait</dt>
          <dd>{waitText(s.timelock)}</dd>
        </div>
        <div className="py-2">
          <dt className="text-muted">Guardians ({s.guardians.length}/3)</dt>
          <dd className="mt-1 space-y-1">
            {s.guardians.map((a) => (
              <GuardianName key={a} address={a} book={book} />
            ))}
          </dd>
        </div>
      </dl>
      {s.frozen ? (
        <div>
          <p className="text-xs text-muted">
            {s.unfreezeApprovedBy
              ? `${book.nameOf(s.unfreezeApprovedBy) ?? `Guardian ${short(s.unfreezeApprovedBy)}`} approved unfreezing.`
              : "To unfreeze, ask a guardian to approve it from their guardian link. This stops a thief with your key from undoing a freeze."}
          </p>
          <button
            className={`${btn} mt-2`}
            disabled={!!busy || !s.unfreezeApprovedBy}
            onClick={() => actions.unfreeze().then((h) => h && notify("Unfrozen. Your daily limit and waiting period protect your money again."))}
          >
            Unfreeze
          </button>
        </div>
      ) : (
        <div>
          <HoldButton
            className="min-h-11 w-full rounded-xl border border-danger/60 px-4 py-3 text-sm font-semibold text-danger disabled:opacity-50"
            disabled={!!busy}
            onHold={() => actions.freeze().then((h) => h && notify(FROZEN_RECEIPT, "danger"))}
          >
            <SnowflakeIcon width={18} height={18} /> Hold to freeze my vault
          </HoldButton>
          <p className="mt-1 text-center text-xs text-muted">Emergency stop: nothing can leave until a guardian helps unfreeze.</p>
        </div>
      )}
    </section>
  );
}

function isStash(a: string) {
  return !!STASH_GUARDIAN && a.toLowerCase() === STASH_GUARDIAN.toLowerCase();
}

/** A guardian as a person: their name (or "Stash"), a type icon, and the short address underneath. */
function GuardianName({ address, book }: { address: string; book: AddressBook }) {
  const name = isStash(address) ? "Stash" : book.nameOf(address);
  const Icon = isStash(address) ? ShieldIcon : name?.toLowerCase().includes("phone") ? PhoneIcon : UserIcon;
  return (
    <p className="flex items-center gap-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-panel text-muted" aria-hidden="true">
        <Icon width={15} height={15} />
      </span>
      <span className="min-w-0">
        <span className="block truncate">{name ?? "Unnamed guardian"}</span>
        <span className="block font-mono text-xs text-muted">{short(address)}</span>
      </span>
    </p>
  );
}

function DrainLink({ vault }: { vault: string }) {
  // The sample vault isn't real: send visitors to the current network's demo vault instead.
  const { preview } = usePreview();
  return (
    <a href={preview ? "/drain" : `/drain?vault=${vault}`} className={`${card} flex items-center gap-3 hover:border-accent`}>
      <span className="flex-1">
        <span className="block font-semibold">What if someone stole your key?</span>
        <span className="mt-1 block text-sm text-muted">Watch a simulated thief try to drain your vault. Nothing is sent.</span>
      </span>
      <ArrowRightIcon className="shrink-0 text-muted" />
    </a>
  );
}

function SaveCard({ ctx, onDone }: { ctx: Loaded; onDone?: () => void }) {
  const { busy, actions } = ctx;
  const notify = useNotify();
  const id = useId();
  const [amount, setAmount] = useState("");
  const t = ctx.state.balances[0];
  const room = ctx.state.depositRoomUsd;
  const amt = Number(amount || 0);
  const overCap = room !== null && amt > Number(formatUnits(room, 18));
  const wallet = Number(formatUnits(t.wallet, t.token.decimals));
  // On Tempo, pathUSD both gets saved and pays network fees: leave a few cents in the wallet.
  const feeToken = t.token.symbol === "pathUSD";
  const leavesNoFees = feeToken && amt > 0 && wallet - amt < 0.1;
  return (
    <section className={card} aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className={cardTitle}>
        Save
      </h3>
      <p className="mb-2 text-sm text-muted">
        Move dollars from your wallet into your vault, where limits and guardians protect them. In your wallet now:{" "}
        {usd(t.wallet, t.token.decimals)}
        {room !== null && <> · you can add {usd(room, 18)} more during the beta</>}
      </p>
      {HAS_TEST_FAUCET && (
        <button className={`${textLink} text-xs text-muted`} disabled={!!busy} onClick={() => actions.getTestDollars()}>
          Testnet: get free test dollars
        </button>
      )}
      <label htmlFor={`${id}-a`} className="sr-only">
        Amount to save, in dollars
      </label>
      <input
        id={`${id}-a`}
        className={input}
        inputMode="decimal"
        placeholder="$0.00"
        value={amount}
        onChange={(e) => setAmount(cleanAmount(e.target.value))}
      />
      <button
        className={`${btn} mt-2`}
        disabled={!!busy || !amt || overCap}
        onClick={() =>
          actions.deposit(t.token, parseUnits(amount, t.token.decimals)).then((hash) => {
            if (!hash) return;
            notify(`Saved ${dollars(amt)}. It's now behind your daily limit and guardians.`);
            setAmount("");
            onDone?.();
          })
        }
      >
        Save to vault
      </button>
      {overCap && (
        <p className="mt-1 text-xs text-warn-ink">
          While Stash is unaudited, each vault holds at most a set amount. Thanks for testing with small sums.
        </p>
      )}
      {leavesNoFees && (
        <p className="mt-1 text-xs text-warn-ink">Keep about $0.10 in your wallet: on Tempo it also pays the small network fees.</p>
      )}
    </section>
  );
}

function SendCard({ ctx, book, onDone }: { ctx: Loaded; book: AddressBook; onDone?: () => void }) {
  const { state: s, busy, actions } = ctx;
  const notify = useNotify();
  const id = useId();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  // pathUSD is the default; offer a token picker only when the vault holds more than one (e.g. older OUSD).
  const held = s.balances.filter((b, i) => i === 0 || b.available > 0n);
  const [pick, setPick] = useState(0);
  const chosen = held[pick] ?? held[0];
  const t = chosen.token;
  const amt = Number(amount || 0);
  const available = Number(formatUnits(chosen.available, t.decimals));
  const allowance = Number(formatUnits(s.allowanceUsd, 18));
  const large = Number(formatUnits(s.largeThresholdUsd, 18));
  const instant = amt > 0 && amt <= allowance && amt < large;
  const addressOk = isAddress(to);
  const valid = addressOk && amt > 0 && amt <= available;
  // Biggest amount that still goes out instantly, rounded down to the cent.
  const maxInstant = Math.floor(Math.min(allowance, large - 0.01, available) * 100) / 100;
  const firstTime = addressOk && !book.sentBefore(to) && !s.guardians.some((g) => g.toLowerCase() === to.toLowerCase());

  const submit = () => {
    const value = parseUnits(amount, t.decimals);
    const dest = getAddress(to) as Address;
    const sent = amt;
    (instant ? actions.withdraw(t, dest, value) : actions.requestWithdrawal(t, dest, value)).then((hash) => {
      if (!hash) return;
      book.rememberSent(dest);
      if (instant) {
        notify(`Sent ${dollars(sent)} to ${short(dest)}. ${dollars(Math.max(0, allowance - sent))} left to send instantly today.`);
      } else {
        const at = Date.now() / 1000 + s.timelock;
        notify(
          `${dollars(sent)} to ${short(dest)} leaves ${when(at)}. Until then you or your guardians can cancel it.`,
          "wait",
        );
      }
      setTo("");
      setAmount("");
      onDone?.();
    });
  };

  return (
    <section className={card} aria-labelledby={`${id}-t`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${id}-t`} className={cardTitle}>
          Send
        </h3>
        {held.length > 1 && (
          <select
            className="min-h-11 rounded-xl border border-line-strong bg-background px-3 text-sm"
            value={pick}
            onChange={(e) => setPick(Number(e.target.value))}
            aria-label="Dollars to send from"
          >
            {held.map((b, i) => (
              <option key={b.token.address} value={i}>
                {b.token.symbol} · {usd(b.available, b.token.decimals)}
              </option>
            ))}
          </select>
        )}
      </div>
      <label htmlFor={`${id}-a`} className="mt-2 block text-sm text-muted">
        Amount
      </label>
      <div className="relative mt-1">
        <input
          id={`${id}-a`}
          className={`${input} pr-20 text-2xl font-semibold`}
          inputMode="decimal"
          placeholder="$0.00"
          value={amount}
          onChange={(e) => setAmount(cleanAmount(e.target.value))}
        />
        {available > 0 && (
          <button
            type="button"
            className="absolute top-1/2 right-1.5 min-h-11 -translate-y-1/2 rounded-lg px-3 text-sm font-semibold text-accent-ink hover:bg-panel"
            onClick={() => setAmount(String(Math.floor(available * 100) / 100))}
          >
            Max
          </button>
        )}
      </div>
      <label htmlFor={`${id}-to`} className="mt-3 block text-sm text-muted">
        To
      </label>
      <input
        id={`${id}-to`}
        className={`${input} mt-1 font-mono text-sm`}
        placeholder="0x…"
        autoComplete="off"
        spellCheck={false}
        value={to}
        aria-invalid={to !== "" && !addressOk}
        aria-describedby={`${id}-to-hint`}
        onChange={(e) => setTo(e.target.value.trim())}
      />
      <p id={`${id}-to-hint`} className="mt-1 text-xs">
        {to !== "" && !addressOk ? (
          <span className="text-danger-ink">That isn&apos;t a complete address. It starts with 0x and has 42 characters.</span>
        ) : firstTime ? (
          <span className="text-warn-ink">First time sending here. Check the address with the person before you send.</span>
        ) : null}
      </p>
      {amt > available && <p className="mt-1 text-xs text-danger-ink">That&apos;s more than your vault holds ({dollars(available)}).</p>}
      {amt > 0 &&
        amt <= available &&
        (instant ? (
          <p className={`mt-2 rounded-xl px-3 py-2 text-sm ${tint.accent}`}>
            Arrives instantly. Within today&apos;s limit ({usd(s.allowanceUsd, 18)} left).
          </p>
        ) : (
          <div className={`mt-2 flex gap-2 rounded-xl px-3 py-2 text-sm ${tint.warn}`}>
            <HourglassIcon className="mt-0.5 shrink-0" width={18} height={18} />
            <p>
              Over your instant limit, so this waits {waitText(s.timelock)}. Your guardians can see it and stop it until then.
            </p>
          </div>
        ))}
      <button
        className={`${amt > 0 && !instant ? btnWarn : btn} mt-2 flex items-center justify-center gap-2`}
        disabled={!!busy || !valid || s.frozen}
        onClick={submit}
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
      {s.frozen && <p className="mt-2 text-xs text-danger-ink">Your vault is frozen, so nothing can be sent.</p>}
    </section>
  );
}

/** Withdrawals waiting out the timelock, each drawn as an hourglass running down. */
function PendingCard({ ctx, book }: { ctx: Loaded; book: AddressBook }) {
  const { state, busy, actions } = ctx;
  const notify = useNotify();
  const pending: Pending[] = state.pending;
  const now = useNow();
  const t = state.balances[0].token;
  return (
    <section className={card}>
      <h3 className={cardTitle}>Waiting to leave</h3>
      <p className="mb-3 text-sm text-muted">Not you? Cancel it, then freeze your vault.</p>
      <ul className="space-y-2">
        {pending.map((p) => {
          const ready = now > 0 && now >= p.unlockAt;
          const elapsed = now > 0 ? 1 - (p.unlockAt - now) / state.timelock : 0;
          const name = book.nameOf(p.to);
          return (
            <li key={p.id.toString()} className="flex items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-3 text-sm">
              <span className="text-warn">
                <TimeGlass elapsed={ready ? 1 : elapsed} size={46} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {usd(p.amount, t.decimals)} to {name ?? <span className="font-mono whitespace-nowrap">{short(p.to)}</span>}
                </p>
                <p className="text-warn-ink">
                  {ready
                    ? "The wait is over: release it to send"
                    : now > 0
                      ? `Leaves in ${timeLeft(p.unlockAt - now)} · can be stopped until ${when(p.unlockAt, now)}`
                      : `Leaves ${when(p.unlockAt)}`}
                </p>
                {p.guardianApproved && <p className="text-xs text-muted">A guardian marked it as reviewed</p>}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {ready && (
                  <button
                    className={btnGhost}
                    disabled={!!busy || state.frozen}
                    aria-label={`Release ${usd(p.amount, t.decimals)}`}
                    onClick={() => actions.executeWithdrawal(p.id).then((h) => h && notify(`Released ${usd(p.amount, t.decimals)}.`))}
                  >
                    Release
                  </button>
                )}
                <button
                  className={`${btnGhost} text-danger-ink`}
                  disabled={!!busy}
                  aria-label={`Cancel ${usd(p.amount, t.decimals)} withdrawal`}
                  onClick={() =>
                    actions.cancelWithdrawal(p.id).then((h) => h && notify(`Cancelled. ${usd(p.amount, t.decimals)} stays in your vault.`))
                  }
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

function GuardiansCard({ ctx, book }: { ctx: Loaded; book: AddressBook }) {
  const { busy, actions } = ctx;
  const notify = useNotify();
  const id = useId();
  const guardians: Address[] = ctx.state.guardians;
  const [g, setG] = useState("");
  const [label, setLabel] = useState("");
  return (
    <section className={card}>
      <h3 className={cardTitle}>Guardians ({guardians.length}/3)</h3>
      <p className="mb-3 text-sm text-muted">Any guardian can stop a withdrawal or freeze your vault. None can take your money.</p>
      <ul className="mb-3 space-y-2">
        {guardians.map((a) => (
          <GuardianRow key={a} address={a} book={book} />
        ))}
      </ul>
      <GuardianLink vault={ctx.state.vault!} />
      <div className="mb-3">
        <AlertsButton label="Get Telegram alerts for my vault" />
      </div>
      {guardians.length < 3 && (
        <div className="rounded-xl border border-line p-3">
          <h4 className="text-sm font-semibold">Add a guardian</h4>
          <label htmlFor={`${id}-n`} className="mt-2 block text-xs text-muted">
            Who is it?
          </label>
          <input
            id={`${id}-n`}
            className={`${input} mt-1 text-sm`}
            placeholder="Mum, or My second phone"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <label htmlFor={`${id}-a`} className="mt-2 block text-xs text-muted">
            Their address
          </label>
          <input
            id={`${id}-a`}
            className={`${input} mt-1 font-mono text-sm`}
            placeholder="0x…"
            spellCheck={false}
            value={g}
            onChange={(e) => setG(e.target.value.trim())}
          />
          <button
            className={`${btnGhost} mt-2 w-full`}
            disabled={!!busy || !isAddress(g)}
            onClick={() =>
              actions.addGuardian(getAddress(g)).then((hash) => {
                if (!hash) return;
                if (label.trim()) book.setName(g, label);
                notify(`${label.trim() || "Guardian"} added. They can stop withdrawals and freeze your vault, never take money.`);
                setG("");
                setLabel("");
              })
            }
          >
            Add guardian
          </button>
          <GuardianIndependenceNote />
        </div>
      )}
    </section>
  );
}

/** One guardian with an editable name (kept in this browser). */
function GuardianRow({ address, book }: { address: string; book: AddressBook }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const id = useId();
  if (isStash(address)) {
    return (
      <li className="flex min-h-11 items-center justify-between gap-2">
        <GuardianName address={address} book={book} />
        <span className="text-xs text-muted">Always independent</span>
      </li>
    );
  }
  return (
    <li className="flex min-h-11 items-center justify-between gap-2">
      {editing ? (
        <form
          className="flex w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            book.setName(address, name);
            setEditing(false);
          }}
        >
          <label htmlFor={id} className="sr-only">
            Name for {short(address)}
          </label>
          <input id={id} autoFocus className={`${input} text-sm`} value={name} placeholder="Mum" onChange={(e) => setName(e.target.value)} />
          <button className={btnGhost}>Save</button>
        </form>
      ) : (
        <>
          <GuardianName address={address} book={book} />
          <button
            className={`${btnGhost} shrink-0`}
            onClick={() => {
              setName(book.nameOf(address) ?? "");
              setEditing(true);
            }}
          >
            {book.nameOf(address) ? "Rename" : "Name"}
          </button>
        </>
      )}
    </li>
  );
}

function CreateVault({
  onCreate,
  disabled,
}: {
  onCreate: (g: Address[], timelock: bigint, dailyLimit: bigint) => Promise<unknown>;
  disabled: boolean;
}) {
  const id = useId();
  const [guardian, setGuardian] = useState("");
  const [hours, setHours] = useState(24);
  const [limit, setLimit] = useState("100");
  const dailyLimit = parseLimit(limit);
  const guardians = [
    STASH_GUARDIAN,
    isAddress(guardian) ? getAddress(guardian) : undefined,
  ].filter(Boolean) as Address[];
  return (
    <section className={card}>
      <h2 className="text-lg font-semibold tracking-tight">Create your vault</h2>
      <p className="mt-1 text-sm text-muted">
        Small amounts go out instantly up to your daily limit. Anything bigger waits, so you or your guardians can stop it.
        You can change both later.
      </p>
      <LimitPicker value={limit} onChange={setLimit} />
      <WaitPicker hours={hours} onChange={setHours} />
      <p className="mt-3 text-sm text-muted">
        Main account on {HOME_CHAINS.find((c) => c.id === HOME_CHAIN)?.label}. You can switch between Tempo and Base from Home.
      </p>
      {STASH_GUARDIAN && (
        <p className="mt-3 flex items-center gap-2 text-sm">
          <ShieldIcon width={16} height={16} className="text-accent" /> Stash is your first guardian
        </p>
      )}
      <label htmlFor={`${id}-g`} className="mt-3 block text-sm font-medium">
        {STASH_GUARDIAN ? "Another guardian (optional)" : "Guardian address"}
      </label>
      <input
        id={`${id}-g`}
        className={`${input} mt-1 font-mono text-sm`}
        placeholder="0x…"
        spellCheck={false}
        value={guardian}
        onChange={(e) => setGuardian(e.target.value.trim())}
      />
      <GuardianIndependenceNote />
      <button
        className={`${btn} mt-3`}
        disabled={disabled || guardians.length === 0 || !validHours(hours) || dailyLimit === null}
        onClick={() => dailyLimit !== null && onCreate(guardians, BigInt(hours) * 3600n, dailyLimit)}
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
      <h3 className={cardTitle}>Your key</h3>
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
      <h3 className={cardTitle}>Your account</h3>
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
    <footer className={`flex text-xs text-muted ${stacked ? "flex-col items-start" : "items-center justify-between gap-3"}`}>
      {owner && (
        <button className={`${textLink} font-mono`} onClick={copy} title={owner}>
          <span aria-live="polite">{copied ? "Address copied" : `${short(owner)} · copy address`}</span>
        </button>
      )}
      <button className={textLink} onClick={onLogout}>
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
      <span aria-live="polite">{copied ? "Guardian link copied" : "Share guardian link"}</span>
    </button>
  );
}

const MIN_HOURS = 24;
const MAX_HOURS = 30 * 24; // the contract's limits
const PRESETS = [24, 72, 168];
const validHours = (h: number) => Number.isInteger(h) && h >= MIN_HOURS && h <= MAX_HOURS;

/** A row of choices where exactly one is on (screen readers hear "pressed"). */
function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`${btnGhost} ${on ? "border-accent bg-accent/10 text-accent-ink" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Waiting period for big withdrawals: three presets, or any whole number of hours from 24 up to 30 days. */
function WaitPicker({ hours, onChange }: { hours: number; onChange: (h: number) => void }) {
  const id = useId();
  const [custom, setCustom] = useState(!PRESETS.includes(hours));
  const [typed, setTyped] = useState(PRESETS.includes(hours) ? "" : String(hours));
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-medium">Waiting period for big withdrawals</legend>
      <p className="text-xs text-muted">Longer gives you and your guardians more time to stop a thief. 24 hours minimum.</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {PRESETS.map((h) => (
          <Choice
            key={h}
            on={!custom && hours === h}
            onClick={() => {
              setCustom(false);
              onChange(h);
            }}
          >
            {waitText(h * 3600).replace(" hours", "h")}
          </Choice>
        ))}
        <Choice on={custom} onClick={() => setCustom(true)}>
          Other
        </Choice>
      </div>
      {custom && (
        <>
          <label htmlFor={id} className="mt-2 block text-xs text-muted">
            Hours (24 to 720)
          </label>
          <input
            id={id}
            className={`${input} mt-1 text-sm`}
            inputMode="numeric"
            autoFocus
            value={typed}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              setTyped(v);
              if (v) onChange(Number(v));
            }}
          />
          {typed && !validHours(Number(typed)) && (
            <p className="mt-1 text-xs text-warn-ink">Choose between 24 and 720 hours (30 days).</p>
          )}
        </>
      )}
    </fieldset>
  );
}

const MAX_DAILY_LIMIT = 1_000_000; // dollars; a sanity bound for the form, not a contract rule

/** Dollars typed by the user -> 18-decimal USD, or null if invalid (0 to MAX_DAILY_LIMIT). */
function parseLimit(v: string): bigint | null {
  try {
    if (v.trim() === "") return null;
    const n = parseUnits(v.trim(), 18);
    return n >= 0n && n <= BigInt(MAX_DAILY_LIMIT) * 10n ** 18n ? n : null;
  } catch {
    return null;
  }
}

/** Policy for a chosen daily limit and waiting period. Instant sends must stay under the large threshold,
 *  so a limit at or above it lifts the threshold just past the limit; otherwise the threshold stays. */
function rulesFor(limit: string, hours: number, s: Loaded["state"]) {
  const dailyLimit = parseLimit(limit);
  if (dailyLimit === null || !validHours(hours)) return null;
  const largeThreshold = dailyLimit >= s.largeThresholdUsd ? dailyLimit + 10n ** 18n : s.largeThresholdUsd;
  return { timelock: BigInt(hours) * 3600n, dailyLimit, largeThreshold };
}

/**
 * The vault's rules: daily instant limit and waiting period. Anything that loosens them only takes effect
 * after the current waiting period (owner or any guardian can cancel); tightening applies at once.
 */
function RulesCard({ ctx }: { ctx: Loaded }) {
  const { state: s, busy, actions } = ctx;
  const notify = useNotify();
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
  const takesEffect = now > 0 ? when(now + s.timelock, now) : null;

  const startEditing = () => {
    setHours(current);
    setLimit(formatUnits(s.dailyLimitUsd, 18));
    setEditing(true);
  };

  return (
    <section className={card}>
      <h3 className={cardTitle}>Your rules</h3>
      <p className="mt-1 text-sm text-muted">
        Instant up to {usd(s.dailyLimitUsd, 18)} a day. Bigger withdrawals wait {waitText(s.timelock)}.
      </p>

      {p ? (
        <div className={`mt-3 rounded-xl p-3 text-sm ${tint.warn}`}>
          <p className="font-semibold">Rules change waiting</p>
          <ul className="mt-1 space-y-0.5">
            {p.dailyLimitUsd !== s.dailyLimitUsd && (
              <li>
                Instant limit {usd(s.dailyLimitUsd, 18)} to {usd(p.dailyLimitUsd, 18)} a day
              </li>
            )}
            {p.timelock !== s.timelock && (
              <li>
                Waiting period {waitText(s.timelock)} to {waitText(p.timelock)}
              </li>
            )}
            {p.largeThresholdUsd !== s.largeThresholdUsd && <li>Single instant send under {usd(p.largeThresholdUsd, 18)}</li>}
          </ul>
          <p className="mt-1">
            {ready
              ? "The wait is over. Apply it to switch the new rules on."
              : `Takes effect ${when(p.effectiveAt, now || undefined)}. You or any guardian can cancel it before then.`}
          </p>
          <div className="mt-2 flex gap-2">
            {ready && (
              <button
                className={`${btnGhost} bg-card`}
                disabled={!!busy || s.frozen}
                onClick={() => actions.applyRules().then((h) => h && notify("New rules are on."))}
              >
                Apply
              </button>
            )}
            <button
              className={`${btnGhost} bg-card text-danger-ink`}
              disabled={!!busy}
              onClick={() => actions.cancelRules().then((h) => h && notify("Rules change cancelled. Your current rules stay."))}
            >
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
              onChange={(e) => setLimit(cleanAmount(e.target.value))}
            />
          </div>
          {next === null && limit.trim() !== "" && (
            <p className="mt-1 text-xs text-warn-ink">Enter an amount from $0 to ${MAX_DAILY_LIMIT.toLocaleString()}.</p>
          )}

          <WaitPicker hours={hours} onChange={setHours} />

          {changed && (
            <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${immediate ? tint.accent : tint.warn}`}>
              {immediate
                ? "These rules are stricter, so they apply right away."
                : `These rules loosen your protection, so they only take effect after your current ${waitText(s.timelock)} wait${
                    takesEffect ? ` (${takesEffect})` : ""
                  }. You and your guardians get an alert and can cancel it before then.`}
            </p>
          )}
          {!immediate && changed && s.frozen && (
            <p className="mt-1 text-xs text-warn-ink">Your vault is frozen, so you can only make the rules stricter.</p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              className={`${btn} flex-1`}
              disabled={!!busy || !next || !changed || (!immediate && s.frozen)}
              onClick={() =>
                next &&
                actions.setRules(next).then((hash) => {
                  if (!hash) return;
                  setEditing(false);
                  notify(immediate ? "Stricter rules are on." : `Change requested. It applies ${takesEffect ?? "after the wait"} unless cancelled.`, immediate ? "ok" : "wait");
                })
              }
            >
              {immediate || !changed ? "Save rules" : `Request change (applies in ${waitText(s.timelock)})`}
            </button>
            <button className={`${btnGhost} shrink-0`} onClick={() => setEditing(false)}>
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

/** Account tab: choose the main account's chain (each chain keeps its own vault; switching reloads the app). */
function HomeChainCard() {
  const [asking, setAsking] = useState<HomeChain | null>(null);
  const target = HOME_CHAINS.find((c) => c.id === asking);
  return (
    <section className={card}>
      <h3 className={cardTitle}>Main account network</h3>
      <p className="mt-1 text-sm text-muted">
        Your main account lives on one network. Switching shows that network&apos;s vault; your vault on the other one stays
        where it is, with its own money and guardians.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Main account network">
        {HOME_CHAINS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={HOME_CHAIN === c.id}
            className={`${btnGhost} text-left ${HOME_CHAIN === c.id ? "border-accent bg-accent/10" : ""}`}
            onClick={() => c.id !== HOME_CHAIN && setAsking(c.id)}
          >
            <span className={`block font-semibold ${HOME_CHAIN === c.id ? "text-accent-ink" : ""}`}>{c.label}</span>
            <span className="block text-xs font-normal text-muted">{c.note}</span>
          </button>
        ))}
      </div>
      {target && (
        <div className="mt-3 rounded-xl border border-line p-3 text-sm">
          <p>Switch to your {target.label} vault? The app reloads. Nothing moves between networks.</p>
          <div className="mt-2 flex gap-2">
            <button className={`${btn} flex-1`} onClick={() => switchHome(target.id)}>
              Switch to {target.label}
            </button>
            <button className={`${btnGhost} shrink-0`} onClick={() => setAsking(null)}>
              Stay
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Earning on the Tempo main account through Morpho (the Sentora pathUSD vault). Money put to work stays
 * in the vault as Morpho shares, behind the same limits and guardians. Only pathUSD earns here.
 */
function TempoEarnCard({ ctx }: { ctx: Loaded }) {
  const { state: s, busy, actions } = ctx;
  const { preview } = usePreview();
  const notify = useNotify();
  const now = useNow();
  const { tempo: rate } = useRates();
  const [amount, setAmount] = useState("");
  const path = s.balances[0];
  const d = path.token.decimals;
  const earn = s.earn;
  let parsed = 0n;
  try {
    parsed = amount ? parseUnits(amount, d) : 0n;
  } catch {
    parsed = 0n;
  }
  const header = (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className={cardTitle}>Earn on Tempo</h3>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tint.accent}`}>
        {typeof rate === "number" ? `${pct(rate)} a year` : "Morpho"}
      </span>
    </div>
  );

  if (!TEMPO_EARN) {
    return (
      <section className={card}>
        {header}
        <p className="mt-1 text-sm text-muted">
          Your pathUSD earns through Morpho on Tempo mainnet. Test dollars don&apos;t earn, so switch to Mainnet to use it.
        </p>
        <button className={`${btnGhost} mt-3 w-full`} onClick={askForMainnet}>
          Switch to Mainnet
        </button>
      </section>
    );
  }

  // Visitors see the ready-to-use card; any button asks them to sign up.
  const active = preview || !!earn?.active;
  const queuedFor = earn && !earn.active ? earn.readyAt : 0;
  const ready = queuedFor > 0 && now > 0 && now >= queuedFor;

  return (
    <section className={card}>
      {header}
      {!active && queuedFor === 0 && (
        <>
          <p className="mt-1 text-sm text-muted">
            Put your pathUSD to work in Morpho&apos;s Sentora pathUSD vault. Turning it on waits your{" "}
            {waitText(s.timelock)} waiting period once, like any rule change, so a thief can&apos;t rush it. Your
            guardians can cancel it.
          </p>
          <button
            className={`${btn} mt-3`}
            disabled={!!busy || s.frozen || !earn}
            onClick={() => actions.turnOnEarning().then((h) => h && notify(`Earning turns on in ${waitText(s.timelock)}.`))}
          >
            Turn on earning
          </button>
        </>
      )}
      {!active && queuedFor > 0 && (
        <>
          <p className="mt-1 text-sm text-muted">
            {ready
              ? "The wait is over. One more tap and your pathUSD can start earning."
              : `Earning turns on in ${timeLeft(queuedFor - now)}. Your guardians can cancel it until then.`}
          </p>
          {ready && (
            <button
              className={`${btn} mt-3`}
              disabled={!!busy || s.frozen}
              onClick={() => actions.finishTurningOnEarning().then((h) => h && notify("Earning is on."))}
            >
              Finish turning on
            </button>
          )}
        </>
      )}
      {active && (
        <>
          <p className="mt-1 text-3xl font-semibold">{usd(earn?.earning ?? 0n, d)}</p>
          <p className="text-sm text-muted">
            earning · {usd(path.available, d)} pathUSD in your main account, not earning
            {s.frozen && <span className="text-danger"> · frozen</span>}
          </p>
          <div className="mt-3 flex gap-2">
            <input
              className={input}
              inputMode="decimal"
              placeholder="$ amount"
              aria-label="Amount of pathUSD to start earning on, in dollars"
              value={amount}
              onChange={(e) => setAmount(cleanAmount(e.target.value))}
            />
            <button
              className={btnGhost}
              disabled={!preview && (!!busy || parsed === 0n || parsed > path.available || s.frozen)}
              onClick={() =>
                actions.startEarning(parsed).then((h) => {
                  if (!h) return;
                  notify(`$${amount} is now earning. It stays behind your vault's limits and guardians.`);
                  setAmount("");
                })
              }
            >
              Start earning
            </button>
          </div>
          {!preview && parsed > path.available && (
            <p className="mt-1 text-xs text-warn-ink">That&apos;s more pathUSD than your main account holds.</p>
          )}
          {!!earn && earn.shares > 0n && (
            <button
              className={`${btnGhost} mt-2 w-full`}
              disabled={!!busy}
              onClick={() => actions.stopEarning().then((h) => h && notify("Stopped earning. The money is back in your main account."))}
            >
              Stop earning (back to your main account)
            </button>
          )}
        </>
      )}
      <p className="mt-2 text-xs text-muted">
        Rates change. Earning money stays in your vault, behind the same limits and guardians. Keep a little pathUSD
        out for network fees.
      </p>
    </section>
  );
}

const LIMIT_PRESETS = ["50", "100", "250"];

/** Daily instant limit for a new vault: three presets, or any amount from $0 (every send waits). */
function LimitPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  const [custom, setCustom] = useState(!LIMIT_PRESETS.includes(value));
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-medium">Daily instant limit</legend>
      <p className="text-xs text-muted">The most that can leave in a day without waiting. Lower is safer; $0 means every send waits.</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {LIMIT_PRESETS.map((v) => (
          <Choice
            key={v}
            on={!custom && value === v}
            onClick={() => {
              setCustom(false);
              onChange(v);
            }}
          >
            ${v}
          </Choice>
        ))}
        <Choice
          on={custom}
          onClick={() => {
            setCustom(true);
            onChange("");
          }}
        >
          Other
        </Choice>
      </div>
      {custom && (
        <>
          <label htmlFor={id} className="mt-2 block text-xs text-muted">
            Amount per day, in dollars
          </label>
          <input
            id={id}
            className={`${input} mt-1 text-sm`}
            inputMode="decimal"
            autoFocus
            placeholder="1000"
            value={value}
            onChange={(e) => onChange(cleanAmount(e.target.value))}
          />
          {value !== "" && parseLimit(value) === null && (
            <p className="mt-1 text-xs text-warn-ink">Enter an amount from $0 to ${MAX_DAILY_LIMIT.toLocaleString()}.</p>
          )}
        </>
      )}
    </fieldset>
  );
}

/**
 * A guardian only helps if a thief who steals your key or seed phrase can't control it too. Nothing
 * on-chain can tell that two addresses come from the same seed, so say it plainly where guardians are added.
 */
function GuardianIndependenceNote() {
  return (
    <p className="mt-2 text-xs text-muted">
      Pick a different person, or a device with its own seed phrase. Another account from your own seed phrase or login
      won&apos;t protect you: a thief with your phrase controls it too.
      {STASH_GUARDIAN && " The Stash guardian is always independent of your key."}
    </p>
  );
}
