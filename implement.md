# Group Stage Results Prediction Implementation Plan

Decision logged:
- Group-stage correctness for 1st/2nd is exact order only.
- Best 3rd-place qualifiers are orderless membership across exactly 8 selected teams.
- Scores are computed offline daily via GitHub Actions; UI shows last published snapshot + timestamp.
- Main leaderboard is frozen for group-stage scoring until group stage completion; only the Projected Group Stage Impact (as of snapshot) panel updates daily during group stage.

## Guiding Principles + Non-Goals
Guiding principles:
1. Trust-first UX: no contradictory states between what users see and how points are calculated.
2. Lock integrity: post-lock behavior must be deterministic and enforceable.
3. Edits are allowed only before the group-stage lock deadline; after lock, Group Stage remains view-only for the remainder of the group stage (even while matches are ongoing).
4. Scoring semantics are explicit and fixed: Group 1st/2nd correctness is exact placement, while Best-3rds correctness is orderless membership across 8 picks.
5. Scoring cadence is explicit and fixed: scores are computed offline daily via GitHub Actions; UI shows the latest published snapshot (no real-time scoring).
6. Group-stage leaderboard freeze is explicit: main leaderboard standings do not apply group-stage scoring updates until group stage completion; intra-stage movement is shown only as projected impact (as of snapshot).
7. Demo parity: scenario switching should reliably reflect scenario data, not stale local edits.
8. Ship small: each increment independently testable and releasable.

Constraints restated:
- Keep stack as-is (React 18 + TS + Vite, Router v6, Tailwind, shadcn/Radix, Firebase/Firestore, Node scripts, GitHub Actions).
- Keep current theming and tokens.
- No Firestore schema migrations.
- Demo mode remains localStorage/sessionStorage-only for writes.

Non-goals (out-of-scope):
- Redesigning match-by-match picks flows.
- Redesigning knockout bracket picks flows.
- Deep changes to tournament data model.
- Real-time scoring pipelines, realtime score subscriptions, or intra-day live leaderboard recomputation.

## EPICS Overview
| Epic | Outcome |
|---|---|
| EPIC 1: Correctness + Integrity | Resolve scoring/status mismatches, lock enforcement gaps, misleading freshness signals |
| EPIC 2: Demo Parity + Route Safety | Eliminate scenario bleed and demo-context escapes |
| EPIC 3: Group Stage UX Overhaul | Deliver compact table-first UX with merged predicted+published-actual cells, inline editing, functional filters, right-side projected impact panel, and stronger best-3rds interactions |
| EPIC 4: Leaderboard Attribution + Final Results Mode | Make group-stage and best-3rd points auditable; add post-completion view-only final recap on the Group Stage route |
| EPIC 5: Social/Gamification Layer | Increase engagement via rivalry, deltas, and shareable moments |
| EPIC 6: Observability + QA | Add funnel telemetry, manual smoke checklists, and unit regression guardrails with demo parity checks |

## URL Parameter Contract — Group Stage
Purpose:
- The Group Stage page uses URL query parameters as the source of truth for UI filter state.
- URL state represents view state only (never data state).
- All filters must be deep-linkable, reload-safe, back/forward compatible, and optional with clean defaults.

Base route:
- `/play/group-stage`
- Example: `/play/group-stage?group=A&focus=1st&status=pending`
- Example (Best 3rd section): `/play/group-stage?view=best3&group=all&focus=all&status=all`
- Example (Impact panel): `/play/group-stage?view=impact&group=all&focus=all&status=all`

Supported parameters:
1. `group`
- Controls which groups are visible.
- Values: `A`-`L` (single group), `all` (default).
- Examples: `?group=A`, `?group=all`.
- Rules: missing defaults to `all`; invalid falls back to `all`.

2. `focus`
- Controls placement emphasis/filtering.
- Values: `all` (default), `1st`, `2nd`.
- Meaning:
- `all` shows full table and corresponds to UI placement label `Both`.
- `1st` emphasizes first-place predictions on desktop and hides non-focused placement columns on mobile.
- `2nd` emphasizes second-place predictions on desktop and hides non-focused placement columns on mobile.

