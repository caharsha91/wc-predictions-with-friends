# Codex Phase 0 Implementation Plan (Inferred From Codebase)

Source of truth applied: `docs/codex_brief.md`.

No implementation changes made. This document is inference-only from the current code.

## 1) Routing structure (inferred)

Primary routing lives in `src/ui/App.tsx` and uses `HashRouter` from `src/main.tsx`.

- Root shell: `path="/"` -> `Layout`
- Public routes:
  - `/login`
  - `/access-denied`
- Member-gated routes (`MemberGate`):
  - `/` -> `LandingPage` (Play Center)
  - `/group-stage` -> `GroupStageEntryPage` (redirect helper)
  - `/group-stage/:groupId` -> `GroupStagePage`
  - `/match-picks` -> `PicksPage`
  - `/knockout-bracket` -> `BracketPage`
  - `/leaderboard` -> `LeaderboardPage`
- Admin-gated nested routes (`AdminGate`):
  - `/admin` -> `AdminConsolePage` (redirect)
  - `/admin/players` -> `AdminUsersPage`
  - `/admin/exports` -> `AdminExportsPage`
  - `/admin/controls` -> `DemoControlsPage`
- Demo-mode route mirror (`/demo` + `DemoAdminGate`):
  - `/demo` and `/demo/*` equivalents for all app/admin pages
- Fallback: `*` -> `NotFoundPage`

## 2) Main page/screen components

- Play Center: `src/ui/pages/LandingPage.tsx`
- Group Stage: `src/ui/pages/GroupStagePage.tsx` + `src/ui/components/group-stage/GroupStageDashboardComponents.tsx`
- Match Picks: `src/ui/pages/PicksPage.tsx` + `src/ui/components/MatchPick.tsx`
- Knockout Bracket: `src/ui/pages/BracketPage.tsx`
- League/Leaderboard: `src/ui/pages/LeaderboardPage.tsx`
- Admin Players: `src/ui/pages/AdminUsersPage.tsx`
- Admin Exports: `src/ui/pages/AdminExportsPage.tsx`
- Demo Controls: `src/ui/pages/DemoControlsPage.tsx`

## 3) Shared layout and design primitives

### App shell/layout
- `src/ui/Layout.tsx`: sidebar nav, account menu, sign-in/out, demo toggle, demo banner, main content frame
- `src/ui/nav.ts`: canonical nav labels/paths for default and demo

### Shared V2 structure
- `PageShellV2`, `PageHeaderV2`, `SectionCardV2`, `PanelHeaderV2`, `V2Card`, `RowShellV2`
- `AdminWorkspaceShellV2` wraps admin pages with shared hero header + metadata

### Primitives
- Buttons: `src/ui/components/ui/Button.tsx`
- Cards: `src/ui/components/ui/Card.tsx`
- Chips/badges/tags: `src/ui/components/ui/Badge.tsx`, `src/ui/components/v2/StatusTagV2.tsx`
- Banners/alerts/status lines: `src/ui/components/ui/Alert.tsx`, `src/ui/components/v2/StatusLineV2.tsx`
- Table primitive: `src/ui/components/ui/Table.tsx`
- Snapshot label primitive: `src/ui/components/v2/SnapshotStamp.tsx`

### Theming/token layer
- Semantic tone tokens and CTA mappings are centralized in:
  - `src/styles/theme.css`
  - `src/styles/themes.css`

## 4) Shared header/page metadata patterns

### Member-facing pages
Mostly standardized to:
- `PageShellV2`
- `PageHeaderV2` with:
  - `kicker`
  - `title`
  - `subtitle`
  - optional right-side actions (Back, Export)
  - `metadata` line containing snapshot/status text

Used by: Landing, Group Stage, Match Picks, Bracket, Leaderboard.

### Admin pages
Standardized to:
- `AdminWorkspaceShellV2`
- internally renders `PageHeaderV2` with shared admin visual style and `metadata` slot.

