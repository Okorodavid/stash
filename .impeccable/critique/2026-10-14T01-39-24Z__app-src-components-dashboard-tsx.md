---
target: Stash dashboard redesign
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:C:\\Users\\Uche\\Desktop\\colosseum hackathon\\app\\src\\components\\Dashboard.tsx"
target_fingerprint: "sha256:b8fe3e80098cd27aab46e363aa4b91127702e7cb4b7e40cfb9c6b9c03a5eefda"
target_path: "C:\\Users\\Uche\\Desktop\\colosseum hackathon\\app\\src\\components\\Dashboard.tsx"
timestamp: 2026-10-14T01-39-24Z
slug: app-src-components-dashboard-tsx
---
Method: dual-agent (A: design review · B: detector + technical audit). Both judged from source; browser inspection unavailable to sub-agents.

Heuristics 26/40 (Acceptable, up from 23): status 3, real-world 3, control 3, consistency 2, error prevention 3, recognition 2, efficiency 2, minimalism 2, error recovery 3, help 3.
Audit 15/20 (Good, up from 10): a11y 3, perf 3, responsive 3, theming 3, integrity 3. Detector: 0 findings.

Priority issues:
- [P1] Create-vault modal status/error tints sit on transparent dialog over backdrop: 1.58/1.33:1 in light (Dashboard.tsx:124-127).
- [P1] Hero ring shows full allowance ($100 of $100) on a $0 vault; reads as money (Dashboard.tsx:310-387).
- [P1] Home lacks single focus: Save, Send, Save-from-wallet full forms stacked; Send ~2 screens down.
- [P1] HoldButton: AT double-tap may send detail>=1 click, no confirm; confirm unmount drops focus to body.
- [P2] Feedback split: pot/goal/swap flows use inline busy/error, no receipts; receipts incl. freeze instructions auto-dismiss in 9s; live regions on display:contents.
- [P2] line-strong borders 2.0-2.5:1 (<3:1); mobile active tab by colour only; DrainSim text-warn on tint 4.2-4.4.
- [P2] Savings total excludes Growth until Pots opened; Growth (no guardians) counted under "protected" framing.
- [P3] Address book unused in Send; when() past-date bug; timeLeft 60m rollover; Other preset keeps hidden value; safe-area env() ineffective without viewportFit cover.