3. `status`
- Filters rows by evaluation state.
- Values: `all` (default), `pending`, `final`, `correct`, `incorrect`, `locked`.
- Rules: display filtering only; must never affect scoring logic.
- `locked` is derived from the lock deadline only; `final` is derived from published snapshot finality only.
- Row-level semantics (Option A, least complexity): non-`all` status applies to the group row only when both 1st and 2nd placement outcomes satisfy the selected state (for example, `correct` means both placements are exact correct).

4. `view`
- Controls layout mode.
- Values: `groups` (default), `best3`, `impact`.
- Meaning:
- `groups` focuses the main group table.
- `best3` scrolls/focuses the Best 3rd picker.
- `impact` focuses the right-side Projected Group Stage Impact (as of snapshot) panel.

5. `points` (optional toggle)
- Controls inline points visibility.
- Values: `on`, `off` (default).
- Example: `?points=on`.

Default URL behavior:
- If no params exist, behavior is `/play/group-stage?group=all&focus=all&status=all&view=groups`.
- The app should not rewrite the URL unless the user changes filters.

State synchronization rules:
- URL params are the single source of truth.
- UI controls read from URL on load.
- UI interactions update URL immediately.
- Back/forward navigation restores UI state.
- Do not persist filters in Firestore.
- Local storage may be used only as fallback for mobile navigation restoration.
- URL params take precedence over any localStorage fallback when both exist.

Shareability requirement:
- Copying the URL must reproduce filters, selected view, highlighted section, and inline points visibility.
- URL must not encode edit mode state, unsaved picks, or temporary UI overlays.

Accessibility + mobile note:
- Mobile navigation interprets URL params identically to web.
- Changing mobile tabs/segments updates query params.

## Published Snapshot Inputs Contract (Conceptual)
Purpose:
- Define the minimum published snapshot inputs required by UI logic without changing schemas.

Required conceptual inputs:
- `snapshotTimestamp`: display-only “as of” timestamp.
- `groupStageComplete`: boolean gate for official leaderboard inclusion and Group Stage Final Results mode availability.
- `groupFinalityByGroup` (or equivalent): per-group finality used for Potential/Pending vs Confirmed/Final rendering.
- `bestThirdsFinality`: boolean gate for best-3rds final resolution behavior.
- `projectedGroupStagePointsByUser`: projected points source used only by the Projected Group Stage Impact (as of snapshot) panel.

Source constraint:
- Inputs may be derived from existing published artifacts/docs/records; do not require Firestore migrations.

## Group Stage Snapshot Resolver (internal concept)
Use a single resolver/view-model module as the source of truth for group-stage rendering and scoring state.
- Computes per-group finality and 1st/2nd chips: `Pending`/`Locked`/`Correct (Exact)`/`Incorrect`.
- Computes merged predicted + published actual placement state: `Potential/Pending` vs `Confirmed/Final`.
- Computes best-3rds validation (exactly 8) and membership correctness: `Qualified`/`Missed`/`Pending`.
- Propagates `snapshotTimestamp` to all group-stage and scoring surfaces.
- Computes projected group-stage deltas used only by the Projected Group Stage Impact (as of snapshot) panel.

