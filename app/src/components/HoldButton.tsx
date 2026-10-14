"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { btnDanger, btnGhost } from "./ui";

/**
 * Press and hold to confirm. Pointer users hold for `ms` (the press is captured, so a drifting thumb
 * doesn't cancel it). Any press that doesn't complete a hold (a quick tap, Enter or Space, a screen
 * reader or switch activation) opens an explicit confirm step instead, so the emergency stop works for
 * everyone. Focus returns to the button when the confirm step closes.
 */
export default function HoldButton({
  onHold,
  disabled,
  className = "",
  ms = 1200,
  confirmLabel = "Freeze now",
  children,
}: {
  onHold: () => void;
  disabled?: boolean;
  className?: string;
  ms?: number;
  confirmLabel?: string;
  children: ReactNode;
}) {
  const fill = useRef<HTMLSpanElement>(null);
  const frame = useRef<number | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  // Set when a hold completes, so the click that follows the release doesn't also open the confirm step.
  const held = useRef(false);
  const refocus = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const hint = useId();

  useEffect(() => {
    if (!confirming && refocus.current) {
      refocus.current = false;
      button.current?.focus();
    }
  }, [confirming]);
  const closeConfirm = () => {
    refocus.current = true;
    setConfirming(false);
  };

  const setFill = (p: number) => {
    if (fill.current) fill.current.style.transform = `scaleX(${p})`;
  };
  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setFill(0);
  };

  // A hold in progress ends if the button becomes unavailable (e.g. another action starts).
  useEffect(() => {
    if (!disabled) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (fill.current) fill.current.style.transform = "scaleX(0)";
  }, [disabled]);
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const start = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || frame.current !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setFill(p);
      if (p < 1) {
        frame.current = requestAnimationFrame(tick);
        return;
      }
      frame.current = null;
      setFill(0);
      held.current = true;
      navigator.vibrate?.(40);
      onHold();
    };
    frame.current = requestAnimationFrame(tick);
  };

  if (confirming) {
    return (
      <div role="group" aria-label="Confirm" className="flex gap-2">
        <button
          type="button"
          autoFocus
          className={btnDanger}
          disabled={disabled}
          onClick={() => {
            closeConfirm();
            onHold();
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" className={`${btnGhost} shrink-0`} onClick={closeConfirm}>
          Keep it open
        </button>
      </div>
    );
  }

  return (
    <button
      ref={button}
      type="button"
      disabled={disabled}
      aria-describedby={hint}
      className={`relative touch-none select-none overflow-hidden ${className}`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onClick={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        if (!disabled) setConfirming(true);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span ref={fill} aria-hidden="true" className="absolute inset-0 origin-left scale-x-0 bg-danger/20" />
      <span className="relative flex items-center justify-center gap-2">{children}</span>
      <span id={hint} className="sr-only">
        Press and hold for a second, or press once and then confirm.
      </span>
    </button>
  );
}
