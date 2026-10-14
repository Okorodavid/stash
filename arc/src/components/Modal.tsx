"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * A dialog over a dimmed backdrop. Render it only while open (`{open && <Modal …/>}`); `onClose` decides
 * whether closing is allowed (e.g. not while busy). Escape and a click on the backdrop ask to close.
 *
 * Deliberately not a native showModal() dialog: that puts the dialog in the browser's top layer and makes
 * the rest of the page inert, which hides Privy's transaction-confirmation window behind it and leaves
 * any action started from the dialog (e.g. "Create vault") waiting forever.
 */
export default function Modal({
  onClose,
  label,
  children,
}: {
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    // Move focus into the dialog, and hand it back to the opener when it closes.
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("button, input, select, textarea, a[href]");
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      // A click on the backdrop itself (not the dialog content) asks to close.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto text-foreground outline-none"
      >
        {children}
      </div>
    </div>
  );
}
