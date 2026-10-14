"use client";

import { useEffect, useState } from "react";
import { THEME_KEY } from "./themeKey";

type Theme = "light" | "dark";

export function resolvedTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Current theme (null until mounted) and a toggle that remembers the choice in this browser. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    const sync = () => setTheme(resolvedTheme());
    const first = setTimeout(sync, 0);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", sync);
    return () => {
      clearTimeout(first);
      mq.removeEventListener("change", sync);
    };
  }, []);
  const toggle = () => {
    const next: Theme = resolvedTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
    setTheme(next);
  };
  return { theme, toggle };
}