Used by: Admin Users, Admin Exports, Demo Controls.

## 5) Editability/lock state representation (current)

### Global phase lock model
- `TournamentPhaseContext` + `computeTournamentPhase`:
  - lock flags: `groupEditable`, `matchPicksEditable`, `bracketEditable`, `exportsVisible`, etc.
  - sources: deadlines, draw-confirmed signal, snapshot publish, demo overrides

### Group Stage
- Hook: `useGroupStageData` has explicit `isLocked` and `saveStatus` includes `locked`
- Page combines time lock + hook lock + final snapshot mode to compute read-only
- UI uses warning/locked tones and copy like “editable until ...” vs “locked/final”

### Match Picks
- Lock/editability computed per row via `computeMatchTimelineModel` (`editable`, `readOnlyReason`)
- 72-hour editable window logic in `src/ui/lib/matchTimeline.ts`
- Row states reflected through `RowShellV2` + read-only labels

### Bracket
- Round-level `unlocked` and `editable` derived from prior completion + phase lock
- Status tags show Open/Locked and completion counts

## 6) Save state behavior (current)

### Picks
- Hook `usePicksData`: `saveStatus` (`idle|saving|saved|error`)
- Page uses per-row local `savingMatchId` and ephemeral `savedMatchId`
- save path: optimistic local update + Firestore write when enabled

### Group Stage
- Hook `useGroupStageData`: `saveStatus` includes `locked`
- granular row save flow (`savingRowGroupId`, `savedRowGroupId`)
- local persistence occurs on edits; Firestore persistence on save action

### Bracket
- Hook `useBracketKnockoutData`: `saveStatus` (`idle|saving|saved|error`)
- save triggered after each pick in page handler

### Admin forms/exports
- Admin Users: `formStatus` + progress bar
- Admin Exports: `exportStatus` + progress bar + gated by `exportsVisible` and desktop viewport

## 7) Snapshot timestamp sources (current)

### Published snapshot (member pages)
`usePublishedSnapshot` computes `snapshotTimestamp` as latest of:
- `leaderboardFile.lastUpdated`
- `bestThirdFile.updatedAt`

Also fetches matches/scoring/leaderboard/best-third + projected group points.

### Match data timestamps
- `fetchMatches()` returns `matchesFile.lastUpdated`
- used in hooks/pages for data freshness but not the main shared snapshot label.

### Admin exports offline timestamp
- `AdminExportsPage` computes `offlineLastUpdated` as max of:
  - matches lastUpdated
  - leaderboard lastUpdated
  - picks/bracket doc updatedAt values

### Upstream generation
- `scripts/updateLeaderboard.ts` writes `public/data/leaderboard.json` with fresh `lastUpdated`.

## 8) Leaderboard/rivals computation + rendering (current)

### Standings source and projection mode
- Member pages consume `usePublishedSnapshot()` rows
- `buildLeaderboardPresentation()` optionally removes projected group-stage bracket points pre-final snapshot
- tie ranking and viewer/rival prioritization via `rankRowsWithTiePriority`

### Rival identity + profile
- Rival IDs loaded from `readUserProfile()` and canonicalized against directory
- Rival directory from `fetchRivalDirectory()` (Firestore or snapshot fallback)
- identity matching supports id/email/name keys (`leaderboardContext`)

### Rendering
- Landing: podium + rival board with draggable rival ordering
- Picks + Group Stage right rails: `LeaderboardCardCurated`
- Leaderboard page: full table + Rival Focus panel + movement deltas vs local previous snapshot cache

## 9) Match Picks right rail implementation (current)

Implemented in `PicksPage.tsx` as `LeaderboardCardCurated`:

- Desktop:
  - right column wrapped in `RightRailSticky`
- Mobile:
  - floating “League Peek” button opens `Sheet` containing same card

Card behavior comes from `src/ui/components/v2/LeaderboardSideListV2.tsx`:
- optional preview row slicing
- prioritizes viewer + configured rivals
- role tags (`You`, `Rival n`) and row state theming

