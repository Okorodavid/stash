# Brag Plan: Stash

## What is this app?
Stash is a dollar savings vault (Tempo, with Base and Solana pots) where a thief who steals your login still can't drain it: small amounts move instantly up to a daily limit, anything bigger waits 24 hours in the open while guardians get a Telegram alert and can cancel or freeze.

## The angle
**A heist trailer where the heist fails.** We set up the classic crypto horror story — someone has your key — and then let the product's own drain simulation play out as the "heist," move by move. Every big move hits a wall: BLOCKED, WAITING, STOPPED. The thief walks away with lunch money. The drama is real (it's the app's actual sim copy), the payoff is the summary screen: *Thief got $50. Still safe $950.*

## Hook (first 2-3 seconds)
Black screen. Red, heavy, all caps: **"SOMEONE HAS YOUR KEY."** A small mono line under it: `owner key · vault 0x7a3f…c91e · $1,000.00`. Dread before anything else happens.

## Key moments (the middle)
- **The ordinary wallet dies instantly**: a bar labelled "Ordinary wallet" slams to 100% stolen in red. "One transaction. Gone." Then: "This one is a Stash vault."
- **The thief's moves, one card at a time** (real DrainSim timeline cards, 🦹 avatar, status pill):
  1. "Sends all $1,000.00 to their own wallet" → **Blocked** ("Big amounts can't leave instantly.")
  2. "Takes the instant maximum: $50.00" → **Went through** (red — honesty sells it)
  3. "Queues a withdrawal of the other $950.00" → **Waiting** ("Has to wait 24h.")
  4. "Raises the limits to $1 billion and cuts the wait to 1 hour" → **Waiting**
- **The guardian enters**: divider "A guardian gets the Telegram alert", Telegram-style alert chip, then 🛡️ cards "Cancels the $950.00 withdrawal" → **Stopped**, "Freezes the vault" → **Stopped**.

## Outro / punchline
The DrainSim summary card: **Thief got $50.00** (red) / **Still safe $950.00** (teal). Bars: Stash vault 5% stolen vs Ordinary wallet 100% stolen. Then the title card: **STASH** — "Save in dollars. A stolen password can't drain it." Small footer: Tempo · Base · Solana.

## User flow worth showing
Thief has the owner key → runs the attack against the vault (each call blocked / waiting) → guardian gets the alert, cancels and freezes → summary: most of the money is still safe. This is the app's real `/drain` screen; the centerpiece scenes recreate it.

## Tone
- Preset: cinematic
- Creative direction: heist trailer where the heist fails
- Interpretation: big, dark, serious type and tension in the opening; the product UI cards play it straight; the payoff lands with a confident teal release instead of an explosion. Restraint over spectacle — it's a safety product.

## Format: landscape — 1920x1080
## Duration: ~21.5s

## Visual identity (from the project — dark theme)
- Background: #0c0a09
- Card: #1c1917, border/line: #292524
- Text: #f5f5f4, muted: #a8a29e
- Accent (safe): #2dd4bf (on-accent text #042f2e)
- Danger: #f87171
- Warn (waiting): #fbbf24
- Display font: Geist (semibold, tight)
- Body font: Geist; mono details in Geist Mono
- Strongest visual element: DrainSim timeline cards with rounded status pills (accent/10, warn/10, danger/10 tints) and the "% stolen" comparison bars

## Share copy (draft)
Someone stole the login to a Stash vault. They got $50. Here's the replay.

