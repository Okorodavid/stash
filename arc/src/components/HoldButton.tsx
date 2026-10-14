"use client";

import { useRef, useState, type ReactNode } from "react";

/** Press and hold to confirm (pointer or Enter/Space). A fill shows progress; letting go early cancels. */
export default function HoldButton({
  onHold,
  disabled,
  className = "",
  ms = 1200,
  children,
}: {
  onHold: () => void;
  disabled?: boolean;
  className?: string;
  ms?: number;
  children: ReactNode;
}) {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setProgress(0);
  };
  const start = () => {
    if (disabled || frame.current !== null) return;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setProgress(p);
      if (p < 1) {
        frame.current = requestAnimationFrame(tick);
        return;
      }
      frame.current = null;
      setProgress(0);
      navigator.vibrate?.(40);
      onHold();
    };
    frame.current = requestAnimationFrame(tick);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      className={`relative touch-none select-none overflow-hidden ${className}`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") stop();
      }}
      onBlur={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-danger/15" style={{ width: `${progress * 100}%` }} />
      <span className="relative flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}
