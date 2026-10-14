"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { XIcon } from "@/components/Icons";

export type Tone = "ok" | "wait" | "danger";
type Note = { id: number; tone: Tone; text: string };

const NotifyContext = createContext<(text: string, tone?: Tone) => void>(() => {});
const NotesContext = createContext<{ notes: Note[]; dismiss: (id: number) => void }>({ notes: [], dismiss: () => {} });

/** Receipts after an action succeeds ("Sent $40…"). Shown by <StatusDock />, near the thumb on phones. */
export function NotifyProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const dismiss = useCallback((id: number) => setNotes((n) => n.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (text: string, tone: Tone = "ok") => {
      const id = Date.now() + Math.random();
      setNotes((n) => [...n.slice(-1), { id, tone, text }]);
      // Plain receipts fade; anything about waiting money or a frozen vault stays until dismissed.
      if (tone === "ok") setTimeout(() => dismiss(id), 9000);
    },
    [dismiss],
  );
  return (
    <NotifyContext.Provider value={notify}>
      <NotesContext.Provider value={{ notes, dismiss }}>{children}</NotesContext.Provider>
    </NotifyContext.Provider>
  );
}

export const useNotify = () => useContext(NotifyContext);

const toneClass: Record<Tone, string> = {
  ok: "border-accent/40 text-foreground",
  wait: "border-warn/50 text-foreground",
  danger: "border-danger/50 text-foreground",
};
const dotClass: Record<Tone, string> = { ok: "bg-accent", wait: "bg-warn", danger: "bg-danger" };

/**
 * Live feedback for transactions: what's happening now, what went wrong, and what just succeeded.
 * Fixed above the bottom tab bar on phones (where the thumb is) and bottom-right on desktop, so it is
 * visible whichever card started the action. Screen readers hear every change.
 */
export function StatusDock({ busy, error }: { busy?: string | null; error?: string | null }) {
  const { notes, dismiss } = useContext(NotesContext);
  const [hidden, setHidden] = useState<string | null>(null);
  // A new error shows again even if the previous one was dismissed.
  useEffect(() => {
    if (!error) {
      const t = setTimeout(() => setHidden(null), 0);
      return () => clearTimeout(t);
    }
  }, [error]);
  const showError = error && hidden !== error;
  const pill = "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border bg-card px-4 py-3 text-sm shadow-lg shadow-black/20";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:items-end">
      <div role="status" aria-live="polite" className="flex w-full flex-col items-center gap-2 lg:items-end">
        {busy && (
          <p className={`${pill} border-line-strong`}>
            <span className="mt-1 size-2.5 shrink-0 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden="true" />
            <span className="flex-1">{busy}…</span>
          </p>
        )}
        {notes.map((n) => (
          <p key={n.id} className={`${pill} ${toneClass[n.tone]}`}>
            <span className={`mt-1 size-2.5 shrink-0 rounded-full ${dotClass[n.tone]}`} aria-hidden="true" />
            <span className="flex-1">{n.text}</span>
            <button className="-my-2.5 -mr-2 grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:text-foreground" aria-label="Dismiss" onClick={() => dismiss(n.id)}>
              <XIcon width={16} height={16} />
            </button>
          </p>
        ))}
      </div>
      <div role="alert" className="flex w-full flex-col items-center gap-2 lg:items-end">
        {showError && (
          <p className={`${pill} border-danger/50`}>
            <span className="mt-1 size-2.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
            <span className="flex-1 text-danger-ink">{error}</span>
            <button className="-my-2.5 -mr-2 grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:text-foreground" aria-label="Dismiss" onClick={() => setHidden(error)}>
              <XIcon width={16} height={16} />
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
