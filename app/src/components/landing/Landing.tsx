import Link from "next/link";
import Logo from "../Logo";
import VaultStage from "./VaultStage";
import type { Sign } from "./vault";

const cta =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 font-semibold text-accent-fg transition-colors hover:bg-accent-strong";
const ctaGhost =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong bg-background/70 px-5 font-semibold backdrop-blur-sm transition-colors hover:bg-panel";
const stop = "mx-auto flex min-h-svh max-w-7xl items-end px-4 pb-[10vh] pt-22 md:items-center md:px-10 md:pb-10";
// On wide screens the words sit over the edge of the vault, so they carry their own dark halo to stay readable.
const say =
  "relative z-2 md:max-w-[min(54%,36rem)] md:[text-shadow:0_0_14px_var(--background),0_0_36px_var(--background),0_0_60px_var(--background)]";
const h2 = "text-[clamp(1.75rem,4.2vw,3.25rem)] font-semibold leading-[1.12] tracking-tight text-balance";

export const TAGLINE = "Savings a stolen key can't drain.";

const PROMISES: [Sign, string][] = [
  ["limit", "You set a daily limit. Nobody takes out more, even with your key."],
  ["wait", "Bigger withdrawals wait. A guardian gets a Telegram alert and can cancel."],
  ["guard", "Up to 3 guardians can freeze your vault from their own phones."],
  ["goal", "Lock money for a goal until the date you pick."],
  ["earn", "Your Save pot earns interest in Gauntlet's USDC vault on Morpho."],
];

// The app used to live at "/". Returning users, and old links that carry ?network= or ?home=, go straight
// to it before the homepage paints.
const forward = `(function(){try{var s=location.search;if(s||Object.keys(localStorage).some(function(k){return k.indexOf("privy:")===0&&k.indexOf("token")>-1}))location.replace("/vault"+s+location.hash)}catch(e){}})()`;

function Actions({ drain }: { drain: boolean }) {
  return (
    <div className="mt-7 flex flex-wrap gap-3 [text-shadow:none]">
      <Link href="/vault" className={cta}>
        Open your vault
      </Link>
      {drain && (
        <Link href="/drain" className={ctaGhost}>
          Run the drain test
        </Link>
      )}
    </div>
  );
}

/** The public homepage. Always dark: the vault is lit for the "midnight vault" theme. */
export default function Landing() {
  // Same rule as the sign-in screen: the drain test needs a demo vault to run against.
  const drain = !!process.env.NEXT_PUBLIC_DEMO_VAULT;
  return (
    <div data-theme="dark" className="relative flex-1 bg-background text-foreground">
      <script dangerouslySetInnerHTML={{ __html: forward }} />
      <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-4 bg-background/80 px-4 py-3 backdrop-blur-md md:px-10">
        <span className="flex items-center gap-3">
          <Link href="/" aria-label="Stash home">
            <Logo />
          </Link>
          {/* Phones have no room for it beside the buttons; there it lives in the page title. */}
          <span className="hidden text-sm text-muted lg:inline">{TAGLINE}</span>
        </span>
        <nav className="flex items-center gap-3 text-[0.9375rem] md:gap-6">
          {drain && (
            <Link href="/drain" className="text-muted transition-colors hover:text-foreground">
              Drain test
            </Link>
          )}
          <Link href="/vault" className={cta}>
            Open your vault
          </Link>
        </nav>
      </header>
      <VaultStage />
      <main>
        <section data-stop className={stop}>
          <div className={say}>
            <h1 className="text-[clamp(1.875rem,4.6vw,3.25rem)] font-semibold leading-[1.08] tracking-tight text-balance">
              If someone stole your seed phrase tonight, how much would be left by morning?
            </h1>
            <Actions drain={drain} />
          </div>
        </section>
        {PROMISES.map(([sign, line]) => (
          <section key={sign} data-stop data-show={sign} className={stop}>
            <div className={say}>
              <h2 className={h2}>{line}</h2>
            </div>
          </section>
        ))}
        <section data-stop className={stop}>
          <div className={say}>
            <h2 className={h2}>{drain ? "Watch a thief try to drain a vault." : "One leaked seed phrase empties a normal wallet in minutes."}</h2>
            <Actions drain={drain} />
          </div>
        </section>
      </main>
      <footer className="relative z-2 border-t border-line bg-background px-4 py-6 text-sm text-muted md:px-10">
        Beta. Not audited yet, so each vault holds up to $5,000.
      </footer>
    </div>
  );
}
