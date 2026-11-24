"use client";

import { useState } from "react";
import { NOTE_LIMIT, type Notes } from "@/lib/escrow";
import { btnGhost, input, when } from "../ui";
import { useEscrow } from "./EscrowShell";
import { routeError, useEscrowWallet, useLoad } from "./hooks";

/**
 * Each side's account of a disputed deal, for Stash to read before ruling. Buyer and seller can write
 * and rewrite their own; everyone allowed in sees both. Shown as plain text.
 */
export default function DisputeNotes({ deal, side }: { deal: bigint; side: "buyer" | "seller" | "arbiter" }) {
  const { net } = useEscrow();
  const wallet = useEscrowWallet();
  const notes = useLoad(async () => {
    const res = await wallet.authFetch(`/api/escrow/note?net=${net}&deal=${deal}`);
    if (!res.ok) throw new Error(await routeError(res));
    return (await res.json()) as Notes;
  }, `${net}:${deal}:${wallet.me ?? ""}`);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const mine = side === "arbiter" ? undefined : notes.data?.[side];
  const text = draft ?? mine?.text ?? "";

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      const res = await wallet.authFetch("/api/escrow/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ net, deal: String(deal), text }),
      });
      if (!res.ok) throw new Error(await routeError(res));
      setDraft(null);
      notes.reload();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // The arbiter reads both; each side reads the other's and edits their own below.
  const shown = side === "arbiter" ? (["buyer", "seller"] as const) : side === "buyer" ? (["seller"] as const) : (["buyer"] as const);
  return (
    <div className="space-y-3">
      {shown.map((s) => {
        const n = notes.data?.[s];
        return (
          <div key={s} className="space-y-1">
            <p className="text-sm font-semibold">{s === "buyer" ? "The buyer says" : "The seller says"}</p>
            {n ? (
              <>
                <p className="whitespace-pre-wrap break-words">{n.text}</p>
                <p className="text-xs text-muted">{when(n.at)}</p>
              </>
            ) : (
              <p className="text-sm text-muted">{notes.loading ? "Loading…" : "Nothing yet."}</p>
            )}
          </div>
        );
      })}
      {side !== "arbiter" && (
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Your side of it, for Stash</span>
          <textarea className={`${input} min-h-28`} value={text} maxLength={NOTE_LIMIT} onChange={(e) => setDraft(e.target.value)} />
          <button className={btnGhost} disabled={saving || !text.trim() || draft === null} onClick={save}>
            {saving ? "Saving…" : mine ? "Update" : "Send to Stash"}
          </button>
        </label>
      )}
      {(problem || notes.error) && <p className="text-sm text-danger">{problem ?? notes.error}</p>}
    </div>
  );
}
