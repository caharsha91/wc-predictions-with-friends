# Group Stage Results Prediction Audit (Read-Only)

## Scope, Constraints, Out-of-Scope
This audit covers only the Group Stage Results Prediction feature set and direct dependencies:
1. Group-stage picks (1st + 2nd per group)
2. Best 3rd-place picks (8 qualifiers), qualification logic, and display
3. Interim results (standings snapshot, match completion/progress, lock/deadlines, pending vs actual)
4. Leaderboard display and points attribution for group-stage + best-3rds
5. Final results and history for post-group-stage outcomes
6. Welcome dashboard surfacing (progress, lock time, deltas, activity, quick actions)
7. Navigation/IA across Play Center, Group Stage Detail, Leaderboard, History
8. Web vs mobile UX differences

Constraints acknowledged:
- No code changes were made.
- Stack/theme/data model were treated as fixed.
- Firestore schema changes were not assumed.
- Demo mode parity was audited.

Out-of-scope (intentionally not audited in depth):
- Match-by-match picks UI/logic
- Knockout bracket picks UI/logic
- Integration touchpoints only were noted where they affect group-stage discoverability or state coherence.

## Feature Map (Routes, Components, Data Modules)

### Route Surface
- `src/ui/App.tsx:154` `/play` (Play Center)
- `src/ui/App.tsx:157` `/play/group-stage` (Group Stage Detail)
- `src/ui/App.tsx:159` `/play/league` (Leaderboard)
- `src/ui/App.tsx:170` demo equivalents under `/demo/play/*`
- No dedicated history route exists for member-facing stage history (`src/ui/App.tsx:147`–`src/ui/App.tsx:186`).

### Primary UI Modules
- Group stage detail: `src/ui/pages/GroupStagePage.tsx`
- Play Center dashboard: `src/ui/pages/play/PlayPage.tsx`
- Leaderboard: `src/ui/pages/LeaderboardPage.tsx`
- Navigation shell: `src/ui/nav.ts`, `src/ui/Layout.tsx`, `src/ui/components/AppMobileNav.tsx`

### Source-of-Truth Mapping
| Domain | Primary source files |
|---|---|
| Group picks (1st/2nd) | `src/ui/hooks/useGroupStageData.ts`, `src/lib/firestoreData.ts`, `src/lib/bracket.ts` |
| Best 3rd picks (user) | `src/ui/hooks/useGroupStageData.ts`, `src/ui/pages/GroupStagePage.tsx`, `src/lib/bracket.ts` |
| Best 3rd actual qualifiers | `src/lib/data.ts` (`fetchBestThirdQualifiers`), `public/data/best-third-qualifiers.json`, demo scenario files |
| Standings/interim status | `src/ui/pages/GroupStagePage.tsx` (`computeGroupStandings`), `src/lib/matches.ts` (locks) |
| Leaderboard/points | `src/lib/scoring.ts`, `scripts/updateLeaderboard.ts`, `public/data/leaderboard.json`, `src/ui/pages/LeaderboardPage.tsx` |
| History/frozen outcomes | Static snapshot model only via `leaderboard.json` and local rank snapshot (`src/ui/pages/LeaderboardPage.tsx`); no browsable stage history route |
| Dashboard surfacing | `src/ui/pages/play/PlayPage.tsx`, `src/ui/components/ui/PlayCenterHero.tsx`, `src/ui/components/play/UserStatusCard.tsx` |
| Demo-mode adapters/storage | `src/lib/data.ts`, `src/ui/lib/demoControls.ts`, `src/ui/lib/demoStorage.ts`, `src/lib/picks.ts`, `src/lib/bracket.ts` |

## User Journeys (Web + Mobile)

### 1) New user makes group picks quickly
Current happy path:
- From Play Center group card to Group Stage Detail (`src/ui/pages/play/PlayPage.tsx:849`).
- Edit via row-level “Edit” quick sheet and save (`src/ui/pages/GroupStagePage.tsx:517`).

Confusion points:
- Page subtitle says “Read-only” while Edit actions are visible before lock (`src/ui/pages/GroupStagePage.tsx:286`, `src/ui/pages/GroupStagePage.tsx:390`).
- Dense 12-row table plus 7 columns increases first-run cognitive load; screenshots show long visual scan and tiny per-cell state chips.
- “Actual:” labels appear even when result is pending, creating false certainty (confirmed by screenshot; caused by `firstResult !== 'correct'` condition at `src/ui/pages/GroupStagePage.tsx:375`).

