# World Cup Predictions — Technical Implementation Plan

## Scope Guards
- Keep current stack (React + existing UI system + Firestore integration).
- No new libraries unless blocked on a core requirement.
- Reuse existing `ToastProvider` / `useToast`; do not install new toast libraries unless this system is proven insufficient.
- Reuse existing Firestore schema and current data files.
- No persistence model migration in this roadmap.
- UI/layout/copy/navigation/information changes only.
- Toast placement standard: fixed top-right stack across the app (desktop + tablet) so toasts never cover `Save + Next` or section primary CTAs.
- Toast triggers must be wired to existing async success/error callbacks (Firestore writes and existing export generation promises) with no schema changes.
- Maintain existing multi-theme support (`Light`, `Dark`, `System`) for all new UI in this plan.
- All new UI (toasts, rivalry strip, trend/race cards, social badges including `Contrarian`) must use existing theme tokens/variables only; no hardcoded hex/rgb colors.
- Social signal components must pass legibility checks in all three theme modes.

## Increment 0 — Baseline, Feature Flags, and QA Harness

### Tasks
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I0-T1 | Add top-level UI feature flags for `navSimplification`, `playSocialSignals`, `leaderboardStory`, `adminConsoleTabs`, `exportsOutcomeFirst` in existing config/constants. | Flags can be toggled in dev/demo mode and sections appear/disappear without runtime errors. | None |
| I0-T2 | Add route-level smoke checklist comments in page files for manual QA anchors (no runtime behavior change). | Each target page has a visible QA anchor section in source and mapped checklist IDs. | None |
| I0-T3 | Add temporary “phase badge” label in page headers when a feature flag is active (dev/demo only). | Header shows active phase badge in demo mode; hidden in default mode. | I0-T1 |
| I0-T4 | Create manual test script markdown section at end of this file with page-by-page checks. | QA can run checks without opening code context. | None |
| I0-T5 | Define a shared toast contract doc block in UI guidelines: placement, max visible count, tone mapping, and trust-signal fields (`entityCount`, `durationMs` when available). | All new toast tickets in this plan reference the same contract and render position. | None |

### Cleanup
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I0-C1 | Remove all temporary phase badges before final release flag flip. | No phase badges visible in production mode. | I0-T3 |
| I0-C2 | Remove any legacy page-level toast position overrides so all toasts use the global top-right placement contract. | Toasts render in one consistent location across routes. | I0-T5 |

### Completion Checklist
- [x] I0-T1 complete
- [x] I0-T2 complete
- [x] I0-T3 complete
- [x] I0-T4 complete
- [x] I0-T5 complete
- [ ] I0-C1 deferred until final release flag flip
- [x] I0-C2 complete

---

## Increment 1 — Navigation Simplification and Play-First Structure

### Tasks
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I1-T1 | Update left nav: keep `Play` and `League` as primary player items; remove direct `Picks`, `Group Stage`, `Bracket` nav entries from default player nav. | Sidebar shows only `Play` + `League` under main for player flow. | I0-T1 |
| I1-T2 | Add Play Center internal sub-navigation (tabs/segmented control): `Match Picks`, `Group Stage`, `Knockout`, `All Picks`. | User can switch sections inside Play without using sidebar. | I1-T1 |
| I1-T3 | Standardize detail-page back CTA copy to `Back to Play Center` and route target to `/play` (and demo equivalent). | All detail pages return to Play Center with consistent label. | I1-T1 |
| I1-T4 | Move low-frequency section actions (`Schedule`, diagnostic links) into overflow menu in Play Center section headers. | Only one primary action visible per section; secondary actions in overflow. | I1-T2 |
| I1-T5 | Add contextual section counters in Play subnav labels (e.g., `Match Picks (16)`). | Tab labels show dynamic pending counts and update after save. | I1-T2 |

### Cleanup
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I1-C1 | Remove obsolete quick-menu code paths and unused nav item constants for player detail pages, plus any touched inline success hints now replaced by global toasts. | No dead nav entries/unreachable render branches and no duplicate inline success microcopy on touched nav surfaces. | I1-T1, I1-T2 |

