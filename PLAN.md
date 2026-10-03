# Stash — Build Plan (Crypto World's Fair)

> Working name. Deadline: **Oct 12, 2026, 11:59pm PT** — we submit by **noon PT Oct 12**.
> Primary track: **Tempo**. Also integrated: **Base** and **Solana** (Solana keeps us in line for Colosseum's accelerator/fund).

## The pitch (one line)

**A dollar savings app that can't be drained: your everyday dollars live on Tempo, your savings earn on Base, and your "Growth" pot earns on Solana — all behind one login, daily limits, and time-locked withdrawals any of your guardians can cancel.**

Target market: **anyone in the world** who wants to save in dollars and not lose it to theft — especially people whose local currency is losing value. No country-specific features in the core product; local on-ramps plug in per region later.

## Each chain has one job

Users never pick a chain. The app routes money to whichever chain is best for the job.

| Chain | Job in the app | Why this chain | What we use |
|---|---|---|---|
| **Tempo** (home) | Main dollar account: hold, send, receive, timelocked vault | Payments chain: free/sponsored fees, passkeys, stablecoin-native, OUSD just launched | OUSD, our Solidity vault, fee sponsorship, Privy |
| **Base** | "Save" pot — steady yield | Deep DeFi lending (Morpho), Coinbase users and on-ramp | Same Solidity vault, USDC, curated Morpho ERC-4626 vault (deposited **from inside** the vault, so the Save pot stays protected) |
| **Solana** | "Growth" pot — higher yield | Reflect's Protected tranche lives here (if live and isolated from USDC+'s Drift loss); otherwise deep Solana lending (Kamino) | Reflect tranche API **or** Kamino USDC vault, Squads spending limit |

## Competitors and user pain

Research done 2026-10-02 (Trustpilot, app stores, tech press, news). Nobody combines global dollar savings + user-controlled anti-drain + multichain yield in one app.

| Overlap | Products | Rating snapshot |
|---|---|---|
| Local-currency/dollar goal savings (regional apps, e.g. Nigeria) | PiggyVest (Flex Dollar), Cowrywise, Risevest, Bitnob, Busha Yield | Trustpilot: PiggyVest 3.4, Cowrywise 4.6, Bitnob 2.9; Busha app stores ~4.5 |
| Stablecoin neobanks/savings (global) | Plasma One, KAST, Lulo, Solid, ether.fi Cash | KAST 2.5 (60% one-star), Plasma One 4.2 |
| Anti-drain wallets | Argent/Ready, Coinbase Vault, Safe, Squads Fuse, Ambire | Loopring (2025) and Daimo (Jan 2026) shut down; Argent split off its Ethereum wallet |

**Most frequent complaints → our answer**

| # | Complaint | Our answer |
|---|---|---|
| 1 | "I can't get my money out": withdrawals stuck/failed; Coinbase Vault holds of 7+ days | Daily allowance is instant; anything bigger shows a live countdown; withdrawals visible onchain |
| 2 | Sudden freezes, endless KYC re-checks (KAST, Cowrywise, Rise, Nexo) | Self-custody: nobody at Stash can freeze you. Only the user's own guardians can freeze, and the user sets the rules |
| 3 | Support that never answers | Every pending action has in-app status; fewer things need support |
| 4 | Hidden fees, bad FX rates, surprise debits | Show all fees and the local-currency rate vs market before confirming |
| 5 | Yield bait-and-switch (Plasma One "10%+" → ~3.9%; Coinbase cuts) | Show the live rate per pot, never "up to X%" |
| 6 | Shutdowns and bans (Loopring, Daimo, Risevest/Binance crackdowns) | Open-source contracts + exit page that works without Stash |
| 7 | Recovery lockouts; single guardian hacked (Loopring ~$5M) | Up to 3 guardians; Stash guardian kept separate from login |
| 8 | Drained anyway via approvals/phishing/front end (Bybit $1.5B via Safe UI) | No arbitrary approvals/calls; over-limit outflows always timelocked |
| 9 | Yield protocol behind the product gets hacked → funds frozen, partial payback (Reflect USDC+: ~$1.95M lost in the Apr 2026 Drift exploit, mint/redeem frozen ~3 months, buyback at 0.20 USDC + 80 Reflect Credits per USDC+) | Our vault stops thieves, **not** protocol hacks — so: cap each pot, spread savings across pots, show in the app which protocol each pot depends on and its history. Tempo home account holds plain OUSD (no yield protocol) |

Pitch line: **"Dollar safety you control" — not an APY pitch.** Second line: "Stash stops thieves, and spreads your savings so no single protocol hack wipes you out."

## Scope

