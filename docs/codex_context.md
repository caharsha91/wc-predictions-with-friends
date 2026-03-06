# Codex Phase 0 Context (Authoritative)

Purpose: single execution reference for the World Cup Predictions UX pass, merging product constraints (`docs/codex_brief.md`) and inferred repo implementation mapping (`docs/codex_plan.md`).

## 1) Product constraints (non-negotiable)
- private invited-friends-only league
- exactly one league / one tournament
- desktop-first, mobile-secondary
- daily snapshot-based updates
- no chat
- no notifications
- no realtime/live assumptions
- no Blaze-tier-dependent architecture or features
- minimal operational complexity
- do not replace the tech stack
- do not redesign the app into mobile-first
- prefer existing components/patterns/data flow
- avoid broad rewrites

## 2) Product intent
This app should feel like a polished private World Cup side-game people check to make picks, review the latest published snapshot, and compare standings with friends for casual banter.

It is not a live fantasy platform.

## 3) UX rules
Across affected screens, reinforce:
- Latest snapshot
- Editable until
- Locked
- Saved
- Published
- Final
- Demo mode only in testing/admin contexts

Avoid implying live/realtime behavior.

## 4) Visual/state semantics
### Visual rules
- Preserve dark premium sports aesthetic.
- Preserve current gradient/header/card language.
- Preserve existing nav structure.
- Preserve existing sports-focused visual identity.
- Improve consistency of state communication; do not rebrand.

### State semantics
- selected / your item / active pick -> teal/cyan emphasis
- locked / read-only / deadline -> amber emphasis
- correct / confirmed success -> green
- primary CTA -> filled purple button
- secondary action -> outline/ghost button
- Reuse existing design-system encodings; do not add unnecessary colors.

## 5) Global implementation rules
- Reuse and extend existing patterns where possible.
- Prefer localized, low-risk improvements over structural rewrites.
- Infer structure from codebase first; screenshots are visual reference only.
- Implement chunk-by-chunk.
- After each chunk: summarize what changed and where, and list manual QA checks.

## 6) Inferred codebase map
### Routing and shells
- Router entry: `src/main.tsx` (`HashRouter`), route tree in `src/ui/App.tsx`.
- Root shell: `src/ui/Layout.tsx`.
- Member routes: `/`, `/group-stage`, `/group-stage/:groupId`, `/match-picks`, `/knockout-bracket`, `/leaderboard`.
- Admin routes: `/admin`, `/admin/players`, `/admin/exports`, `/admin/controls`.
- Demo mirror: `/demo/*` with admin-demo gating.
- Nav config: `src/ui/nav.ts`.

### Shared layout/design primitives
- Page/layout: `src/ui/components/v2/PageShellV2.tsx`, `PageHeaderV2.tsx`, `SectionCardV2.tsx`, `PanelHeaderV2.tsx`, `V2Card.tsx`, `RowShellV2.tsx`.
- Admin shell: `src/ui/components/v2/AdminWorkspaceShellV2.tsx`.
- Status/copy primitives: `StatusTagV2.tsx`, `StatusLineV2.tsx`, `SnapshotStamp.tsx`.
- Core UI primitives: `src/ui/components/ui/Button.tsx`, `Badge.tsx`, `Alert.tsx`, `Table.tsx`, `Card.tsx`.
- Theme tokens: `src/styles/theme.css`, `src/styles/themes.css`.

### Header/metadata patterns
- Member pages mostly use `PageShellV2` + `PageHeaderV2` (`kicker/title/subtitle/metadata/actions`).
- Admin pages use `AdminWorkspaceShellV2` and shared metadata pattern.

