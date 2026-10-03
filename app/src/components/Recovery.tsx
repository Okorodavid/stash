"use client";

import { useEffect, useState } from "react";
import { useExportWallet, usePrivy, useUser } from "@privy-io/react-auth";
import { btn, btnGhost, card } from "./ui";

// Where the stand-alone exit page is hosted (independent of the Stash app and servers).
const EXIT_URL = process.env.NEXT_PUBLIC_EXIT_URL;

const flagKey = (owner: string) => `stash:recovery-saved:${owner.toLowerCase()}`;

/**
 * Whether the user confirmed an offline backup. Stored on their Privy account (so it follows them
 * across browsers and devices) with this browser as a fallback. A reminder only: we can't verify it.
 */
function useBackedUp(owner: string) {
  const { getAccessToken } = usePrivy();
  const { user, refreshUser } = useUser();
  const onAccount = user?.customMetadata?.recovery_backed_up === true;
  const [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        setLocal(localStorage.getItem(flagKey(owner)) === "1");
      } catch {
        setLocal(false);
      }
    };
    const t = setTimeout(read, 0);
    return () => clearTimeout(t);
  }, [owner]);
  const confirm = async () => {
    try {
      localStorage.setItem(flagKey(owner), "1");
    } catch {
      // Storage blocked: the account flag below still covers it.
    }
    setLocal(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/recovery", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) await refreshUser();
    } catch {
      // Offline or server not configured: this browser still remembers.
    }
  };
  return { saved: onAccount ? true : local, confirm };
}

export default function RecoveryCard({ owner }: { owner: string }) {
  const { exportWallet } = useExportWallet();
  const { saved, confirm } = useBackedUp(owner);
  const [shown, setShown] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = async () => {
    setError(null);
    try {
      await exportWallet({ address: owner });
      setShown(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (saved === null) return null;

  if (saved) {
    return (
      <section className="flex items-center justify-between gap-2 rounded-2xl border border-line px-4 py-3 text-sm">
        <span>Recovery key backed up ✓</span>
        <span className="flex gap-3">
          <button className="underline" onClick={show}>
            View again
          </button>
          {EXIT_URL && (
            <a className="underline" href={EXIT_URL} target="_blank" rel="noreferrer">
              Exit page
            </a>
          )}
        </span>
      </section>
    );
  }

  return (
    <section className={`${card} border-warn`}>
      <p className="font-medium">Back up your recovery key</p>
      <p className="mt-1 text-sm text-muted">
        Your vault is yours, not ours. If Stash ever shuts down, this key plus our open-source exit page lets you withdraw
        everything without us.
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
        <li>Tap below. The key opens in a secure Privy window; Stash never sees it.</li>
        <li>Write it on paper or save it in a password manager. Never screenshot it or send it to anyone.</li>
        <li>Anyone who asks for it, including someone claiming to be Stash, is trying to rob you.</li>
      </ol>
      <p className="mt-2 text-xs text-muted">
        Even with this key, a thief still faces your daily limit, the waiting period, and your guardians. But keep it safe.
      </p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button className={`${btn} mt-3`} onClick={show}>
        {shown ? "Show recovery key again" : "Show my recovery key"}
      </button>
      {shown && (
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            I&apos;ve written my recovery key down somewhere safe and offline.
          </label>
          <button className={`${btnGhost} w-full`} disabled={!checked} onClick={confirm}>
            Done
          </button>
        </div>
      )}
    </section>
  );
}