## 10) Knockout Bracket structure (current)

Primary implementation: `src/ui/pages/BracketPage.tsx`

- Data hook: `useBracketKnockoutData`
- Round model built from stage order and dependency graph
- Team derivation for later rounds from prior picked winners/losers
- Two render modes:
  - Desktop visual bracket (`DesktopVisualBracket`): generated node graph + SVG connectors
  - Mobile sequential rounds/cards with next/back flow and review sheet
- Lock semantics:
  - `drawConfirmed` gate
  - `bracketEditable` from phase lock flags

## 11) Admin/demo mode representation (current)

### Demo mode routing + shell markers
- mode is route-driven (`/demo` prefix via `useRouteDataMode`)
- layout shows “Demo Mode Active” banner in demo routes
- account menu can toggle demo mode for admins

### Demo data switching
- data loader (`src/lib/data.ts`) maps `data/*` to `data/demo/scenarios/<scenario>/*`
- demo scenario/viewer/now overrides stored in localStorage (`demoControls.ts`)

### Admin/demo access
- Admin routes gated by `AdminGate` / `DemoAdminGate`
- demo controls exposed as admin page and also under `/demo/admin/controls`

## 12) Best low-risk extension points for shared UX improvements

### Highest-confidence shared extension points
1. `PageHeaderV2` metadata conventions
- Add consistent status phrase templates without touching page layout structure.

2. `SnapshotStamp`
- Central place to normalize snapshot copy format across pages.

3. `StatusTagV2` / `StatusLineV2`
- Enforce semantic tone mapping (`selected/locked/saved/published/final`) with minimal refactor.

4. `LeaderboardCardCurated` + `RightRailSticky`
- Reusable right-rail/panel behavior for Group Stage and Match Picks.

5. `RowShellV2` state classes
- Consistent selected/disabled/you/rival visuals for lock and save feedback.

6. Phase and timeline utility layer
- `TournamentPhaseContext` + `matchTimeline` provide centralized lock/editability semantics.

### Keep page-local (lower risk than over-abstracting)
- Knockout SVG layout math and connector geometry in `BracketPage`
- Landing rivals drag/drop interactions
- Group-stage rank drag/drop and best-third cap mechanics
- MatchPick tie-break UI details (AET/PEN, winner-on-draw)

## 13) Likely files/components/modules involved per screen

### Shared app shell / navigation
- `src/main.tsx`
- `src/ui/App.tsx`
- `src/ui/Layout.tsx`
- `src/ui/nav.ts`

### Shared design/status primitives
- `src/ui/components/v2/PageHeaderV2.tsx`
- `src/ui/components/v2/PageShellV2.tsx`
- `src/ui/components/v2/SectionCardV2.tsx`
- `src/ui/components/v2/StatusTagV2.tsx`
- `src/ui/components/v2/StatusLineV2.tsx`
- `src/ui/components/v2/SnapshotStamp.tsx`
- `src/ui/components/ui/Button.tsx`
- `src/ui/components/ui/Badge.tsx`
- `src/ui/components/ui/Alert.tsx`
- `src/ui/components/ui/Table.tsx`
- `src/styles/theme.css`
- `src/styles/themes.css`

### Play Center
- `src/ui/pages/LandingPage.tsx`
- `src/ui/components/v2/LeaderboardPodium.tsx`
- `src/ui/components/v2/MemberIdentityRowV2.tsx`
- `src/ui/components/v2/RowShellV2.tsx`
- `src/ui/hooks/usePublishedSnapshot.ts`
- `src/ui/hooks/usePicksData.ts`
- `src/ui/hooks/useGroupStageData.ts`
- `src/ui/hooks/useBracketKnockoutData.ts`
- `src/ui/lib/profilePersistence.ts`

