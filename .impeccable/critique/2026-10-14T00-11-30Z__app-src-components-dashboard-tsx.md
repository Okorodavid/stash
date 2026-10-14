---
target: Stash dashboard redesign
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 4
target_identity: "file:C:\\Users\\Uche\\Desktop\\colosseum hackathon\\app\\src\\components\\Dashboard.tsx"
target_fingerprint: "sha256:b59451611dbab91b079486a0fcef35d92bea5f4c5466d25c930105741eb35cac"
target_path: "C:\\Users\\Uche\\Desktop\\colosseum hackathon\\app\\src\\components\\Dashboard.tsx"
timestamp: 2026-10-14T00-11-30Z
slug: app-src-components-dashboard-tsx
---
Method: dual-agent (A: design review · B: detector + technical audit)

Heuristics 23/40 (Acceptable): status 2, real-world match 2, control 3, consistency 2, error prevention 3, recognition 2, efficiency 2, minimalism 2, error recovery 2, help 3.
Audit 10/20: a11y 1, perf 3, responsive 2, theming 2, integrity 2. Detector: 0 findings (exit 0).

Priority issues:
- [P0] Guardian "Stop it" white on dark --danger = 2.77:1 (GuardianView.tsx:73). Add --danger-fg / btnDanger.
- [P0] Freeze is hold-only; screen readers (click-only) can never freeze (HoldButton.tsx). Add click => confirm fallback, describedby, live announce.
- [P1] Feedback far from action, no success receipts; Status at top of column, no aria-live (Dashboard.tsx:121-128,184).
- [P1] Allowance ring unlabeled, no refill info, arc still drawn when frozen, aria-hidden (Dashboard.tsx:277-301).
- [P1] ~20 placeholder-only inputs, no headings, modals without focus mgmt, no :focus-visible styles, light warn/accent tints 3.7-4.4:1.
- [P1] Theme: boot script defaults dark ignoring OS; theme-color/manifest not synced (layout.tsx:26, manifest.ts).
- [P2] Home/Pots overloaded; 5 tabs; protection status absent from mobile Home; xl two-column Send/Save cramped (Dashboard.tsx:196).
- [P2] Guardians/recipients shown as hex only; chain toggle in hero reloads app.
- [P2] Touch targets <44px; no aria-pressed on preset pickers; unguarded motion; HoldButton setState per frame.
- [P3] Copy drift (password/key/login/seedphrase; vault/wallet), raw hours in GuardianView, duplicated helpers.