### Screen map (primary files)
- Play Center: `src/ui/pages/LandingPage.tsx`, `src/ui/components/v2/LeaderboardPodium.tsx`, `MemberIdentityRowV2.tsx`, `src/ui/lib/profilePersistence.ts`.
- Group Stage: `src/ui/pages/GroupStagePage.tsx`, `src/ui/components/group-stage/GroupStageDashboardComponents.tsx`, `src/ui/hooks/useGroupStageData.ts`, `src/ui/lib/groupStageBestThirdSelection.ts`, `src/lib/groupStageSnapshot.ts`, `src/lib/groupRanking.ts`.
- Match Picks: `src/ui/pages/PicksPage.tsx`, `src/ui/components/MatchPick.tsx`, `src/ui/components/v2/LeaderboardSideListV2.tsx`, `src/ui/lib/matchTimeline.ts`, `src/ui/hooks/usePicksData.ts`.
- Knockout Bracket: `src/ui/pages/BracketPage.tsx`, `src/ui/hooks/useBracketKnockoutData.ts`, `src/lib/bracket.ts`.
- Leaderboard/League social: `src/ui/pages/LeaderboardPage.tsx`, `src/ui/lib/leaderboardPresentation.ts`, `leaderboardContext.ts`, `leaderboardTieRanking.ts`, `socialBadges.ts`, `src/lib/scoring.ts`.
- Admin/Demo: `src/ui/pages/AdminConsolePage.tsx`, `AdminUsersPage.tsx`, `AdminExportsPage.tsx`, `DemoControlsPage.tsx`, `src/ui/lib/demoControls.ts`, `src/ui/hooks/useRouteDataMode.ts`, `src/lib/data.ts`.

### Editability/lock/save/timestamp behavior (current)
- Global lock/editability model: `src/ui/context/TournamentPhaseContext.tsx` + `src/ui/lib/tournamentPhase.ts`.
- Match-level editability/read-only reasons: `src/ui/lib/matchTimeline.ts`.
- Save-state hooks:
  - Picks: `src/ui/hooks/usePicksData.ts` (`idle|saving|saved|error` + row-local indicators in page)
  - Group Stage: `src/ui/hooks/useGroupStageData.ts` (`locked` included)
  - Bracket: `src/ui/hooks/useBracketKnockoutData.ts`
- Published snapshot timestamp source: `src/ui/hooks/usePublishedSnapshot.ts` (latest of leaderboard and best-third timestamps).
- Admin export “offline last updated”: assembled in `src/ui/pages/AdminExportsPage.tsx` from matches/leaderboard/docs timestamps.

### Leaderboard/rivals and right-rail implementation (current)
- Standings/presentation: `usePublishedSnapshot` + `src/ui/lib/leaderboardPresentation.ts`.
- Rival identity/canonicalization: `src/ui/lib/leaderboardContext.ts`, profile persistence in `src/ui/lib/profilePersistence.ts`.
- Side leaderboard/right rail: `src/ui/components/v2/LeaderboardSideListV2.tsx`.
- Match Picks right rail in `PicksPage.tsx`:
  - desktop via `RightRailSticky`
  - mobile via `Sheet` (“League Peek”)

### Knockout/admin-demo specifics
- Bracket has high-complexity page-local desktop graph/SVG connector layout in `BracketPage.tsx`; mobile uses sequential round cards.
- Demo mode is route-driven (`/demo`) with scenario/viewer/time overrides via `demoControls` and data remapping in `src/lib/data.ts`.

### Low-risk shared extension points
- `PageHeaderV2` metadata conventions
- `SnapshotStamp` formatting/copy
- `StatusTagV2` and `StatusLineV2` state vocabulary
- `RowShellV2` state class treatment
- `LeaderboardSideListV2` + `RightRailSticky` panel patterns
- Existing phase/timeline utility layer for lock/editability semantics

## 7) Shared abstractions vs page-local changes
### Prefer shared abstractions
- Header metadata status language
- Snapshot stamp wording/fallback
- Lock/edit/save state chips/lines/tones
- Reusable right-rail framing/sticky behavior
- Shared alert copy patterns for snapshot/read-only/permission-limited states

### Keep page-local
- Group Stage drag/best-third behavior
- Match Picks tie/AET/PEN validation and winner-on-draw logic
- Bracket geometry/orientation connector rendering
- Play Center rival drag/drop interactions