### Group Stage
- `src/ui/pages/GroupStagePage.tsx`
- `src/ui/components/group-stage/GroupStageDashboardComponents.tsx`
- `src/ui/components/v2/LeaderboardSideListV2.tsx`
- `src/ui/hooks/useGroupStageData.ts`
- `src/ui/lib/groupStageBestThirdSelection.ts`
- `src/lib/groupStageSnapshot.ts`
- `src/lib/groupRanking.ts`

### Match Picks
- `src/ui/pages/PicksPage.tsx`
- `src/ui/components/MatchPick.tsx`
- `src/ui/components/v2/LeaderboardSideListV2.tsx`
- `src/ui/lib/matchTimeline.ts`
- `src/ui/hooks/usePicksData.ts`

### Knockout Bracket
- `src/ui/pages/BracketPage.tsx`
- `src/ui/hooks/useBracketKnockoutData.ts`
- `src/lib/bracket.ts`
- `src/ui/components/v2/StatusTagV2.tsx` (status chips used throughout)

### Leaderboard / League social
- `src/ui/pages/LeaderboardPage.tsx`
- `src/ui/lib/leaderboardPresentation.ts`
- `src/ui/lib/leaderboardContext.ts`
- `src/ui/lib/leaderboardTieRanking.ts`
- `src/ui/lib/socialBadges.ts`
- `src/lib/scoring.ts`

### Admin / Demo
- `src/ui/components/v2/AdminWorkspaceShellV2.tsx`
- `src/ui/pages/AdminConsolePage.tsx`
- `src/ui/pages/AdminUsersPage.tsx`
- `src/ui/pages/AdminExportsPage.tsx`
- `src/ui/pages/DemoControlsPage.tsx`
- `src/ui/lib/demoControls.ts`
- `src/ui/hooks/useRouteDataMode.ts`
- `src/lib/data.ts`

## 14) Shared abstractions vs page-local changes recommendation

### Should be shared abstractions
- Header metadata status language and status chip vocabulary
- Snapshot stamp wording/format and unavailable fallback text
- Lock/edit/save state badge styles and tones
- Reusable right-rail panel framing and sticky behavior
- Standard alert copy patterns for snapshot/permission-limited/read-only states

### Should stay page-local
- Group Stage drag interactions and best-third selection behavior
- Match Picks per-row validation and tie/AET/PEN logic
- Bracket geometry/rendering and round progression logic
- Landing rivals drag/drop management details

## 15) Risks and ambiguities to watch

1. Identity key drift (`member.id` vs email doc IDs)
- Multiple pages reconcile identities differently; shared refactors can break "You/Rival" labeling.

2. Snapshot semantics are partly inferred, not explicit phase data
- `usePublishedSnapshot` timestamp is derived from leaderboard/best-third file times, not a dedicated published snapshot object.

3. Save-state patterns are not yet fully unified
- Picks, Group Stage, Bracket each manage save indicators differently (global hook status + local row state).

4. Demo vs default mode behavior diverges in storage and data sources
- Any shared abstraction must preserve demo scenario scoping and local overrides.

5. Bracket page complexity is high
- Desktop visual bracket has bespoke layout math; low tolerance for shared UI abstractions that alter structure.

6. Leaderboard movement/rank deltas depend on local persisted snapshots
- UX changes to labels/timing can confuse "momentum" semantics unless snapshot-change boundaries remain intact.

7. Export/admin gating tied to phase lock + viewport
- Copy cleanup should not accidentally alter admin-only constraints (desktop-only exports, lock window messaging).

## 16) Recommended execution mapping for chunks

### Chunk 1: shared page-level status/copy cleanup

Goal
- Normalize header metadata/status phrases: Latest snapshot, Editable until, Locked, Published, Final, Demo mode.

Primary files
- `src/ui/components/v2/PageHeaderV2.tsx`
- `src/ui/components/v2/SnapshotStamp.tsx`
- `src/ui/components/v2/StatusLineV2.tsx`
- `src/ui/components/v2/StatusTagV2.tsx`
- member pages (`LandingPage`, `GroupStagePage`, `PicksPage`, `BracketPage`, `LeaderboardPage`)
- admin shell pages (`AdminWorkspaceShellV2` consumers)