**Must ship**
1. One login (Privy, email/Google) → user gets a Tempo/Base address and a Solana address.
2. **Vault contract (Solidity) on Tempo**: daily limit, timelocked large withdrawals, multiple guardians (any one can cancel/freeze), timelocked policy loosening, savings goals with early-break fee.
3. **Same vault deployed on Base**, with "Save" pot depositing into a curated Morpho vault via the vault's own `depositToYield` (shares stay inside the vault, so limits/timelock still protect them). Privy Earn is not used here: it deposits from the user's wallet, outside the vault's protection.
4. **Solana "Growth" pot** via Reflect's Protected tranche **only if** Reflect confirms it's live and separate from USDC+'s Drift loss; otherwise a curated Kamino USDC vault. **USDC+ is not a fallback** (frozen since the Apr 2026 Drift exploit).
5. One dashboard showing all three pots in dollars.
6. Drain-simulation demo on Tempo.
7. **Auto-save from another wallet** (Tempo/Base): "save $X every day/week from wallet Y into goal Z".
8. **Guardian setup** in onboarding: Stash guardian on by default, then prompt to add a second phone and/or a trusted person.
9. **Exit page**: a static, open-source page (hosted on GitHub Pages/IPFS, no Stash backend) that lets a user withdraw straight from their vault using only a public RPC — "even if Stash disappears, your money gets out." **Requires a recovery key the user controls**: onboarding must include "save your recovery key" (Privy key export into a wallet like MetaMask/Rabby), or the user signs up with their own wallet. The exit page only connects browser wallets; it never asks for a pasted key. Built: `exit/index.html`.
10. **Pot safety info + caps**: each pot shows the protocol it depends on, its curator/history and the live rate. Default cap: Growth pot ≤ 50% of a user's savings, set in the app (raising it is a user choice, with a plain-language warning).

**Should ship**
- Telegram guardian alerts with a Cancel button (sent to every guardian).
- In-app "Move to Growth / Move to Save" using Privy's `/transfer` bridging (supports Tempo) or Relay — otherwise users fund each pot directly.
- Squads spending limit on the Solana Growth wallet (anti-drain on Solana without writing a Rust program).

**Won't ship (roadmap slide)**
- **Auto-save from a bank** — needs a licensed on-ramp partner. Design: partner issues each user a dedicated bank account number → user sets a standing order in their bank app → partner converts to stablecoin → sends to the user's Tempo virtual address → credited to their vault. Show as designed flow + "next step" in the pitch; do not fake it in the demo.
- Auto-save from a Solana wallet (SPL delegate approval) into the Growth pot.
- Group savings circles (ajo/esusu), Amplified tranche, private balances via Tempo Zones, audit.

## Architecture

```
                 One app (Next.js PWA) + Privy login
        ┌───────────────────┼─────────────────────────┐
        ▼                   ▼                         ▼
     TEMPO (home)          BASE                     SOLANA
  StashVault clones     StashVault clones        Privy Solana wallet
  holding OUSD          holding USDC              + Squads spending limit
  limits/timelock/      Save pot →                Growth pot →
  guardian/goals        Morpho vault (in-vault)   Reflect tranche / Kamino
        │                   │                         │
        └──────── events → worker → Telegram guardian alerts ┘
```

### Vault contract (Solidity, Foundry) — one codebase, two chains

Must stay **ERC-20/TIP-20 only** — Tempo has no native token (`msg.value` and `BALANCE` always return 0).

- `StashFactory` deploys a minimal-proxy clone (EIP-1167) per user — isolates each user's funds and keeps deployment cheap (Tempo charges 5–10x Ethereum for contract bytes and new storage).
- `StashVault` (per user):
  - Policy: `owner`, `guardians` (set, max 3), `dailyLimit`, `largeThreshold`, `timelock`, `frozen`.
  - **Guardians** — up to 3 per vault, any one is enough to press "Stop". Three kinds:
    1. **Stash guardian** (on by default): a service key held by our worker, **separate from Privy login and the frontend** — one breach must not give an attacker both the user's account and the guardian (Loopring lesson: its official guardian was hacked, ~$5M drained from wallets that had no other guardian).
    2. **Second device** the user owns (own passkey, not tied to the SIM).
    3. **Trusted person** (family/friend) — the strongest option: catches scams where the user is the one being tricked.
  - `withdraw(token, to, amount)` — instant if under remaining daily limit and below threshold.
  - `requestWithdrawal` → `executeWithdrawal` after timelock; `cancelWithdrawal` (owner or **any** guardian); `approveWithdrawal` (any guardian) **does not** skip the timelock — it only lets the owner execute once the timelock passes (avoids "keys stolen" instant drain).
  - `freeze` (owner or any guardian), `unfreeze` (owner + one guardian).
  - `addGuardian` — immediate (tightening). `removeGuardian` — timelocked (loosening); any guardian can cancel the removal. Removing the last guardian is not allowed.
  - `proposePolicy` / `applyPolicy` — tightening immediate, loosening timelocked.
  - **No generic `execute`/`call` and no user-controlled `approve`.** The vault only moves funds through its own functions. Token approvals go only to pot adapters on an allowlist set at deploy (e.g. the Morpho vault on Base); adding to the allowlist is timelocked. This closes the "signed a malicious approval and got drained" hole that transfer limits alone don't cover.
  - Guardian actions (`cancel`, `freeze`) must stay cheap and simple (no external calls) so they work even if fee sponsorship is off.
  - Goals: `createGoal`, `fundGoal`, `withdrawGoal` (fee before maturity).
  - Auto-save: `authorizeAutoSave(token, amount, interval, goalId)` called **by the source wallet** (after it `approve`s the vault); `pullAutoSave(source)` is **permissionless** (our worker calls it, but anyone can) — pulls exactly `amount` if `now ≥ nextAt`, then `nextAt = now + interval` (no catch-up of missed periods). Funds can only land in this vault. `revokeAutoSave` by owner or source.
  - **No admin/owner-of-protocol function can move user funds.**