### Completion Checklist
- [x] I1-T1 complete
- [x] I1-T2 complete
- [x] I1-T3 complete
- [x] I1-T4 complete
- [x] I1-T5 complete
- [x] I1-C1 complete

---

## Increment 2 — Play Center Cognitive Load Reduction + Fast Entry Flow

### Tasks
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I2-T1 | Replace multi-button cluster in Match Picks with single primary CTA `Next pending pick` + overflow actions. | Match Picks shows one primary CTA and optional overflow; no button cluster. | I1-T4 |
| I2-T2 | Add triage filter chips in Match Picks list: `Closing soon`, `Unpicked`, `Live`, `High swing`, `All`. | Clicking each chip updates visible list state correctly. | I1-T2 |
| I2-T3 | Compact row status: replace duplicated pills with one status token + one deadline token per row/card. | Each row has max 2 status elements; visual density reduced. | I2-T2 |
| I2-T4 | Add sticky urgency banner at top of Play Center: nearest lock time + countdown + pending count. | Banner always visible on scroll and updates on interval tick. | I1-T2 |
| I2-T5 | Standardize Play save toasts for all pick mutations (`Save`, `Save + Next`, batch apply): show top-right toast success/error from existing save callbacks; success copy must include trust signal metadata (`Saved N picks`, optionally `in Xs` for batch). | Every pick mutation emits one top-right toast; no toast overlaps primary CTA; success toasts include item count and include duration when measurable. | I2-T1, I0-T5 |
| I2-T6 | Add keyboard hints for rapid pick entry (hint row only in first pass): `↑/↓ move`, `Enter save+next`. | Hint row visible in pick panel and matches behavior labels. | I2-T1 |
| I2-T7 | Apply theme-token styling for Play social/action surfaces (`Rivalry strip`, `Contrarian` badge, urgency banner, save toasts) and verify no hardcoded color literals are introduced. | New Play social/toast elements render legibly in Light, Dark, and System modes and use only existing semantic tokens. | I3-T1, I0-T5 |

### Cleanup
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I2-C1 | Remove deprecated status chip variants and old button cluster copy keys. | No stale chip/button variants rendered in Play Center. | I2-T1, I2-T3 |
| I2-C2 | Remove subtle inline save feedback text (`Saved just now`-style labels/banners) superseded by toast contract on Play flows. | Save feedback appears via toasts only (except persistent error states), with no duplicate inline success labels. | I2-T5 |
| I2-C3 | Remove any color-specific one-off classes introduced during Play updates and replace with existing theme token classes/variables. | No hardcoded color classes/literals remain in touched Play Center components. | I2-T7 |

### Completion Checklist
- [x] I2-T1 complete
- [x] I2-T2 complete
- [x] I2-T3 complete
- [x] I2-T4 complete
- [x] I2-T5 complete
- [x] I2-T6 complete
- [x] I2-T7 complete
- [x] I2-C1 complete
- [x] I2-C2 complete
- [x] I2-C3 complete

---

## Increment 3 — Social Hooks and Emotional Signals (No Schema Changes)

### Tasks
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I3-T1 | Add Play Center rivalry strip using existing leaderboard data: `You`, `Above`, `Below`, point gaps. | Rivalry strip appears on Play and updates with leaderboard refresh. | I1-T2 |
| I3-T2 | Add consensus indicator on match pick cards using existing picks snapshot aggregation (`Most picked: TEAM X%`). | Each open match card shows consensus line when data is available. | I2-T2 |
| I3-T3 | Add `Contrarian` badge when user pick differs from consensus winner. | Badge appears/disappears based on current pick selection. | I3-T2 |
| I3-T4 | Add optional collapsible friend-activity panel using existing `updatedAt` from user picks docs/files. | Panel lists recent pick updates with relative timestamps; collapses by default. | I3-T1 |
| I3-T5 | Add momentum microcopy in Play hero (`You gained +N rank since last update` / fallback copy). | Hero text changes with ranking delta state; fallback shown when delta unavailable. | I3-T1 |

### Cleanup
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I3-C1 | Remove placeholder mock activity text and keep only computed/fallback activity states, plus remove touched inline success hints replaced by global toasts. | No hardcoded demo-only activity strings and no duplicate inline success hints on social panels. | I3-T4 |

