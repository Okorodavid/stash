import { POT_INFO } from "@/lib/potInfo";

/** Collapsible "what this depends on" panel. Plain <details>, so it works without JavaScript state. */
export default function PotInfo({ pot }: { pot: keyof typeof POT_INFO }) {
  const info = POT_INFO[pot];
  return (
    <details className="mt-3 rounded-xl border border-line px-3 py-2 text-sm">
      <summary className="cursor-pointer select-none font-medium">What this pot depends on</summary>
      <ul className="mt-2 space-y-1">
        {info.dependsOn.map((d) => (
          <li key={d.name}>
            {d.url ? (
              <a className="underline" href={d.url} target="_blank" rel="noreferrer">
                {d.name}
              </a>
            ) : (
              <span>{d.name}</span>
            )}
            <span className="text-muted">: {d.role}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
        {info.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </details>
  );
}
