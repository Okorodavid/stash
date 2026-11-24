import Link from "next/link";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import NetworkSwitch from "./NetworkSwitch";
import { ESCROW_ON } from "@/lib/escrow";

export default function SiteHeader({ suffix }: { suffix?: string }) {
  return (
    <header className="mb-6 flex items-center justify-between gap-3">
      <Link href="/" aria-label="Stash home">
        <Logo suffix={suffix} />
      </Link>
      <span className="flex items-center gap-3">
        {ESCROW_ON && (
          <Link href={suffix === "escrow" ? "/vault" : "/escrow"} className="inline-flex min-h-11 items-center text-sm font-medium text-muted hover:text-foreground">
            {suffix === "escrow" ? "Vault" : "Escrow"}
          </Link>
        )}
        <NetworkSwitch />
        <ThemeToggle />
      </span>
    </header>
  );
}