## Prioritized Backlog
| ID | Title | User value | Scope | Impacted files/modules | Acceptance criteria | Effort | Risk | Deps |
|---|---|---|---|---|---|---|---|---|
| GS-001 | Pending rows never show “Actual” | Prevent false confidence | Guard actual labels by finality state | `src/ui/pages/GroupStagePage.tsx` | Pending rows display no “Actual …” text before outcomes are final; chip language is limited to Pending/Locked in pre-final states for both default and demo modes; no view implies intra-day live scoring resolution before the next published snapshot | S | Low | None |
| GS-002 | Enforce exact-order group chips and daily-snapshot scoring copy | Make chip meaning unambiguous | Standardize group 1st/2nd chip semantics and supporting help text | `src/ui/pages/GroupStagePage.tsx`, `src/lib/scoring.ts`, `src/ui/pages/LeaderboardPage.tsx` | Group chips use Pending/Locked/Correct (Exact)/Incorrect; Correct requires predicted 1st team finished 1st and predicted 2nd team finished 2nd; swapped top-two placements are Incorrect; copy explicitly sets expectation that scores refresh daily from published snapshots; demo mode uses identical chip meaning; UI derives states from the resolver (no duplicate per-page computations) | M | Medium | GS-001 |
| GS-003 | Unify best-3rds membership semantics + published snapshot finality | Consistent membership-only correctness across views | Use one resolver for selection validation, finality, and correctness evaluation | `src/ui/pages/GroupStagePage.tsx`, `src/lib/scoring.ts`, `src/lib/data.ts` | Best-3rds enforces exactly 8 selected teams; correctness is Qualified vs Missed by membership only; no ordering-based correctness logic appears in UI/scoring/help copy; finality reflects the latest published daily snapshot (not realtime progression); default and demo behavior match; UI derives states from the resolver (no duplicate per-page computations) | M | Medium | GS-001 |
| GS-004 | Enforce group-stage lock in backend and client save path | Fair play integrity | Add lock-aware write constraints and client rejection handling | `firestore.rules`, `src/ui/hooks/useGroupStageData.ts`, related save callers | Post-lock writes are rejected; UI shows deterministic lock error state | M | High | GS-003 |
| GS-005 | Correct freshness signals for picks vs scoring snapshots | Accurate freshness trust signal | Distinguish user-picks freshness from scoring snapshot freshness | `src/ui/pages/GroupStagePage.tsx`, `src/ui/pages/LeaderboardPage.tsx`, `src/ui/hooks/useGroupStageData.ts`, scoring snapshot source adapters | Group-stage header shows picks freshness; leaderboard/scoring surfaces show published snapshot timestamp from existing snapshot metadata (`lastUpdated` in published files/records or existing build metadata); no schema changes; copy includes “Scores refresh daily” on web and mobile; during group stage, leaderboard copy explicitly states group-stage scoring is frozen until completion | S | Low | None |
| GS-006 | Scenario-scoped demo local keys for picks/bracket | Reliable demo scenario parity | Include scenario id in demo local keying and migration | `src/lib/picks.ts`, `src/lib/bracket.ts`, `src/ui/hooks/usePicksData.ts`, `src/ui/hooks/useGroupStageData.ts` | Switching scenario never reuses picks/group edits from another scenario | M | Medium | None |
| GS-007 | Auto-reconcile demo data when scenario changes | Remove manual cleanup friction | Trigger safe reset/reload of demo local prediction state on scenario changes | `src/ui/pages/DemoControlsPage.tsx`, `src/ui/lib/demoStorage.ts`, route listeners | Apply Scenario yields deterministic scenario data without manual clear-session | M | Medium | GS-006 |
| GS-008 | Mode-aware leaderboard CTA routing | Prevent demo escape | Replace hardcoded `/play` with mode-aware route helper | `src/ui/pages/LeaderboardPage.tsx` | In demo mode, “Open Play Center” navigates to `/demo/play` | S | Low | None |
| GS-009 | Compact table-first group stage surface + functional filters (read-only phase) | Faster scan and lower friction | Rework Group Stage Detail as compact web-first table with mobile variant, merged predicted+published-actual inline cells, and working filters | `src/ui/pages/GroupStagePage.tsx`, `src/ui/components/ui/Table.tsx`, filter state helpers | Filters work end-to-end: Group (A–L/All), Placement (`Both`/1st/2nd mapped to `focus=all|1st|2nd`), Status (All/Pending/Final/Correct (Exact)/Incorrect/Locked), and Best-3rds view toggle (`view=best3`) for jump-to-section behavior; on desktop focus emphasizes selected placement while retaining context, on mobile focus hides non-focused placement columns for compactness; status is row-level (both placements must satisfy selected state); merged cell clearly differentiates Potential/Pending vs Confirmed/Final from latest published snapshot only; filter state is URL-first (shareable links + back/forward correctness) with optional local-state fallback only when URL params are absent (no schema changes); UI derives states from the resolver (no duplicate per-page computations). Must comply with URL Parameter Contract. | M | Medium | GS-001, GS-002, GS-003 |
| GS-010 | Inline row editing for 1st/2nd picks (table-native) | Reduce repetitive edit flows | Add inline editing controls directly in group rows with pre-lock save and post-lock block | `src/ui/pages/GroupStagePage.tsx`, `src/ui/hooks/useGroupStageData.ts`, row editor UI primitives | Users can edit 1st/2nd in-row without opening repetitive row-level edit flow; save is explicit and non-blocking; if user changes group/filter with unsaved inline edits, app prompts to discard before context change (no silent loss); post-lock rows are view-only and blocked consistently; mobile uses compact expandable row editor while keeping table semantics aligned | M | Medium | GS-009, GS-004 |
| GS-011 | Best-3rds bottom picker overhaul + correctness clarity | Stronger mental model and resolution clarity | Keep bottom picker as primary interaction; add inline row hints and post-final correct-set clarity strip | `src/ui/pages/GroupStagePage.tsx`, related picker/tiles UI | Bottom section enforces exactly 8 orderless picks with `Selected 8/8`; status chips are Pending/Qualified/Missed from latest published snapshot; optional inline row hint for 3rd-candidate does not create ordering score semantics; Best-3rds view toggle/link (`view=best3`) jumps focus to this bottom section; side-by-side “Correct qualifiers” strip/tile appears only when `bestThirdsFinality === true` and user selection is incorrect, and never appears in pending states | M | Low | GS-003, GS-009 |
| GS-012 | Explicit timezone lock messaging | Reduce deadline confusion | Add timezone suffix and absolute UTC+local pattern | `src/ui/pages/GroupStagePage.tsx`, `src/ui/pages/play/PlayPage.tsx`, `src/ui/pages/LeaderboardPage.tsx` | Lock/deadline chips include timezone context consistently | S | Low | None |
| GS-013 | Right-side Projected Group Stage Impact (as of snapshot) panel | Make projected movement understandable without implying realtime/live computation | Add right-side panel on Group Stage page showing projected group-stage delta/rank movement from latest published daily snapshot | `src/ui/pages/GroupStagePage.tsx`, `src/ui/lib/leaderboardContext.ts`, potential-delta helpers | Panel is explicitly snapshot-based with `as of <timestamp>` and “updates daily”; panel is labeled projected because results are not official until group stage completion; panel does not imply “if matches ended now” computation unless explicitly implemented later; current user is pinned/highlighted (`You` label, accent border, rank movement arrow, mini badge/emoji); projected deltas are group-stage-only and do not mutate official leaderboard totals intra-day; gamification hooks (biggest mover projected, perfect picks count, hot streak projected) are derived from existing data only (no schema changes); UI derives states from the resolver (no duplicate per-page computations). GS-013 ships together with GS-023 to prevent leakage of projected group-stage points into the official leaderboard. | M | Medium | GS-005, GS-009 |
| GS-023 | Enforce frozen main leaderboard during group stage | Prevent mixed “official vs projected” confusion | Gate leaderboard scoring presentation so official leaderboard excludes group-stage progression until stage completion | `src/ui/pages/LeaderboardPage.tsx`, scoring display adapters, group-stage completion resolver | While group stage is incomplete, the main leaderboard must not display group-stage points or projected group-stage points even when snapshots include projected values; main leaderboard shows clear copy (“Official group-stage scoring publishes after completion”); projected movement appears only in the Group Stage page’s Projected Group Stage Impact (as of snapshot) panel; after `groupStageComplete === true`, official group-stage scoring appears on the main leaderboard on the next published daily snapshot | M | Medium | GS-005, GS-013 |
| GS-014 | Group Stage Final Results mode (same route) | Clear final-results recap after completion without route sprawl | Make `/play/group-stage` switch modes based on completion snapshot gate | `src/ui/pages/GroupStagePage.tsx`, mode-specific Group Stage sections/components, `src/ui/nav.ts`, group-stage data adapters | When `groupStageComplete === true`, `/play/group-stage` becomes view-only Final Results mode showing picks vs final 1st/2nd, final best-3rds set, points earned, and finalized timestamp; no snapshot-browsing controls; projected impact panel is hidden/disabled in final mode; URL filters (`group`,`focus`,`status`,`points`) may continue for recap review but `view=impact` must no-op or redirect to `view=groups`; nav remains `Group Stage` (optional `Final` badge) with no dedicated `History` nav item; direct `/play/group-stage` access before completion shows in-progress mode | L | Medium | GS-011, GS-013 |
| GS-014 | Group Stage Final Results mode (same route) | Clear final-results recap after completion without route sprawl | Make `/play/group-stage` switch modes based on completion snapshot gate | `src/ui/pages/GroupStagePage.tsx`, mode-specific Group Stage sections/components, `src/ui/nav.ts`, group-stage data adapters | When `groupStageComplete === true`, `/play/group-stage` becomes view-only Final Results mode showing picks vs final 1st/2nd, final best-3rds set, points earned, and finalized timestamp; no snapshot-browsing controls; projected impact panel is hidden/disabled in final mode; in Final Results mode, the Best-3rds area renders as recap (user selection vs final qualifiers) with no selection controls; URL filters (`group`,`focus`,`status`,`points`) may continue for recap review but `view=impact` must no-op or redirect to `view=groups`; nav remains `Group Stage` (optional `Final` badge) with no dedicated `History` nav item; direct `/play/group-stage` access before completion shows in-progress mode | L | Medium | GS-011, GS-013 |
| GS-015 | Cross-link updates across Play/Group Stage/League | Better IA flow | Add quick links and contextual actions across key pages | `src/ui/pages/play/PlayPage.tsx`, `src/ui/pages/GroupStagePage.tsx`, `src/ui/pages/LeaderboardPage.tsx`, nav modules | Each core page links directly to Play, Group Stage, and League (Leaderboard); any “Final recap” CTA points to `/play/group-stage` and relies on mode-switching by completion state. Must comply with URL Parameter Contract. | M | Low | GS-014 |
| GS-016 | Group-stage social activity signals | Better friend awareness | Include group-stage/best-3rds update events in social activity feed | `src/ui/pages/play/PlayPage.tsx`, data fetch/adapters for bracket-group updates | Friend activity reflects group-stage updates, not only match picks | M | Medium | GS-013 |
| GS-017 | Group-stage gamification badges and delta copy | Engagement lift | Add non-schema badges derived from existing stats | `src/ui/pages/play/PlayPage.tsx`, `src/ui/pages/GroupStagePage.tsx`, `src/ui/lib/socialBadges.ts` | New badges render deterministically from existing snapshots | M | Low | GS-016 |
| GS-018 | Shareable Group Stage snapshot action | Viral/social loop | Add screenshot/share action from Group Stage Detail state | `src/ui/pages/GroupStagePage.tsx`, shared util module | User can copy/download a shareable summary card in 1 action | M | Medium | GS-010 |
| GS-019 | Consolidate duplicate fetches on Play Center | Faster load and fewer stale seams | Reuse fetched matches/picks data across hooks and social modules | `src/ui/pages/play/PlayPage.tsx`, `usePicksData`, `useBracketKnockoutData`, `useGroupStageData` | Play Center network requests reduced with no behavior regression; scoring-related polling/subscription assumptions are removed or avoided in favor of published daily snapshot reads | M | Medium | GS-006 |
| GS-020 | Group-stage funnel telemetry | Measure engagement quality | Emit structured events for open/edit/save/lock/confusion flows | `src/ui/pages/play/PlayPage.tsx`, `src/ui/pages/GroupStagePage.tsx`, telemetry helpers | Event payloads include `group_exact_correct_count`, `group_exact_incorrect_count`, `best_thirds_selected_count`, and `best_thirds_qualified_count`; scoring/leaderboard view events include `snapshot_timestamp`; funnel metrics are comparable across default/demo modes | S | Low | None |
| GS-021 | Manual smoke checklist + unit regression guardrails | Safer iteration | Add/maintain manual smoke checklist and targeted unit guardrails for critical group-stage flows | scripts + test harness + smoke checklist updates | Unit guardrails catch semantic regressions; manual smoke gate verifies chip states (Pending/Locked/Correct (Exact)/Incorrect), prevents pre-final “Actual …” leakage, enforces best-3rds exactly-8 membership behavior, validates demo parity, and confirms daily snapshot UX; CI scope is unit/typecheck/lint only | M | Medium | GS-001..GS-008 |
| GS-022 | Inline points + compact “why” microcopy in group rows | Increase scoring transparency in-table | Add per-row points display and optional lightweight explanation affordance in row context | `src/ui/pages/GroupStagePage.tsx`, tooltip/drawer UI primitives | Each row can show points from latest published snapshot; explanation affordance provides concise “why” (exact-order or membership basis) without new schema; copy avoids realtime implications and references snapshot timestamp context | M | Low | GS-009, GS-013 |

