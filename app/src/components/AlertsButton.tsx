"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { btnGhost } from "./ui";

/** Opens the Stash Telegram bot with a one-time code tied to the signed-in user's own wallet. */
export default function AlertsButton({ label = "Get Telegram alerts" }: { label?: string }) {
  const { getAccessToken } = usePrivy();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const open = async () => {
    setError(null);
    setOpening(true);
    // Open the tab synchronously (inside the click) so pop-up blockers allow it; fill in the URL after.
    const tab = window.open("", "_blank");
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/telegram-link", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!json.url) throw new Error(json.error ?? "Couldn't create a Telegram link");
      if (tab) tab.location.href = json.url;
      else window.location.href = json.url;
    } catch (e) {
      tab?.close();
      setError((e as Error).message);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div>
      <button className={`${btnGhost} w-full`} onClick={open} disabled={opening}>
        {opening ? "Opening Telegram…" : `🔔 ${label}`}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
