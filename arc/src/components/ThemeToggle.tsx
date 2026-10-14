"use client";

import { useTheme } from "@/lib/theme";
import { MoonIcon, SunIcon } from "./Icons";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-muted hover:text-foreground"
    >
      {theme === "dark" ? <SunIcon width={18} height={18} /> : theme === "light" ? <MoonIcon width={18} height={18} /> : null}
    </button>
  );
}