### Completion Checklist
- [x] I3-T1 complete
- [x] I3-T2 complete
- [x] I3-T3 complete
- [x] I3-T4 complete
- [x] I3-T5 complete
- [x] I3-C1 complete

---

## Increment 4 — Leaderboard Storytelling and Actionability

### Tasks
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I4-T1 | Add rank movement column (`↑`, `↓`, `—`) based on previous snapshot comparison (existing leaderboard snapshots only). | Table shows movement indicator for every visible row. | I3-T1 |
| I4-T2 | Replace low-value metric card content with `Race update`: leader gap, nearest rival gap, swing opportunity count. | Top summary cards include race narrative values. | I4-T1 |
| I4-T3 | Add `Path to Top 3` panel with target points and CTA `Improve next round` linking to Play Center. | Panel visible for current user and CTA routes to `/play`. | I1-T1 |
| I4-T4 | Add row emphasis states for `You`, `Closest above`, `Closest below`. | Three highlighted row styles render distinctly and persist on pagination. | I4-T2 |
| I4-T5 | Add expandable `What to pick next` hint block that references upcoming highest-swing matches from existing match list. | Expand/collapse works; list shows top swing opportunities. | I2-T2 |

### Cleanup
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I4-C1 | Remove duplicated summary values that mirror table totals without extra insight, plus remove any touched inline status confirmations replaced by toasts. | No redundant top-card metrics and no duplicate inline success confirmations on leaderboard actions. | I4-T2 |

### Completion Checklist
- [x] I4-T1 complete
- [x] I4-T2 complete
- [x] I4-T3 complete
- [x] I4-T4 complete
- [x] I4-T5 complete
- [x] I4-C1 complete

---

## Increment 5 — Unified Admin Console (Tabs, Not New Backend)

### Tasks
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I5-T1 | Add single admin entry in sidebar: `Admin Console` (admin-only). | Sidebar admin section contains one destination in non-demo and demo modes. | I1-T1 |
| I5-T2 | Build admin console tab shell with tabs: `Players`, `Exports`, `Demo Controls` reusing existing page components. | Switching tabs loads existing content blocks in one shell without route errors. | I5-T1 |
| I5-T3 | Update tab URL query/hash state (`?tab=players|exports|demo`) for deep-linking within admin console. | Reload preserves selected tab. | I5-T2 |
| I5-T4 | Players: replace persistent left editor with row-triggered drawer/modal editor. | Roster table gets wider; edit panel opens on row action. | I5-T2 |
| I5-T5 | Demo Controls: simplify timestamp copy to one local timestamp + relative duration line. | Raw timestamp clutter removed; human-readable timing visible. | I5-T2 |
| I5-T6 | Add role-update toasts for all player mutations (add player, role toggle, edit submit): use existing write callbacks and emit success/error in top-right; include trust signal (`N players updated`). | Every player mutation emits exactly one success/error toast with entity count where applicable. | I5-T2, I0-T5 |

### Cleanup
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I5-C1 | Remove deprecated standalone admin nav item wiring (`Players`, `Exports`, `Controls`) from default menu config and remove inline admin success banners superseded by toast contract. | Old admin nav entries no longer render and admin mutations show toasts instead of duplicate inline success banners. | I5-T1, I5-T2, I5-T6 |

### Completion Checklist
- [x] I5-T1 complete
- [x] I5-T2 complete
- [x] I5-T3 complete
- [x] I5-T4 complete
- [x] I5-T5 complete
- [x] I5-T6 complete
- [x] I5-C1 complete

---

## Increment 6 — Export System Revamp (Outcome-First Presets)