## Suggested Release Increments (Ship Small)
1. v1.0 Trust Fixes
- Includes GS-001, GS-002, GS-003, GS-005, GS-008.
- Goal: remove contradictory states and immediate trust breakers.
- Semantic checkpoint: v1.0 establishes exact-order group chips and orderless best-3rds membership (exactly 8 selections) as the user-facing contract.
- Snapshot checkpoint: v1.0 establishes daily published snapshot semantics, visible scoring/leaderboard `Last updated` timestamp, and explicit “Scores refresh daily” expectation-setting.

2. v1.1 Integrity + Demo Parity
- Includes GS-004, GS-006, GS-007.
- Goal: harden lock fairness and demo correctness.
- Semantic checkpoint: default and demo modes enforce identical chip meanings and best-3rds validation behavior.
- Snapshot checkpoint: any score changes observed during active matches are communicated as applying at next daily refresh.

3. v1.2 UX Clarity (Group Stage First)
- Includes GS-009, GS-012.
- Goal: ship compact table-first read-only UX with functional filters and merged predicted+published-actual cells.

4. v1.3 Inline Editing
- Includes GS-010, GS-022.
- Goal: enable inline row editing pre-lock and inline points/explanations without reverting to repetitive edit flows.

5. v1.4 Projected Group Stage Impact (as of snapshot) Panel
- Includes GS-013, GS-019, GS-023.
- Goal: add right-side projected impact panel with snapshot semantics while keeping the main leaderboard frozen during group stage.