- Same bytecode deployed to Tempo (Moderato testnet → mainnet) and Base (Sepolia → mainnet).

### Tests that must pass
- Stolen-owner-key attacker can move at most the daily limit per 24h.
- Attacker cannot raise limits / remove guardian before the timelock.
- Guardian cannot withdraw; guardian + owner keys stolen still can't skip the timelock.
- Multiple guardians: any single guardian can cancel a pending withdrawal or freeze; `unfreeze` needs owner + one guardian; attacker with the owner key can't remove a guardian before the timelock (and any other guardian can cancel the removal); the last guardian can't be removed.
- No approval drain: the owner key cannot approve an arbitrary spender or make an arbitrary call; only allowlisted pot adapters ever receive an approval; adding an adapter is timelocked.
- Front-end compromise: any outflow above the daily limit lands in the timelock queue no matter what the UI showed when it was signed.
- Exit without Stash: with our backend and frontend switched off, a user can withdraw from their vault using only the exit page + a public RPC (run as a scripted test against the testnet deployment).
- Fees off: with sponsorship disabled, owner withdrawals and guardian cancel/freeze still succeed with the signer paying its own fee in stablecoin.
- Goal early-break fee charged; matured goal free.
- Auto-save: pulls only the set amount, at most once per interval, never catches up missed periods, only into this vault; cannot pull from a wallet that didn't authorize it; stops after revoke.

## Integrations and risks

| Integration | Status / risk | Fallback |
|---|---|---|
| Privy (login, embedded EVM + Solana wallets) | Supports Tempo, Base, Solana; OUSD first-class | — |
| OUSD on Tempo | Live since Sept 30; testnet OUSD from faucet | pathUSD / USDC.e |
| Morpho vault (Save pot) | Pick a curated USDC vault on Base; pass it as `DEFAULT_YIELD_TARGETS` at factory deploy | Leave Save pot as plain USDC in the vault |
| Reflect (Growth pot) | Closed beta; tranche endpoints on dev API only. USDC+ lost ~$1.95M in the Apr 1 2026 Drift exploit; mint/redeem frozen; Jul 2026 recovery = 0.20 USDC + 80 Reflect Credits per USDC+. Tranche status unconfirmed. **Use only if Reflect confirms tranches are live, isolated from Drift, and gives API access by end of Day 3.** | Kamino USDC vault (directly or via Privy Earn). Not USDC+. |
| Protocol hack risk (all yield pots) | The vault can't protect against the yield protocol itself being hacked (Drift → Reflect, Stream → Morpho) | Pot caps, spread across pots, show dependencies; pick curated vaults with blue-chip collateral; disclose in app and pitch |
| Relay bridge (moving between pots) | Verify Tempo + Solana routes on Day 1 | Users fund each pot directly |
| Squads (Solana spending limit) | Verify spending-limit API on Day 4 | Show Solana Growth pot without limits; disclose |
| Fee sponsorship (Tempo/Base) | Unknown how long it lasts. Day 1: check if it's paid by us (lasts while we fund it) or a Tempo/Privy subsidy (can end anytime) | Sponsorship is a toggle; fallback = user pays a sub-cent fee in stablecoin from their balance. Guardian wallets keep a few cents for fees. Pitch says "we cover fees today", never "free forever". |
| Morpho vault risk (Save pot) | Nov 2025 Stream xUSD collapse left ~$285M bad debt in some Morpho vaults | Pick a curated vault with blue-chip collateral only; name the vault + curator in the app |