## 8) Risks and ambiguities
1. Identity key drift (`member.id` vs email/doc IDs) can break You/Rival labeling.
2. Snapshot timestamp semantics are inferred from files, not explicit published-phase object.
3. Save-state patterns differ across Picks/Group Stage/Bracket.
4. Demo vs default data/storage behavior diverges; shared abstractions must preserve mode boundaries.
5. Bracket desktop layout is bespoke and fragile to cross-cutting UI refactors.
6. Leaderboard movement/rank deltas depend on locally persisted previous snapshots.
7. Admin export constraints depend on phase lock plus viewport gating.

## 9) Chunk execution map
1. Shared page-level status/copy cleanup
- Goal: normalize metadata/status phrases (Latest snapshot, Editable until, Locked, Published, Final, Demo mode).
- Primary files: `PageHeaderV2.tsx`, `SnapshotStamp.tsx`, `StatusLineV2.tsx`, `StatusTagV2.tsx`, member page headers, admin shell consumers.

2. Shared save/lock state treatment
- Goal: standardize `saving/saved/locked/error/editable` treatment.
- Primary files: `StatusTagV2.tsx`, `StatusLineV2.tsx`, `RowShellV2.tsx`, `usePicksData.ts`, `useGroupStageData.ts`, `useBracketKnockoutData.ts`, affected pages.
- Dependency note: do early to avoid rework in chunks 4/5/6/7.

3. Play Center improvements
- Goal: clarify snapshot cadence, edit windows, lock visibility, rival context.
- Primary files: `LandingPage.tsx`, `profilePersistence.ts`, `LeaderboardPodium.tsx`, `MemberIdentityRowV2.tsx`.

4. Group Stage clarity pass
- Goal: consistent editable-until/locked/final distinctions and save feedback.
- Primary files: `GroupStagePage.tsx`, `GroupStageDashboardComponents.tsx`, `useGroupStageData.ts`.

5. Match Picks right rail replacement + tie/AET/PEN clarity
- Goal: improve right rail clarity and make knockout draw requirements explicit.
- Primary files: `PicksPage.tsx`, `MatchPick.tsx`, `LeaderboardSideListV2.tsx`, `matchTimeline.ts`.
- Dependency note: benefits from chunks 1 and 2 first.

6. Knockout Bracket orientation and round clarity
- Goal: clarify orientation, active round state, lock/final messaging, progression cues.
- Primary files: `BracketPage.tsx`, `useBracketKnockoutData.ts`.
- Dependency note: after chunk 2.

7. Leaderboard / League social clarity pass
- Goal: tighten snapshot/final labels and rival-momentum clarity.
- Primary files: `LeaderboardPage.tsx`, `leaderboardPresentation.ts`, `socialBadges.ts`, `LeaderboardSideListV2.tsx`.
- Dependency note: after chunks 3/5/6 for language consistency.

8. Admin screens clarity pass
- Goal: align admin snapshot/lock/demo wording with member-facing semantics.
- Primary files: `AdminUsersPage.tsx`, `AdminExportsPage.tsx`, `DemoControlsPage.tsx`, `AdminWorkspaceShellV2.tsx`.

9. Final copy and consistency sweep
- Goal: cross-page normalization of terms, tones, and state wording.
- Scope: all modified pages/components from chunks 1-8.

Chunk-order guidance:
- Keep the provided order.
- Main sequencing risk: delaying chunk 2 increases duplicate semantics and cleanup in chunk 9.

## 10) Instructions for subsequent prompts
- Read this file first and treat it as authoritative for this UX pass.
- Preserve all product constraints and intent in this file.
- Use the inferred file/component map as default implementation scope.
- Prefer low-risk shared primitives first, then page-local changes where needed.
- Do not introduce new product requirements, realtime assumptions, or architecture rewrites.
- Implement only the requested chunk unless explicitly asked to combine chunks.

## How to use this file in later prompts
- Read this file first and treat it as authoritative.
- Follow the repo-specific implementation mapping unless a clearly lower-risk path is better.
- Preserve all product constraints in this file.
- Implement only the requested chunk in each prompt.
