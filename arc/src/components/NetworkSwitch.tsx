"use client";

import { useEffect, useState } from "react";
import { MODE, switchMode, type Mode } from "@/lib/config";
import Modal from "./Modal";
import { btnGhost, btnWarn } from "./ui";

const CONFIRM_KEY = "stash-arc:mainnet-ok";

/**
 * Testnet / Mainnet switch in the header. Mainnet is amber so real money is never mistaken for test
 * money; switching to it from testnet asks for confirmation once.
 */
export default function NetworkSwitch() {
  // The header renders on the server (always mainnet); show the real choice once in the browser.
  const [mode, setMode] = useState<Mode | null>(null);
  // In-page confirmation: browser pop-ups (window.confirm) are silently blocked in many in-app browsers.
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMode(MODE), 0);
    return () => clearTimeout(t);
  }, []);

  if (!mode) return <span className="text-right text-xs text-muted">Arc · beta</span>;

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
      // The pill is small; an invisible pad gives it a 44px tall tap area.
      className={`relative rounded-full px-3 py-1.5 text-xs font-semibold after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] ${
        mode === m ? on : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="flex rounded-full border border-line p-0.5" role="group" aria-label="Network">
        {pill("testnet", "Testnet", "bg-accent/15 text-accent-ink")}
        {pill("mainnet", "Mainnet", "bg-warn/20 text-warn-ink")}
      </span>
      <span className="text-xs text-muted">
        {mode === "mainnet" ? "Arc · real USDC · unaudited" : "Arc testnet · free test USDC"}
      </span>
      {asking && (
      <Modal label="Switch to mainnet" onClose={() => setAsking(false)}>
          <div className="rounded-2xl border border-warn/40 bg-card p-5 text-left shadow-xl">
            <h2 className="text-lg font-semibold">Switch to mainnet?</h2>
            <p className="mt-2 text-sm text-muted">
              Mainnet uses real USDC. Stash is unaudited beta software, so keep amounts small: each vault holds at most
              $5,000 for now.
            </p>
            {/* The safe choice comes first, so the dialog opens with focus on it. */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button className={`${btnGhost} sm:flex-1`} onClick={() => setAsking(false)}>
                Stay on testnet
              </button>
              <button className={`${btnWarn} sm:flex-1`} onClick={confirmMainnet}>
                Use real money
              </button>
            </div>
          </div>
      </Modal>
      )}
    </span>
  );
}