6. v1.5 Best-3rds + Final Results Mode + Navigation
- Includes GS-011, GS-014, GS-015.
- Goal: complete improved best-3rds picker (including correct-qualifiers clarity) and deliver post-completion view-only Final Results mode on `/play/group-stage`.

7. v1.6 Engagement + QA Hardening
- Includes GS-016, GS-017, GS-018, GS-020, GS-021.
- Goal: increase replayability and finalize smoke/unit guardrails before tournament traffic peaks.

## Test Plan
QA gate = manual smoke + unit tests; no integration/E2E automation.

Unit tests (concise):
- Exact-order group semantics: 1st/2nd are only correct when placement matches exactly.
- Best-3rds semantics: exactly 8 selections; correctness is membership-only (Qualified/Missed), never order-based.
- Published snapshot semantics: scoring/finality resolvers consume latest published snapshot inputs and do not assume realtime updates.
- Lock-time and date formatting utilities used by group-stage status chips.
- Demo scenario keying/parity utilities for snapshot-mode behavior.

Manual Smoke Testing (primary QA gate):
Must comply with URL Parameter Contract.
Smoke suite tiers:
- Must-run every release: 1, 3, 4, 5, 6, 10, 11, 13, 14, 17.
- Run when touched: 2, 7, 8, 9, 12, 15, 16, 18, 19.
1. Default mode: pre-group, initial navigation and daily snapshot expectation (web + mobile)
- Preconditions: `mode=default`, group stage not started; open `Play`, `Group Stage`, `Leaderboard`.
- Steps: Load each page; inspect top-level scoring/leaderboard freshness and copy.
- Expected: Scoring/leaderboard surfaces show last published snapshot timestamp and “Scores refresh daily” expectation; no “live scoring” implication.

