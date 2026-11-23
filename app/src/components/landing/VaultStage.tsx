"use client";

import { useEffect, useRef, useState } from "react";
import { LogoMark } from "../Logo";
import type { Sign } from "./vault";

// Start fetching the 3D code as soon as this file runs in the browser, not after the page hydrates.
const loadVault = typeof window === "undefined" ? null : import("./vault");

/** How far through its story the vault is once it has shut and locked (see story() in vault.ts). */
const LOCKED = 0.7;
const INTRO_MS = 2400;

/**
 * The homepage vault. It shuts and locks by itself on load; after that the page's scroll drives it:
 * at each `[data-stop]` section it rolls in, swings open on that section's `data-show` sign, shuts and rolls on.
 * three.js loads after first paint, so the words never wait for it.
 */
export default function VaultStage() {
  const host = useRef<HTMLDivElement>(null);
  // "loading" shows nothing (the vault fades in when ready); "failed" (no WebGL) shows the still mark.
  const [state, setState] = useState<"loading" | "live" | "failed">("loading");

  useEffect(() => {
    const el = host.current!;
    let stop = () => {};
    let gone = false;
    loadVault!.then(({ create, story, clamp }) => {
      if (gone) return;
      let vault: ReturnType<typeof create>;
      try {
        vault = create(el);
      } catch {
        return setState("failed");
      }
      setState("live");
      const stops = [...document.querySelectorAll<HTMLElement>("[data-stop]")];
      const last = stops.length - 1;
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      let intro = still ? LOCKED : 0;

      /** Where the page is, in stops: whole numbers are a section at the top, halves are between two. */
      const place = () => {
        const y = scrollY;
        for (let i = last; i > 0; i--) {
          const top = stops[i].offsetTop;
          if (y >= top) return i;
          const prev = stops[i - 1].offsetTop;
          if (y >= prev) return i - 1 + (y - prev) / (top - prev);
        }
        return 0;
      };
      const draw = () => {
        const f = still ? last : place();
        const i = clamp(Math.round(f), 0, last), c = f - i; // c: -0.5 rolling in .. 0 at the stop .. 0.5 rolling out
        const box = el.getBoundingClientRect();
        // On a phone the vault sits in the middle, so it slides right as the door opens to keep the door on screen.
        const room = innerWidth < 768 ? innerWidth * 0.13 : 0;
        let x = 0;
        if (c > 0.3 && i < last) x = ((c - 0.3) / 0.2) ** 2 * (innerWidth - box.left + 40);
        if (c < -0.3 && i > 0) x = -(((-c - 0.3) / 0.2) ** 2) * (box.right + 40);
        vault.show((stops[i].dataset.show as Sign | undefined) ?? "coins");
        if (i === 0) {
          const s = story(intro, 0);
          return vault.set({ ...s, x, shift: room * (1 - s.door) });
        }
        // Feature stops swing wide open to show what is inside, then shut before rolling on.
        const open = i === last ? 0 : 0.85 * Math.cos((clamp(Math.abs(c) / 0.3) * Math.PI) / 2);
        vault.set({ door: 1 - open, lock: 1 - clamp(open * 6), spin: -360 * open, x, shift: room * open });
      };

      let frame = 0;
      const ask = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(draw);
      };
      let timer = 0, introFrame = 0; // the intro keeps its own frame so scrolling can't cancel it
      if (!still) {
        addEventListener("scroll", ask, { passive: true });
        timer = window.setTimeout(() => {
          const start = performance.now();
          const tick = (now: number) => {
            intro = LOCKED * clamp((now - start) / INTRO_MS);
            draw();
            if (intro < LOCKED) introFrame = requestAnimationFrame(tick);
          };
          introFrame = requestAnimationFrame(tick);
        }, 400);
      }
      addEventListener("resize", ask);
      draw();
      stop = () => {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        cancelAnimationFrame(introFrame);
        removeEventListener("scroll", ask);
        removeEventListener("resize", ask);
        vault.dispose();
      };
    });
    return () => {
      gone = true;
      stop();
    };
  }, []);

  return (
    // Sized and placed to clear the header: centred on phones, right of the words on wide screens.
    <div className="pointer-events-none fixed left-1/2 top-24 z-1 -translate-x-1/2 md:left-auto md:right-[clamp(-24px,3vw,72px)] md:top-[calc(50%+2rem)] md:translate-x-0 md:-translate-y-1/2">
      <div className="relative size-[min(62vw,38svh)] md:size-[min(44vw,calc(100svh-12rem),640px)]">
        {state === "failed" && <LogoMark size={160} className="absolute inset-0 m-auto opacity-30" />}
        <div ref={host} className={`absolute inset-0 transition-opacity duration-500 ${state === "live" ? "opacity-100" : "opacity-0"}`} />
      </div>
    </div>
  );
}