Mobile-specific friction:
- Horizontal table scrolling dominates; standings and best-3rds are far below fold.
- No top-level in-feature quick anchors (Summary, Standings, Best 3rds) for fast jump.

### 2) Returning user updates before lock
Current happy path:
- Play Center shows progress and lock chip (`src/ui/pages/play/PlayPage.tsx:854`–`src/ui/pages/play/PlayPage.tsx:866`).
- Group Stage Detail supports inline quick edit sheet and save.

Confusion points:
- “Last updated” on Group Stage Detail displays matches snapshot timestamp, not user’s group submission timestamp (`src/ui/pages/GroupStagePage.tsx:295`).
- Lock terminology is clear but timezone label is absent, so users in mixed regions may misread lock time (`src/ui/pages/GroupStagePage.tsx:35`, `src/ui/pages/play/PlayPage.tsx:43`).

Mobile-specific friction:
- Save action is inside right sheet with long form; no sticky “Save + Continue” flow across groups.

### 3) After lock user tries to understand what’s happening
Current happy path:
- Closed banner appears (`src/ui/pages/GroupStagePage.tsx:317`).
- Standings and pending/correct/wrong chips are visible.

Confusion points:
- Screenshot confirms “Group stage closed” can coexist with many incomplete groups; this is correct by current lock rule but mental model is not explained.
- Pending chips can still show “Actual:” team labels before finality, which reads contradictory.

Mobile-specific friction:
- Discovering “Hide details/Show details” for standings is less obvious because it sits far right and below long table.

### 4) User compares self vs friends (leaderboard + pick correctness)
Current happy path:
- Leaderboard provides rank, momentum, rivalry strips, sticky user row (`src/ui/pages/LeaderboardPage.tsx:774` onward).
- Play Center gives rivalry + friend activity (`src/ui/pages/play/PlayPage.tsx:752`, `src/ui/pages/play/PlayPage.tsx:800`).

Confusion points:
- Group-stage vs best-3rd points are blended inside one `Bracket` column; attribution is not visible (`src/ui/pages/LeaderboardPage.tsx:785`, `src/ui/pages/LeaderboardPage.tsx:851`).
- Friend activity is based on picks docs only, so group-stage edits are socially invisible (`src/ui/pages/play/PlayPage.tsx:268`).

Mobile-specific friction:
- Leaderboard is wide (`min-w-[1050px]`) and relies on horizontal scroll (`src/ui/pages/LeaderboardPage.tsx:776`).

### 5) User picks 8 best 3rds (mental model + validation)
Current happy path:
- Slots and quick edit are available; duplicate slot picks are prevented by dropdown candidate filtering (`src/ui/pages/GroupStagePage.tsx:213`).

Confusion points:
- Qualification rule explanation is minimal (“points, GD, GF” for standings) but no explicit best-3rds tie-break policy text.
- Finality gating is tied to user completion + qualifiers-file length, not strictly outcome finality (`src/ui/pages/GroupStagePage.tsx:209`).

Mobile-specific friction:
- 8-slot form in sheet is long and non-guided; no progressive steps or slot validation summary at top.

### 6) Demo-mode user switches tournament stages
Current happy path:
- Demo controls apply scenario time/viewer and emit updates (`src/ui/pages/DemoControlsPage.tsx:153`).
- Dataset fetch cache is scenario-scoped (`src/lib/data.ts:62`).

Confusion/parity risks:
- Local picks/bracket keys are not scenario-scoped (`src/lib/picks.ts:15`, `src/lib/bracket.ts:12`).
- Load order prefers local edits before scenario seed (`src/ui/hooks/usePicksData.ts:53`, `src/ui/hooks/useGroupStageData.ts:134`), so stage switching can carry stale user edits across scenarios.
- Screenshot sequence is consistent with this risk profile in demo workflows.

## Data/Logic Correctness Risks

### High
1. Pending rows leak “Actual” values before results are final.
- Evidence: `src/ui/pages/GroupStagePage.tsx:375`, `src/ui/pages/GroupStagePage.tsx:385`.
- Impact: Users infer certainty from provisional alphabetical standings; trust erosion.
- Screenshot confirmation: pending rows show “Actual: ...” with incomplete groups.

