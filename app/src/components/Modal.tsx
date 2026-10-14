"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * A native <dialog> shown with showModal(): the browser traps focus inside, closes on Escape, and returns
 * focus to the control that opened it. Render it only while open (`{open && <Modal …/>}`); `onClose`
 * decides whether closing is allowed (e.g. not while busy).
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
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Close before the element is removed so the browser hands focus back to the opener.
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto bg-transparent p-0 text-foreground"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </dialog>
  );
}