**Ask Colosseum on Discord (Day 1):** can a multichain submission be considered for more than one ecosystem track? Pick "Tempo" as primary regardless.

## Speed budget (users are on mid-range Android + mobile data)

- First screen visible in **< 2s on slow 4G**; initial JS for the home screen **< 200 KB**.
- Server-rendered home screen (Next.js) showing last known balance instantly, refreshed in the background.
- Chain SDKs lazy-loaded: Solana/Reflect code only on the Growth pot, Base/Earn code only on the Save pot.
- Optimistic UI: taps on Save/Send respond in < 100 ms; Tempo's ~0.5s blocks confirm right after.
- Installable PWA with cached app shell (instant reopen, works on weak connections).
- One backend endpoint aggregates balances across Tempo/Base/Solana (one request instead of many).
- Test with Chrome DevTools "Slow 4G" + mid-range phone profile before every deploy.

## Stack

- **Contracts:** Solidity + Foundry (Tempo has a Foundry guide), OpenZeppelin `Clones` + `SafeERC20`.
- **Frontend:** Next.js PWA, `viem`/`wagmi` with Tempo's viem extension, `@solana/kit`, Privy.
- **Solana:** Reflect tranche REST API (if approved) or Kamino SDK; Squads SDK.
- **Worker:** Node + grammY Telegram bot; listens to vault events on Tempo/Base.

## Schedule

| Day | Date | Build | Users / submission |
|---|---|---|---|
| 1 | Thu Oct 2 | Run Colosseum Copilot; Foundry + Next.js scaffold; Privy app with Tempo/Base/Solana; check who pays Tempo fee sponsorship | DM Reflect for access; ask Colosseum Discord about multi-track; interview 5 savers |
| 2 | Fri Oct 3 | ✅ Done early (Oct 2): vault + factory + 35 tests incl. multi-guardian, veto, auto-save, goals, yield adapters | Pick the Morpho USDC vault on Base |
| 3 | Sat Oct 4 | Timelock queue, multi-guardian cancel/approve/add/remove, freeze, timelocked policy, adapter allowlist; tests | **Reflect checkpoint**: tranches live + isolated from Drift + API access? If not → switch Growth pot to Kamino |
| 4 | Sun Oct 5 | Goals + break fee + auto-save logic; tests; deploy to Tempo testnet + Base Sepolia | Start early-user group (20+) |
| 5 | Mon Oct 6 | Frontend: login, Tempo account, send/receive, pending queue, auto-save setup | Weekly update video #1 |
| 6 | Tue Oct 7 | Base Save pot (Morpho via vault) + Solana Growth pot (Reflect) | — |
| 7 | Wed Oct 8 | Unified dashboard; daily auto-save worker; Telegram alerts; drain-simulation screen | Build-in-public clip of drain demo |
| 8 | Thu Oct 9 | Mainnet deploy (Tempo + Base) with deposit cap; Solana mainnet Growth; exit page live + "exit without Stash" test | Onboard first real users |
| 9 | Fri Oct 10 | Fix feedback; Relay "move between pots" if time | Collect quotes + numbers |
| 10 | Sat Oct 11 | README, diagrams, freeze features | Pitch video + demo video (≤3 min each) |
| 11 | Sun Oct 12 | Buffer only | **Submit by noon PT** |

Cut order if behind: Relay bridging → Squads limit → Telegram alerts → auto-save worker (keep the contract function, trigger manually in demo) → Base Save pot. **Never cut:** Tempo vault + tests (incl. multi-guardian + no-approval-drain), exit page, Solana Growth pot (accelerator leg), demo video.

## Traction (parallel, judges weight it heavily)

- Goal: **25+ real users** with small real deposits by Oct 12, plus quotes.
- Post daily on X tagging @colosseum and @tempo; submit weekly one-minute update videos.
- Track: signups, depositors, total saved per pot, withdrawals cancelled by guardians.

## Submission checklist (from Colosseum's FAQ)

- [ ] Product name, short description, logo
- [ ] Blockchains used: Tempo (primary), Base, Solana — plus Privy, Morpho, OUSD, and Reflect or Kamino
- [ ] Team backgrounds + location
- [ ] Public GitHub repo; disclose any pre-hackathon code
- [ ] 2–3 min pitch video (judges watch this first)
- [ ] ≤3 min product demo video
- [ ] Go-to-market, demand validation, distribution plan
- [ ] Disclose: unaudited, capped deposits

Judging factors per FAQ: founder-market fit, insight, product + execution (shipping speed), market size, communication, viability, **traction**.

## Open decisions

1. ~~Target market~~ — decided: global. For traction and the pitch, still useful to name the first communities you'll recruit users from.
2. Team — solo or teammates?
3. Name — "Stash" is a placeholder.
