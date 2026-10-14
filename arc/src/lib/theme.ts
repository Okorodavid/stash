"use client";

import { useEffect, useState } from "react";
import { THEME_COLOR, THEME_KEY } from "./themeKey";

type Theme = "light" | "dark";

/** The theme in use: set on <html> by the boot script in layout.tsx (dark unless the visitor chose light). */
export function resolvedTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Current theme (null until mounted) and a toggle that remembers the choice in this browser. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setTheme(resolvedTheme()), 0);
    return () => clearTimeout(first);
  }, []);
  const toggle = () => {
    const next: Theme = resolvedTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[next]);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
    setTheme(next);
  };
  return { theme, toggle };
}