### Tasks
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I6-T1 | Replace `Mode 1/Mode 2` copy with outcome-first presets: `User picks workbook`, `Matchday picks workbook`, `Matchday leaderboard snapshot`, `Full audit pack`. | Exports UI shows preset cards with concrete outcomes, no abstract modes. | I5-T2 |
| I6-T2 | Add preset summary panel showing included sheets/columns before download. | Selecting a preset updates visible included-data preview. | I6-T1 |
| I6-T3 | Add field preview drawer/table per preset (`Columns included`, `Row source`, `Date scope`). | Clicking `Preview fields` opens drawer with schema preview. | I6-T2 |
| I6-T4 | Add export lifecycle toasts in global top-right placement: `Preparing`, `Downloaded`, `Failed`, driven by existing export promise callbacks; success toast must include trust signal metadata (`Exported N rows`, generation time when measurable). | Every export action emits lifecycle toasts in top-right; success includes row count and duration (if available); toasts never overlap primary export CTA. | I2-T5, I0-T5 |
| I6-T5 | Add lightweight export history panel in-session (current browser session only): preset, timestamp, status, file name. | Export history list updates after each export and supports re-run with prefilled preset. | I6-T1 |
| I6-T6 | Move infrequent options under `Advanced exports` disclosure and keep one primary action per preset. | Default export screen shows concise preset actions; advanced options collapsed. | I6-T1 |
| I6-T7 | Apply theme-token styling for Admin/Exports additions (preset cards, field preview, export toasts, status chips) with explicit Light/Dark/System checks. | Admin/Exports new UI remains legible and visually consistent across all three theme modes without hardcoded colors. | I6-T1, I6-T4 |

### Cleanup
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I6-C1 | Remove all `Mode 1/Mode 2` labels, constants, and dead conditional branches from exports UI layer, plus remove inline export completion labels superseded by toast lifecycle. | Codebase contains no mode-centric framing and no duplicate inline export-success labels. | I6-T1, I6-T4 |
| I6-C2 | Remove any hardcoded color literals/classes introduced in Admin/Exports updates; keep only existing theme tokens/variables. | No hardcoded color literals remain in touched Admin/Exports components. | I6-T7 |

### Completion Checklist
- [x] I6-T1 complete
- [x] I6-T2 complete
- [x] I6-T3 complete
- [x] I6-T4 complete
- [x] I6-T5 complete
- [x] I6-T6 complete
- [x] I6-T7 complete
- [x] I6-C1 complete
- [x] I6-C2 complete

---

## Increment 7 — Global Progress & Momentum System

Context: This phase leverages `@radix-ui/react-progress` to address the sterile dashboard and subtle feedback issues identified in the audit.

### Tasks
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I7-T1 | Progress Component Design (CVA): define a shared multi-intent Progress component with `intent` variants: `default`, `momentum` (glow), `warning` (locks), `success`. | New Progress component renders all intent variants and is reusable across pages without style duplication. | I0-T5 |
| I7-T2 | Play Center Integration: replace text-based `picks made` counters with the shared Progress component. | Play Center shows visual progress bars for pick completion instead of plain text counters. | I2-T1, I7-T1 |
| I7-T3 | Admin Batch Feedback: add progress bars to Unified Admin Console bulk operations (member updates, reload jobs, batch actions). | Admin bulk flows display progress bars during active operations and final completion state. | I5-T2, I7-T1 |
| I7-T4 | Toast Contract Expansion: embed mini-progress bars in global toasts for long-running exports and similar async tasks. | Long-running export toasts display a compact progress indicator in top-right toast stack and settle to success/error states. | I6-T4, I7-T1 |

### Cleanup
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I7-C1 | Remove legacy loading spinners and inline percentage text replaced by the shared Progress system. | No duplicate spinner + percent text patterns remain where shared Progress is now used. | I7-T1, I7-T2, I7-T3, I7-T4 |

### Completion Checklist
- [x] I7-T1 complete
- [x] I7-T2 complete
- [x] I7-T3 complete
- [x] I7-T4 complete
- [x] I7-C1 complete

---

## Increment 8 — Final UI Cleanup and Consistency Pass