2. Default mode: before lock editing and save behavior (web + mobile)
- Preconditions: `mode=default`, before group lock.
- Steps: Edit multiple group 1st/2nd picks and best-3rds; save; revisit page.
- Expected: Saves persist; pick freshness updates correctly; best-3rds requires exactly 8 selections to satisfy completion messaging.

3. Default mode: lock behavior enforcement (web + mobile)
- Preconditions: `mode=default`, after group lock.
- Steps: Attempt edits/saves in Group Stage Detail.
- Expected: Read-only behavior is enforced, lock messaging is clear, and no successful post-lock mutation is implied.

4. Default mode: pending vs actual visibility (web + mobile)
- Preconditions: `mode=default`, groups not final in published snapshot.
- Steps: Review group rows and best-3rds statuses.
- Expected: Pending/Locked states do not show “Actual …” leakage before published finality; no premature resolution language.

5. Default mode: exact-order chip correctness (web + mobile)
- Preconditions: `mode=default`, published snapshot where group outcomes are final for at least one group.
- Steps: Compare picks vs final standings for both exact and swapped predictions.
- Expected: Chips are only `Pending`/`Locked`/`Correct (Exact)`/`Incorrect`; swapped top-two predictions are `Incorrect`.

6. Default mode: best-3rds membership correctness (web + mobile)
- Preconditions: `mode=default`, published snapshot includes final best-3rds qualifiers.
- Steps: Verify selected 8 teams against qualifier set.
- Expected: Best-3rds correctness is `Qualified`/`Missed` by membership only; order has no effect.

