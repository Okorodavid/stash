# Hyperframes Composition Brief: Stash

## Objective
Create a short launch-style brag video for Stash.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: ~21.5 seconds

## Source Material
- Project root: `C:\Users\Uche\Desktop\colosseum hackathon`
- Primary files read: `README.md`, `app/src/app/globals.css`, `app/src/app/layout.tsx`, `app/src/components/Intro.tsx`, `app/src/components/DrainSim.tsx`, `app/src/lib/drainSim.ts`, `app/src/components/Dashboard.tsx`, `app/worker/telegram.ts`
- Product name: Stash
- Tagline / strongest claim: "Save in dollars. A stolen password can't drain it."
- Key UI to recreate: the `/drain` simulation timeline (thief/guardian cards with status pills) and its summary card (Thief got / Still safe + "% stolen" bars)
- Copy that must appear verbatim:
  - "What if someone stole the login?"
  - "Sends all $1,000.00 to their own wallet" / "Big amounts can't leave instantly." / Blocked
  - "Takes the instant maximum: $50.00" / "Within today's instant limit, so it goes through." / Went through
  - "Queues a withdrawal of the other $950.00" / "Has to wait 24h." / Waiting
  - "Raises the limits to $1 billion and cuts the wait to 1 hour" / "Loosening the rules waits 24h too, so any guardian can cancel it." / Waiting
  - "A guardian gets the Telegram alert"
  - "Cancels the $950.00 withdrawal" / Stopped; "Freezes the vault" / "Nothing can leave until the owner and a guardian they've had for a while both agree." / Stopped
  - "Thief got" / "Still safe"; "Stash vault … 5% stolen", "Ordinary wallet … 100% stolen"
  - "Save in dollars. A stolen password can't drain it."

## Creative Direction
- Tone preset: cinematic
- Creative direction: heist trailer where the heist fails
- Interpretation: heavy, dark, all-caps hook; product cards play it straight; release into calm teal confidence.
- Angle: a thief has your key; replay the app's own drain simulation move by move; every big move hits a wall; the thief leaves with $50.
- Hook: "SOMEONE HAS YOUR KEY." on near-black.
- Outro: summary card → STASH wordmark + tagline + "Tempo · Base · Solana".
- Avoid: generic SaaS language, abstract filler, alarm-siren clichés, redesigning the UI.

## Visual Identity
- Background #0c0a09, card #1c1917, line #292524
- Text #f5f5f4, muted #a8a29e
- Accent #2dd4bf, danger #f87171, warn #fbbf24
- Display/body: Geist (Google Fonts), mono: Geist Mono
- Cards: rounded-2xl, 1px line border; pills rounded-full with 10% tint of their tone colour

## Storyboard
See `brag-output/brag-plan.md`.
1. Hook — 3.0s — "SOMEONE HAS YOUR KEY." + mono vault line
2. Ordinary wallet — 3.5s — bar to 100% stolen, "One transaction. Gone." → "This one is a Stash vault."
3. Heist attempt — 6.5s — 4 thief cards one by one
4. Guardian — 4.0s — Telegram alert chip + 2 guardian Stopped cards
5. Payoff + title — 4.5s — summary card, then STASH wordmark

## Audio
- Audio role: cinematic support
- Audio arc: quiet unease → steady pulse → ping turns the tide → one clean hit on the logo
- Music: `happy-beats-business-moves-vol-9-by-ende-dot-app.mp3`, low at start, fade out last ~1.2s
- Music cue guidance: `~/.claude/skills/brag/assets/music/cues/happy-beats-business-moves-vol-9-by-ende-dot-app.music-cues.json` — strong cues 4.23 (pivot line), 6.34 (first thief card), 12.65 (guardian section). Thief cards on every 3rd beat.
- Audio-reactive treatment: subtle teal glow behind the final wordmark breathes with RMS.
- Audio-coupled moments: hook impact; bar-fill thud; card slides; denied tick on Blocked; ping on Telegram chip; confirm on Stopped; bell on logo.
- SFX analysis guidance: `~/.claude/skills/brag/assets/sfx/sfx-analysis.md`
- Exact SFX choice: decided after the animation exists.
- Audio files copied into `brag-output/composition/assets/`.

## Hyperframes Instructions
Hyperframes domain skills are not installed on this machine; implementation follows `npx hyperframes docs` (data-attributes, compositions, gsap) for hyperframes v0.8.133. `hyperframes check` is the gate before render.
