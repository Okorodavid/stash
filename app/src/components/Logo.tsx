/** Hourglass jar: savings that only leave slowly. Colors follow the theme's accent. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <rect x="20" y="5" width="24" height="6" rx="2" fill="var(--accent-strong)" />
      <path
        d="M22 12C13 17 14 27 29 32 14 37 12 50 18 56Q32 61 46 56C52 50 50 37 35 32 50 27 51 17 42 12Z"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="38.5" r="2.2" fill="var(--accent)" />
      <g fill="var(--accent)">
        <circle cx="25" cy="51" r="3.4" />
        <circle cx="32" cy="52" r="3.4" />
        <circle cx="39" cy="51" r="3.4" />
        <circle cx="28.5" cy="45.5" r="3.4" />
        <circle cx="35.5" cy="45.5" r="3.4" />
      </g>
    </svg>
  );
}

export default function Logo({ suffix }: { suffix?: string }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">
        stash{suffix && <span className="font-normal text-muted"> · {suffix}</span>}
      </span>
    </span>
  );
}