### Tasks
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I8-T1 | Normalize CTA copy across app to outcome-first phrasing (`Continue picking`, `Open Play Center`, `Download workbook`). | Button labels are consistent and action-oriented across Play, Leaderboard, Admin. | I1-T2, I6-T1 |
| I8-T2 | Normalize empty/loading/error state templates for new panels (social strip, activity feed, field preview, rivalry cards). | Each new panel has consistent fallback UI state. | I3-T4, I6-T3 |
| I8-T3 | Accessibility pass for new controls: keyboard order, focus ring visibility, aria labels on tabs/overflow. | Keyboard-only traversal works for all new controls; no focus traps. | I1-T2, I5-T2 |
| I8-T4 | Visual regression check for desktop breakpoints used in screenshots and common tablet width. | No overlap/truncation on target breakpoints. | I8-T1 |
| I8-T5 | Theme toggle verification pass for all new UI surfaces (Play social signals, toasts, leaderboard story cards, admin export presets) across `Light`, `Dark`, and `System`. | All new elements stay legible, semantically colored, and consistent when switching themes; no unreadable text/badge states. | I2-T7, I6-T7 |

### Cleanup
| ID | Task (exact change) | Verifiable output | Dependencies |
|---|---|---|---|
| I8-C1 | Remove feature flags that are fully rolled out and delete stale fallback render paths, including any lingering inline success microcopy replaced by global toast behavior. | Final UI runs without temporary branches or duplicate inline success microcopy. | All prior increments |

### Completion Checklist
- [x] I8-T1 complete
- [x] I8-T2 complete
- [x] I8-T3 complete
- [x] I8-T4 complete
- [x] I8-T5 complete
- [x] I8-C1 complete

---

## Manual Verification Matrix (Independent Checks)

### Play Center
- Rivalry strip renders with `You`, `Above`, `Below` values.
- Urgency banner shows nearest lock and pending count.
- Match pick rows show compact status + deadline only.
- Primary CTA is single-action; secondary options are in overflow.
- Save action shows top-right toast success/error and includes trust-signal metadata (`Saved N picks`) on batch operations.
- Toast stack never obscures `Save + Next` button at common desktop/tablet breakpoints.
- `Rivalry strip`, `Contrarian` badge, and Play toasts remain legible in Light, Dark, and System modes.

### Leaderboard
- Movement indicators render per row.
- `Path to Top 3` panel appears for current user.
- `Race update` card includes leader gap + nearest rival gap.
- `Improve next round` CTA routes to Play Center.

### Admin Console
- Sidebar shows only `Admin Console` under admin tools.
- Tabs switch among Players, Exports, Demo Controls in one shell.
- URL preserves selected tab on refresh.
- Players editor opens in drawer/modal, not persistent side panel.
- Player add/edit/role updates emit top-right success/error toasts with entity-count trust signal.

### Exports
- No `Mode 1/Mode 2` copy appears.
- Preset cards use outcome-first names.
- `Preview fields` opens schema/detail panel.
- Export action emits top-right `Preparing/Downloaded/Failed` toasts with row count and generation time when available.
- Advanced options are behind disclosure.
- Export preset/status/toast surfaces remain legible and theme-consistent in Light, Dark, and System modes.

---

## Dependency Order (Execution Sequence)
1. Increment 0
2. Increment 1
3. Increment 2
4. Increment 3 and Increment 4 (parallel once Increment 2 completes)
5. Increment 5
6. Increment 6
7. Increment 7
8. Increment 8

## Definition of Done
- All increments completed with cleanup tasks executed.
- No mode-centric export framing remains in UI.
- Play Center is primary player workflow with reduced nav complexity.
- Social/rivalry and momentum cues visible without schema changes.
- Admin functions live inside unified Admin Console tabs.
- Toast behavior is consistent top-right across the app with trust-signal metadata on pick, role, and export mutations.
- New UI components use existing theme tokens only and pass Light/Dark/System legibility checks.
- Manual verification matrix passes in default and demo mode.

## Increment 0 Manual Smoke Script
- Open `/play`; verify page header renders with no phase badge.
- Open `/demo/play`; verify page header also renders with no phase badge.
- Open `/play/picks`, `/play/group-stage`, `/play/bracket`, `/play/league`; verify each page still loads and has QA-SMOKE comment anchors in source.
- Open `/admin/players`, `/admin/exports`, `/demo/admin/controls`; verify each page still loads and has QA-SMOKE comment anchors in source.
- Trigger any existing toast action (for example, save in demo control or picks flow); verify toast stack appears top-right.
- Trigger more than 4 toasts quickly; verify stack caps at 4 and oldest toast is evicted.