7. Default mode: leaderboard attribution and routing correctness (web + mobile)
- Preconditions: `mode=default`, published snapshot available.
- Steps: Open leaderboard attribution/help; use CTA links back to Play/Group Stage/League.
- Expected: Attribution text matches exact-order + membership semantics; no partial/close-credit phrasing; routes stay in default namespace.

8. Demo mode: scenario switching parity and snapshot boundaries (web + mobile)
- Preconditions: `mode=demo`; scenario controls available.
- Steps: Switch across `pre-group`, `mid-group`, `end-group-draw-confirmed`, `mid-knockout`, `world-cup-final-pending`; change viewer; reload snapshots.
- Expected: Scenario/viewer changes remain deterministic without stale carry-over; snapshot boundary behavior (“as of yesterday/today”) is represented via localStorage/sessionStorage controls; scoring remains latest published snapshot, not realtime.

9. Demo mode: semantic parity checks (web + mobile)
- Preconditions: `mode=demo`, at least one scenario with finalized group outcomes and best-3rds.
- Steps: Repeat checks for chips, pending/actual visibility, best-3rds membership, and leaderboard attribution.
- Expected: Chip meanings, validation rules, and scoring copy are identical to default mode.

10. Group filters correctness (web + mobile)
- Preconditions: `mode=default` and `mode=demo`, Group Stage page has mixed statuses.
- Steps: Apply each filter independently and in combination: Group selector, Placement selector, Status selector, Best-3rds toggle; refresh page and return via navigation.
- Expected: Filtered rows strictly match selected criteria; placement label `Both` maps to `focus=all`; status filtering is row-level (both placements satisfy selected state); counts and visible rows remain consistent; URL query params are the primary persisted state and are shareable; back/forward navigation reproduces the same filtered view.

11. Merged predicted+actual cell state semantics (Potential/Pending vs Confirmed/Final)
- Preconditions: one scenario with non-final rows and one with final rows in published snapshot.
- Steps: Inspect merged placement cells across 1st and 2nd columns.
- Expected: Non-final rows show Potential/Pending semantics only (no live/actual certainty); final rows show Confirmed/Final semantics only; wording never suggests realtime scoring.

12. Inline edit behavior pre-lock/post-lock
- Preconditions: pre-lock then post-lock states (default and demo).
- Steps: Edit 1st/2nd directly in table rows, save, then repeat after lock.
- Expected: Pre-lock inline edits save and reflect immediately in row UI; post-lock inline controls are disabled/read-only with clear lock explanation.

13. Right-side Projected Group Stage Impact (as of snapshot) panel semantics
- Preconditions: published leaderboard snapshot available, Group Stage page with panel enabled.
- Steps: Open panel, inspect user row and peers, compare potential deltas to current leaderboard.
- Expected: Panel shows “as of <timestamp>” and daily refresh expectation; it is clearly labeled projected (not official until group stage completion); it does not imply live “if matches ended now” computation; current user is pinned/highlighted (`You` label, accent border, movement arrow, mini badge/emoji); projected group-stage deltas do not alter persisted leaderboard totals during same day.

14. Frozen leaderboard during group stage
- Preconditions: group stage in progress (`mode=default` and `mode=demo`), published snapshot available.
- Steps: Open main leaderboard and Group Stage Projected Impact panel on same day and after next daily snapshot publish.
- Expected: Main leaderboard remains unchanged for group-stage scoring and does not show group-stage points/projected group-stage points until completion; only Projected Impact panel reflects overnight projected movement; all messaging is explicit about frozen official leaderboard vs projected movement.