2. Group-stage scoring semantics conflict with result chips.
- Evidence: UI marks exact-position correctness (`src/ui/pages/GroupStagePage.tsx:345`–`src/ui/pages/GroupStagePage.tsx:354`), scoring awards points if team is in top two in any order (`src/lib/scoring.ts:189`, `src/lib/scoring.ts:192`).
- Impact: Users can see “Wrong” while still earning group qualifier points on leaderboard.

3. Best-3rds finality in detail view can diverge from scoring.
- Evidence: Finality requires `groupsFinal && qualifiers.length >= 8` (`src/ui/pages/GroupStagePage.tsx:210`); scoring can compute best-3rds from standings when qualifiers file is empty (`src/lib/scoring.ts:150`).
- Impact: Detail view may stay “Pending/Incomplete” while leaderboard already awards best-3rd points.

4. Lock enforcement is UI-only; backend permits post-lock writes.
- Evidence: save path has no lock checks (`src/ui/hooks/useGroupStageData.ts:237`), Firestore rules do not enforce lock windows (`firestore.rules:81`).
- Impact: Fairness risk in competitive league.

5. Demo scenario switching can blend states across scenarios.
- Evidence: scenario-agnostic local keys + local-first loading (`src/lib/picks.ts:15`, `src/lib/bracket.ts:12`, `src/ui/hooks/usePicksData.ts:53`, `src/ui/hooks/useGroupStageData.ts:134`).
- Impact: Demo parity regressions and misleading QA outcomes.

### Medium
6. Leaderboard lacks explicit group-stage vs best-3rd attribution.
- Evidence: only aggregate `Bracket` shown (`src/ui/pages/LeaderboardPage.tsx:785`, `src/ui/pages/LeaderboardPage.tsx:851`).
- Impact: Users cannot reconcile points with group-stage outcomes.

7. No member-facing stage history/frozen snapshot browsing.
- Evidence: route map has no history route (`src/ui/App.tsx:154`–`src/ui/App.tsx:160`).
- Impact: Weak post-stage review, low replayability.

8. Demo route escape from leaderboard CTA.
- Evidence: hardcoded `navigate('/play')` (`src/ui/pages/LeaderboardPage.tsx:759`).
- Impact: In demo mode, user can unexpectedly leave demo flow.

9. Last-updated signal on Group Stage Detail is not user-picks freshness.
- Evidence: uses `picksState.state.lastUpdated` from matches file (`src/ui/pages/GroupStagePage.tsx:295`).
- Impact: Users misread save freshness.

10. Duplicate standings logic in page and scoring engine.
- Evidence: `computeGroupStandings` in page + `buildGroupStandings` in scoring (`src/ui/pages/GroupStagePage.tsx:79`, `src/lib/scoring.ts:73`).
- Impact: Drift risk on future rule updates.

### Low
11. Time display lacks explicit timezone context.
- Evidence: multiple `toLocaleString` usages without timezone label (`src/ui/pages/GroupStagePage.tsx:35`, `src/ui/pages/play/PlayPage.tsx:43`, `src/ui/pages/LeaderboardPage.tsx:115`).
- Impact: Deadline confusion for cross-timezone friends.

12. Data-fetch duplication and polling overhead in Play Center.
- Evidence: `usePicksData`, `useGroupStageData`, `useBracketKnockoutData`, plus 60s social polling (`src/ui/pages/play/PlayPage.tsx:325`).
- Impact: unnecessary fetch churn and more UI loading surfaces.

