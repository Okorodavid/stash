import Link from "next/link";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function SiteHeader({ suffix }: { suffix?: string }) {
  return (
    <header className="mb-6 flex items-center justify-between gap-3">
      <Link href="/" aria-label="Stash home">
        <Logo suffix={suffix} />
      </Link>
      <span className="flex items-center gap-3">
        <span className="text-right text-xs text-muted">Testnet beta · unaudited</span>
        <ThemeToggle />
      </span>
    </header>
  );
}