15. Best-3rds bottom picker + correct-qualifiers strip
- Preconditions: one scenario pre-final and one post-final with incorrect user selection.
- Steps: Use bottom picker to select teams; verify `Selected 8/8`; after finality inspect chips and corrective strip.
- Expected: Exactly 8 orderless picks enforced; chips show Pending/Qualified/Missed based on published snapshot; when incorrect after finality, “Correct qualifiers” strip/tile appears side-by-side for clarity.

16. Group Stage Final Results mode behavior after completion
- Preconditions: scenario where group stage is complete.
- Steps: Open `/play/group-stage` and attempt edits.
- Expected: Group Stage switches to view-only Final Results mode containing group-by-group picks, final 1st/2nd, final best-3rds set, points earned, and finalized timestamp; no edit controls; no snapshot-browsing controls.

17. Invalid URL params resilience
- Preconditions: `mode=default`, Group Stage route available.
- Steps: Visit `/play/group-stage?group=Z&status=wat&points=maybe` directly.
- Expected: Page does not crash; invalid params fall back to documented defaults in UI behavior; URL is not rewritten until user performs a filter/view action; if localStorage fallback exists simultaneously, URL params take precedence.

18. Inline edit + filter interaction safety
- Preconditions: pre-lock state with inline editing enabled.
- Steps: Start editing a row without saving; change group/focus/status filter or group selector.
- Expected: App prompts user to discard unsaved inline edits before applying filter change; if confirmed, filter change proceeds and unsaved edits are discarded intentionally; no silent loss.

19. Completion-mode guard for `view=impact`
- Preconditions: `groupStageComplete === true` in latest published snapshot.
- Steps: Visit `/play/group-stage?view=impact` directly.
- Expected: Projected Group Stage Impact panel is not shown in Final Results mode; query either no-ops or normalizes to `view=groups` while remaining on `/play/group-stage`.

Demo Parity Smoke Matrix (manual):
| Demo scenario | Assertions to verify manually |
|---|---|
| `pre-group` | Pending/Locked semantics only; no “Actual …” leakage; scores presented as last published snapshot with daily refresh expectation |
| `mid-group` | Mixed pending states remain unresolved until published finality; no realtime scoring implication; routing remains in `/demo/*` |
| `end-group-draw-confirmed` | Exact-order group correctness resolves properly where final; best-3rds membership resolves as Qualified/Missed; exactly-8 selection semantics remain clear |
| `mid-knockout` | Group-stage semantics remain stable while later stages progress; scoring still presented as daily published snapshot |
| `world-cup-final-pending` | Finality messaging remains snapshot-based; no pending rows falsely show “Actual …”; attribution text and timestamp remain consistent |

## Observability Plan (Engagement + Funnel Health)
Use existing event channel pattern (`wc-ui-event`) and send to analytics sink.

Core events:
- `group_stage_viewed`
- `group_stage_edit_opened`
- `group_stage_pick_changed`
- `group_stage_saved`
- `group_stage_save_blocked_locked`
- `best_third_explainer_opened`
- `leaderboard_attribution_opened`
- `leaderboard_viewed` (include `snapshot_timestamp`)
- `scoreboard_stale_banner_seen` (optional)
- `group_stage_final_results_viewed`
- `dashboard_quick_action_clicked`
- `demo_scenario_switched`

Key metrics:
- Group-stage completion rate (groups + best-3rds)
- Time-to-first-complete-group-stage
- Save success/failure rate by lock state
- `group_exact_correct_count`
- `group_exact_incorrect_count`
- `best_thirds_selected_count` (target: 8)
- `best_thirds_qualified_count` (membership-based)
- Pending-to-final understanding proxy (exits after pending rows)
- Leaderboard attribution panel open rate
- Group Stage Final Results mode revisit rate
- Demo parity error rate after scenario switch

Segmentation dimensions:
- Platform (`web`, `mobile`)
- Mode (`default`, `demo`)
- Scenario id (demo only)
- Lock state (`open`, `closed`)