## Audio direction
- Role: cinematic support — tense opening, steady pulse through the attack, release on the payoff
- Music: `happy-beats-business-moves-vol-9-by-ende-dot-app.mp3` (114.84 BPM), low under the hook, rising into the attack, fade at outro
- Music treatment: start ~-18dB under the hook, lift to bed level by Scene 3, 1.2s fade-out at the end
- Music cue guidance: preset read. Strong cues at 3.70 / 4.23 (reveal "This one is a Stash vault"), 6.34 (first thief card), 10.54 / 12.65 (guardian entrance / freeze). Beat grid ~0.52s; card reveals snap to every 3rd beat (~1.6s apart) so each card holds long enough to read.
- Audio-reactive treatment: subtle — teal glow behind the final logo breathes with the bed; nothing during the hook
- SFX posture: sparse-to-moderate, motion-matched
- Audio-coupled moments: low impact on hook text; whoosh/thud as ordinary-wallet bar fills; soft UI click per thief card plus a dull "denied" tick on Blocked pills; notification ping for the Telegram alert; clean confirm tone on Stopped; single resolved hit on the logo
- Restraint rule: no alarm sirens, no glitch spam, no sound on every pill — the product is calm, the sound should be too by the end

## Storyboard

### Scene 1 — Hook — 3.0s (0.0–3.0)
Black (#0c0a09). "SOMEONE HAS YOUR KEY." slams in, red-tinted white, huge caps; holds ~1.8s settled. Mono subline fades in: `owner key · vault 0x7a3f…c91e · $1,000.00`.
Sequential/interaction: none
Audio intent: dread; low hit on the slam
Audio-coupled idea: low impact on headline land
Music: very low, barely there
Transition mood: hard cut → Scene 2

### Scene 2 — The ordinary wallet — 3.5s (3.0–6.5)
Label "Ordinary wallet" with a bar that fills 0→100% red, "100% stolen". Caption: "One transaction. Gone." Then (~4.3s, on cue) the bar recedes and a teal line replaces it: "This one is a Stash vault."
Sequential/interaction: bar fill
Audio intent: the cliché bad outcome, then a pivot
Audio-coupled idea: swoosh/thud on the bar fill; small accent on the pivot line
Transition mood: dramatic wipe → Scene 3

### Scene 3 — The heist attempt — 6.5s (6.5–13.0)
Recreated DrainSim screen: title "What if someone stole the login?" small at top, then 4 thief cards slide up one by one (~1.5s apart), each with 🦹 avatar, "THIEF" eyebrow, title, detail, and a pill: Blocked (teal), Went through (red), Waiting (amber), Waiting (amber). Each card holds; all four remain on screen (stacked, earlier ones dim slightly). Big overlay word optional per card? No — the cards are the content.
Sequential/interaction: yes — 4 cards arrive one by one, each pill pops ~0.3s after its card
Audio intent: tension pulse
Audio-coupled idea: UI click per card, muted "denied" tick on Blocked, faint coin-ish tick on Went through
Transition mood: clean slide (cards scroll up) → Scene 4

### Scene 4 — The guardian — 4.0s (13.0–17.0)
Divider "A guardian gets the Telegram alert" with a Telegram-style notification chip ("⚠️ Large withdrawal queued on your Stash vault"). Then two 🛡️ GUARDIAN cards: "Cancels the $950.00 withdrawal" → Stopped; "Freezes the vault" → Stopped.
Sequential/interaction: yes — alert chip, then 2 cards one by one (~1.3s apart)
Audio intent: turn of the tide
Audio-coupled idea: notification ping on the chip, confirm tone on each Stopped
Transition mood: soft crossfade with scale → Scene 5

### Scene 5 — Payoff + title — 4.5s (17.0–21.5)
Summary card: "Thief got $50.00" (red) | "Still safe $950.00" (teal, counts up). Bars: Stash vault 5% stolen, Ordinary wallet 100% stolen. Holds ~2s. Then cut to logo: **STASH**, tagline "Save in dollars. A stolen password can't drain it.", footer "Tempo · Base · Solana". Hold ~1.8s with teal glow.
Sequential/interaction: count-up on "Still safe"
Audio intent: release, confidence
Audio-coupled idea: single resolved hit on the logo; music fades out
Transition mood: end

**Music mood for this video:** cinematic-tense into confident
**Audio summary:** a quiet, uneasy start, a steady pulse through the failed heist, a notification ping that turns it around, and one clean hit on the Stash logo.
