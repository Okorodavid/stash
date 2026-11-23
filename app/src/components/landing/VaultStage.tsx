"use client";

import { useEffect, useRef, useState } from "react";
import { LogoMark } from "../Logo";
import type { Sign } from "./vault";

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
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = host.current!;
    let stop = () => {};
    let gone = false;
    import("./vault").then(({ create, story, clamp }) => {
      if (gone) return;
      let vault: ReturnType<typeof create>;
      try {
        vault = create(el);
      } catch {
        return; // no WebGL: the still mark stays
      }
      setLive(true);
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
        let x = 0;
        if (c > 0.3 && i < last) x = ((c - 0.3) / 0.2) ** 2 * (innerWidth - box.left + 40);
        if (c < -0.3 && i > 0) x = -(((-c - 0.3) / 0.2) ** 2) * (box.right + 40);
        vault.show((stops[i].dataset.show as Sign | undefined) ?? "coins");
        if (i === 0) return vault.set({ ...story(intro, 0), x });
        // Feature stops swing wide open to show what is inside, then shut before rolling on.
        const open = i === last ? 0 : 0.85 * Math.cos((clamp(Math.abs(c) / 0.3) * Math.PI) / 2);
        vault.set({ door: 1 - open, lock: 1 - clamp(open * 6), spin: -360 * open, x });
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
    <div className="pointer-events-none fixed left-[60%] top-16 z-1 -translate-x-1/2 md:left-auto md:right-[clamp(-24px,3vw,72px)] md:top-1/2 md:translate-x-0 md:-translate-y-1/2">
      <div className="relative size-[min(70vw,42vh)] md:size-[min(46vw,84vh,660px)]">
        {!live && <LogoMark size={160} className="absolute inset-0 m-auto opacity-30" />}
        <div ref={host} className="absolute inset-0" />
      </div>
    </div>
  );
}
