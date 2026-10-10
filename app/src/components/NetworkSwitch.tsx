"use client";

import { useEffect, useState } from "react";
import { ASK_MAINNET_EVENT, MODE, switchMode, type Mode } from "@/lib/config";

const CONFIRM_KEY = "stash:mainnet-ok";

/**
 * Testnet / Mainnet switch in the header. Mainnet is amber so real money is never mistaken for test
 * money, and the first switch to mainnet asks for confirmation.
 */
export default function NetworkSwitch() {
  // The header renders on the server (always testnet); show the real choice once in the browser.
  const [mode, setMode] = useState<Mode | null>(null);
  // In-page confirmation: browser pop-ups (window.confirm) are silently blocked in many in-app browsers.
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMode(MODE), 0);
    return () => clearTimeout(t);
  }, []);
  // Features that only exist with real tokens (Swap, Growth) ask to switch from elsewhere in the app.
  useEffect(() => {
    const ask = () => {
      let confirmed = false;
      try {
        confirmed = localStorage.getItem(CONFIRM_KEY) === "1";
      } catch {
        // Storage blocked: ask.
      }
      if (confirmed) switchMode("mainnet");
      else setAsking(true);
    };
    window.addEventListener(ASK_MAINNET_EVENT, ask);
    return () => window.removeEventListener(ASK_MAINNET_EVENT, ask);
  }, []);

  if (!mode) return <span className="text-right text-xs text-muted">Beta</span>;

  const go = (next: Mode) => {
    if (next === mode) return;
    if (next === "mainnet") {
      let confirmed = false;
      try {
        confirmed = localStorage.getItem(CONFIRM_KEY) === "1";
      } catch {
        // Storage blocked: ask every time.
      }
      if (!confirmed) return setAsking(true);
    }
    switchMode(next);
  };

  const confirmMainnet = () => {
    try {
      localStorage.setItem(CONFIRM_KEY, "1");
    } catch {
      // Not remembered; fine.
    }
    switchMode("mainnet");
  };

  const pill = (m: Mode, label: string, on: string) => (
    <button
      type="button"
      onClick={() => go(m)}
      aria-pressed={mode === m}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${mode === m ? on : "text-muted hover:text-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="flex rounded-full border border-line p-0.5" role="group" aria-label="Network">
        {pill("testnet", "Testnet", "bg-accent/15 text-accent")}
        {pill("mainnet", "Mainnet", "bg-warn/20 text-warn")}
      </span>
      <span className="text-[10px] text-muted">
        {mode === "mainnet" ? "Real money" : "Free test money"}
      </span>
      {asking && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Switch to mainnet"
          onClick={(e) => e.target === e.currentTarget && setAsking(false)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-warn/40 bg-card p-5 text-left shadow-xl">
            <p className="text-lg font-semibold">Switch to mainnet?</p>
            <p className="mt-2 text-sm text-muted">
              Mainnet uses real money. Stash is unaudited beta software, so keep amounts small: each vault holds at most
              $5,000 for now.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
              <button className="flex-1 rounded-xl bg-warn px-4 py-2.5 font-semibold text-warn-fg" onClick={confirmMainnet}>
                Use real money
              </button>
              <button className="flex-1 rounded-xl border border-line px-4 py-2.5 font-semibold" onClick={() => setAsking(false)}>
                Stay on testnet
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
