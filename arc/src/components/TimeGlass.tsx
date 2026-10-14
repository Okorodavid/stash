import { useId } from "react";

const GLASS = "M10 4C10 16 18 22 19.4 28 18 34 10 40 10 52H30C30 40 22 34 20.6 28 22 22 30 16 30 4Z";

/**
 * Time as the lock, drawn: an hourglass whose sand has run `elapsed` (0..1) of the way through.
 * The top empties and the bottom fills; a grain falls through the neck while time is still running.
 * Colors follow `currentColor`.
 */
export default function TimeGlass({ elapsed, size = 44 }: { elapsed: number; size?: number }) {
  const clip = useId();
  const e = Math.min(1, Math.max(0, elapsed));
  const topY = 28 - (1 - e) * 22; // sand left in the top bulb sits on the neck
  const bottomY = 52 - e * 22;
  return (
    <svg viewBox="0 0 40 56" width={(size * 40) / 56} height={size} aria-hidden="true" className="shrink-0">
      <defs>
        <clipPath id={clip}>
          <path d={GLASS} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`} fill="currentColor">
        <rect x="0" y={topY} width="40" height={28 - topY} opacity="0.85" />
        <rect x="0" y={bottomY} width="40" height={52 - bottomY} opacity="0.85" />
      </g>
      {e > 0 && e < 1 && (
        <circle cx="20" cy="30" r="1.3" fill="currentColor" className="motion-safe:animate-[grain-fall_1.4s_ease-in_infinite]" />
      )}
      <path d={GLASS} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M7 4H33M7 52H33" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
