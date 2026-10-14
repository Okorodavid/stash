"use client";

import { useEffect, useState } from "react";

/** Current unix time in seconds, updated every `everyMs` (keeps renders pure and countdowns live). */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [everyMs]);
  return now;
}