Notes
- Keep copy-only + lightweight prop-level improvements first.

### Chunk 2: shared save/lock state treatment

Goal
- Standardize visual treatment of `saving/saved/locked/error/editable` across pages.

Primary files
- `src/ui/components/v2/StatusTagV2.tsx`
- `src/ui/components/v2/StatusLineV2.tsx`
- `src/ui/components/v2/RowShellV2.tsx`
- `src/ui/hooks/usePicksData.ts`
- `src/ui/hooks/useGroupStageData.ts`
- `src/ui/hooks/useBracketKnockoutData.ts`
- affected pages: Picks, Group Stage, Bracket, Landing (profile/rivals save labels)

Notes
- Should precede page-specific passes so later chunks reuse consistent state language.

### Chunk 3: Play Center improvements

Goal
- Clarify snapshot cadence, edit windows, lock visibility, and rival context without structural rewrite.

Primary files
- `src/ui/pages/LandingPage.tsx`
- `src/ui/lib/profilePersistence.ts`
- `src/ui/components/v2/LeaderboardPodium.tsx`
- `src/ui/components/v2/MemberIdentityRowV2.tsx`

### Chunk 4: Group Stage clarity pass

Goal
- Make editable-until/locked/final distinctions and save feedback consistent.

Primary files
- `src/ui/pages/GroupStagePage.tsx`
- `src/ui/components/group-stage/GroupStageDashboardComponents.tsx`
- `src/ui/hooks/useGroupStageData.ts`

### Chunk 5: Match Picks right rail replacement + tie/AET/PEN clarity

Goal
- Improve right rail clarity and make knockout draw requirements explicit and unambiguous.

Primary files
- `src/ui/pages/PicksPage.tsx`
- `src/ui/components/MatchPick.tsx`
- `src/ui/components/v2/LeaderboardSideListV2.tsx`
- `src/ui/lib/matchTimeline.ts`

Dependency
- Benefits from Chunk 2 state semantics and chunk 1 copy normalization.

### Chunk 6: Knockout Bracket orientation and round clarity

Goal
- Clarify stage orientation, active round state, lock/final messaging, and progression cues.

Primary files
- `src/ui/pages/BracketPage.tsx`
- `src/ui/hooks/useBracketKnockoutData.ts`

Dependency
- After chunk 2 to keep lock/open/saved semantics aligned.

### Chunk 7: Leaderboard / League social clarity pass

Goal
- Tighten snapshot/final labels and rival-momentum clarity.

Primary files
- `src/ui/pages/LeaderboardPage.tsx`
- `src/ui/lib/leaderboardPresentation.ts`
- `src/ui/lib/socialBadges.ts`
- `src/ui/components/v2/LeaderboardSideListV2.tsx`

Dependency
- After chunk 3/5/6 so card/state language is already aligned.

### Chunk 8: Admin screens clarity pass

Goal
- Apply same snapshot/lock/demo language consistency to admin tools.

Primary files
- `src/ui/pages/AdminUsersPage.tsx`
- `src/ui/pages/AdminExportsPage.tsx`
- `src/ui/pages/DemoControlsPage.tsx`
- `src/ui/components/v2/AdminWorkspaceShellV2.tsx`

### Chunk 9: final copy and consistency sweep

Goal
- Final normalization pass for terms, tones, and status wording across all affected screens.

Primary files
- Cross-cutting pass across modified pages/components from chunks 1-8.

## 17) Chunk-order risk assessment

Recommended order remains the provided order.

Only notable sequencing caveat:
- If chunk 2 (shared save/lock treatment) is skipped or delayed, chunks 4/5/6/7 will likely duplicate state semantics and increase cleanup work in chunk 9.

No other major dependency currently requires changing chunk order.