## UX/IA Recommendations (Web vs Mobile Explicit)
| Priority | What to change | Where | Why | Web pattern | Mobile pattern | Acceptance criteria |
|---|---|---|---|---|---|---|
| P0 | Hide “Actual” until group/best-3rd finality | `src/ui/pages/GroupStagePage.tsx` | Prevent false certainty | Replace “Actual:” text with “Awaiting completion” on pending rows | Same plus compact inline status line | Pending rows/cards never show “Actual:” labels |
| P0 | Align result language with scoring rule | `src/ui/pages/GroupStagePage.tsx`, `src/lib/scoring.ts`, `src/ui/pages/LeaderboardPage.tsx` | Remove mismatch between “Wrong” and points earned | Change chips to “Qualified / Missed” when rule is top-two-in-any-order | Same with card badges | Swapped 1st/2nd shows rule-consistent label and points rationale |
| P0 | Enforce lock server-side and client-side guardrails | `firestore.rules`, `useGroupStageData`, save flows | Fairness and anti-late-edit integrity | Disabled controls + immutable post-lock save response | Same with clear lock toast | Post-lock save attempts fail consistently |
| P1 | Add best-3rds rule explainer + tie-break assumptions | Group stage page near best-3rds section | Improve mental model | Inline “How it’s decided” disclosure | Bottom sheet with short bullets | Users can view qualifier rule in <=2 taps/clicks |
| P1 | Add explicit group-stage points attribution block on leaderboard | `src/ui/pages/LeaderboardPage.tsx` | Improve trust in scoring | Expand row disclosure with Group Qualifiers pts, Best 3rds pts | Card-based breakdown in sheet | User can see group/best-3rd contribution without leaving leaderboard |
| P1 | Replace mobile group table with group cards | `src/ui/pages/GroupStagePage.tsx` | Horizontal table is heavy on small screens | Keep desktop table | Card stack: Group status, picks, result, progress | No horizontal scrolling required on <=768px |
| P1 | Introduce in-page subnav anchors | Group stage + leaderboard pages | Faster movement in long pages | Sticky subnav: Summary, Standings, Best 3rds, Scoring | Horizontal chips with jump-to-section | Reach any section in one tap/click from top viewport |
| P1 | Correct demo routing CTA on leaderboard | `src/ui/pages/LeaderboardPage.tsx` | Preserve demo context | Mode-aware route helper | Same | In demo, all CTAs stay under `/demo/play/*` |
| P2 | Add “what changed since last update” micro-summary | Play Center + Group Stage Detail | Increase clarity after refresh | Delta chips since prior snapshot | Same in compact row | User sees net changes count after each data refresh |
| P2 | Add dedicated Stage History view | new route + nav + links | Post-stage replay and frozen outcomes | Table/timeline by stage snapshot | Stage cards timeline | User can browse prior stage outcomes and leaderboard snapshots |

## Gamification/Social Hooks (Prioritized, No Schema/Stack Changes)
1. P0: Group-stage “Heat” strip in Play Center using existing leaderboard deltas and pending counts. Source: existing leaderboard + group completion data.
2. P1: Best-3rds “Contrarian hit” badge on Group Stage Detail using existing picks + qualifier set intersection.
3. P1: “Rival passed you in group-stage points” toast after leaderboard refresh using existing local rank snapshot logic.
4. P2: Shareable Group Stage Detail capture action (image export of current section) using client-side canvas capture and existing UI state.
5. P2: Weekly microcopy rotations (“2 picks to lock”, “3rd-place chaos watch”) without new data dependencies.

## Navigation Proposal (Web + Mobile)

### Web IA
- Left nav (Main): `Play Center`, `Group Stage`, `Leaderboard`, `History`.
- Left nav (Deferred links): `Match Picks` and `Knockout` stay secondary links, marked deferred from this scope.
- In-feature subnav:
  - Play Center: `Action Hub`, `Group Progress`, `Social`, `Quick Actions`
  - Group Stage: `Summary`, `Standings`, `Best 3rds`, `Scoring`
  - Leaderboard: `Rankings`, `Attribution`, `Opportunities`, `History`

### Mobile IA
- Bottom nav with 4 items: `Play`, `Group`, `League`, `History`.
- Overflow sheet for admin and deferred areas (`Match Picks`, `Knockout`, `Admin`).
- Group Stage page uses card-first layout with sticky top action row (`Back`, `Subnav`, `Save` when editable).

### Dashboard cross-links
- `Continue Group Picks`
- `View Standings Snapshot`
- `View Best 3rds`
- `See Leaderboard`
- `Open History`

## Open Questions / Assumptions
Assumptions used (not blocking):
- Group-stage scoring intent is “top-two membership” not strict exact order, based on `src/lib/scoring.ts:189`.
- Group lock intent is “global lock before first group kickoff” based on `src/lib/matches.ts:138`.
- Leaderboard JSON generation remains an external refresh workflow (`scripts/updateLeaderboard.ts`).

Blocking question (single):
- Should official group-stage result chips represent strict rank (1st exact / 2nd exact), or scoring-valid qualification (`Qualified`) semantics? This choice affects both UX labels and perceived fairness.
