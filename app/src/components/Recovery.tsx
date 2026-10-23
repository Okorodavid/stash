"use client";

import { useEffect, useState } from "react";
import { useExportWallet, usePrivy, useUser } from "@privy-io/react-auth";
import { btn, btnGhost, card, cardTitle } from "./ui";

// Where the stand-alone exit page is hosted (independent of the Stash app and servers).
const EXIT_URL = process.env.NEXT_PUBLIC_EXIT_URL;

const flagKey = (owner: string) => `stash:recovery-saved:${owner.toLowerCase()}`;

/**
 * Whether the user has seen their recovery key. Stored on their Privy account (so it follows them
 * across browsers and devices) with this browser as a fallback. The key opens in Privy's own window,
 * so Stash can't tell whether it was copied: opening it counts as backed up.
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

/** Opens the key in Privy's secure window; resolves once the user closes it. */
function useShowKey(owner: string) {
  const { exportWallet } = useExportWallet();
  const [error, setError] = useState<string | null>(null);
  const show = async () => {
    setError(null);
    try {
      await exportWallet({ address: owner });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  return { show, error };
}

/** Home screen prompt. Shown only until the key has been viewed once; after that it lives in Account. */
export default function RecoveryCard({ owner }: { owner: string }) {
  const { saved, confirm } = useBackedUp(owner);
  const { show, error } = useShowKey(owner);

  if (saved !== false) return null;

  return (
    <section className={`${card} border-warn`}>
      <h3 className={cardTitle}>Back up your recovery key</h3>
      <ul className="mt-2 space-y-1 text-sm">
        <li>Opens in Privy&apos;s window. Stash never sees it.</li>
        <li>Save it on paper or in a password manager. No screenshots.</li>
        <li>Never share it, even with &quot;Stash&quot;.</li>
        <li className="text-muted">Later: under Account.</li>
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-danger-ink">{error}</p>}
      <button
        className={`${btn} mt-3`}
        onClick={() => {
          // The key is copied inside Privy's window, which Stash can't observe, so opening it counts:
          // the card leaves Home right away (Privy's window stays open) and the key lives under Account.
          void show();
          void confirm();
        }}
      >
        Show my recovery key
      </button>
    </section>
  );
}

/** Account settings: the only place to see the key again once it's been backed up. */
export function RecoverySettings({ owner }: { owner: string }) {
  const { saved, confirm } = useBackedUp(owner);
  const { show, error } = useShowKey(owner);
  const [open, setOpen] = useState(false);
  return (
    <section className={card}>
      <h3 className={cardTitle}>Recovery key</h3>
      <p className="mt-1 text-sm text-muted">{saved ? "Backed up" : "Not backed up yet"}</p>
      {open ? (
        <div className="mt-3 space-y-2 text-sm">
          <p>No one watching? Never screenshot or share it.</p>
          <div className="flex gap-2">
            <button
              className={btn}
              onClick={async () => {
                if ((await show()) && !saved) await confirm();
                setOpen(false);
              }}
            >
              Show recovery key
            </button>
            <button className={btnGhost} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className={`${btnGhost} mt-3 w-full`} onClick={() => setOpen(true)}>
          View recovery key
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-danger-ink">{error}</p>}
      {EXIT_URL && (
        <p className="mt-3 text-sm">
          <a className="underline" href={EXIT_URL} target="_blank" rel="noreferrer">
            Withdraw without Stash (exit page)
          </a>
        </p>
      )}
    </section>
  );
}
