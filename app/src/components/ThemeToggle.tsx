"use client";

import { useTheme } from "@/lib/theme";
import { MoonIcon, SunIcon } from "./Icons";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
  // Both icons render from the first paint; CSS shows the right one, so there's no empty box while loading.
  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-line-strong text-muted hover:bg-panel hover:text-foreground"
    >
      <SunIcon width={18} height={18} className="hidden dark:block" />
      <MoonIcon width={18} height={18} className="block dark:hidden" />
    </button>
  );
}
