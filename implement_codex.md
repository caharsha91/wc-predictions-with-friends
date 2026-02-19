# WC Predictions v2 - Codex Execution Spec (Implementation-Friendly)
_Last updated: 2026-02-19_

## 1) Delivery target (in-place v2)

Ship an in-place v2 UX update with:

1. Landing Page v2 at `/` (default after login)
2. Group Stage Predictions at `/group-stage/:groupId`
3. Match Picks at `/match-picks`
4. Knockout Bracket at `/knockout-bracket`
5. Embedded leaderboard surfaces (desktop rail L1, mobile peek L2)
6. Global visual uplift (header wash + primary card glow, token-driven in both themes)

In-place means: existing behavior must keep working; avoid broad refactors.

## 2) Non-negotiable constraints

- Stack remains: React 18 + TypeScript, Vite, `react-router-dom` v6, Tailwind, shadcn/ui + Radix, Firebase Auth + Firestore, GitHub Pages.
- Pre-lock secrecy applies to rival/other-user pick content only: users can always view/edit their own picks before lock, while rival/other-user picks remain hidden until the relevant lock.
- Leaderboard/result-derived states are snapshot-driven (daily snapshots via GitHub Actions), not real-time.
- Snapshot timestamp must be visible everywhere leaderboard or result-derived UI appears.
- Desktop-first UX, fully usable on mobile.
- No Jest/Vitest requirement; validation is build + lint + manual simulation.

In-place v2 activation contract:

- v2 ships in-place and is always active.
- Rollback is handled by restoring/reverting the previous git version.
- Data contracts (phase computation, snapshot stamps, secrecy rules) remain consistent across implementation updates.

## 3) Canonical state model

### 3.1 `tournamentPhase` is the single source of truth

Use a shared computed `tournamentPhase` state for all screens:

- `PRE_GROUP`
- `GROUP_OPEN`
- `GROUP_LOCKED`
- `KO_OPEN`
- `KO_LOCKED`
- `FINAL`

`tournamentPhase` drives:

- editability
- lock badges/state
- rival comparison visibility
- export visibility
- leaderboard rail behavior
- contextual messaging

Rules:

- No page-level lock inference.
- Global edit/visibility decisions (group editability, bracket editability, `picksHidden`, `rivalsComparisonVisible`, `exportsVisible`) must come exclusively from shared `{ tournamentPhase, lockFlags }`.
- Carve-out (Match Picks match-level editability): match-level editability is a canonical shared derived state computed from shared global flags (`lockFlags.matchPicksEditable`) and match data + `nowUtc` using the rules in section 7.4.
- This derived state must be implemented as shared helpers/selectors (for example `isMatchEditable(match, nowUtc, lockFlags)`), not page-local logic.
- Pages must call shared helpers and must not re-implement time-window gating independently.
- All screens consume the same `tournamentPhase` source.
- `tournamentPhase` is computed via pure `computeTournamentPhase(inputs)`.
- `computeTournamentPhase(inputs)` inputs: mode, deadlines, KO draw-confirmed signal, snapshot fields, selected demo phase, demo override.
- Store phase state once in global UI state (Context or Zustand): `{ tournamentPhase, lockFlags, computedAt }`.
- Canonical `lockFlags` shape: `{ groupLocked, knockoutLocked, picksHidden, rivalsComparisonVisible, exportsVisible, groupEditable, matchPicksEditable, bracketEditable }`.
- Lock flag invariants: `groupLocked => !groupEditable`, `knockoutLocked => !bracketEditable`, `picksHidden => !rivalsComparisonVisible`, `exportsVisible` must match export visibility mapping in section 7.7.
- Recompute on phase-source changes and on a boundary timer.
- Demo mode `tournamentPhase` comes from scenario JSON with demo controls override when set.
- Deadline/window statements in surface sections are descriptive inputs to shared derivation only; page components must gate lock/edit/visibility strictly from shared `tournamentPhase` and shared `lockFlags`.
- Canonical Match Picks time-window derivation is centralized in shared selectors/models (for example `computeMatchTimelineModel(matches, nowUtc, lockFlags)` and `isMatchEditable(match, nowUtc, lockFlags)`), and `/match-picks` must consume that derived output instead of implementing local time gating.
- Canonical KO kickoff lock evaluation (including production fail-safe and demo exception behavior) is centralized in shared phase/lock computation and exposed through `{ tournamentPhase, lockFlags }`; `/knockout-bracket` must not infer KO lock state from fixture times locally.

#### Phase computation contract (deterministic)

- Compute `tournamentPhase` via pure `computeTournamentPhase(inputs)` and return `{ tournamentPhase, lockFlags, computedAt }`.
- Store shared phase state once in global UI state (Context or Zustand): `{ tournamentPhase, lockFlags, computedAt }`.

Required inputs:

- `mode`: `"prod" | "demo"` (required; used for KO kickoff missing/invalid fail-safe evaluation)
- `nowUtc`: normalized UTC timestamp used for phase boundary comparisons
- `deadlines`: `{ groupStageDeadlineUtc: string, firstKoKickoffUtc?: string | null }`
- `koDrawConfirmedSignal`: boolean (must use the canonical fixture-presence detection defined in section 7.5)
- `snapshotFields`: `{ snapshotPublishedAt?: string | null, snapshotPhase?: "PRE_GROUP" | "GROUP_OPEN" | "GROUP_LOCKED" | "KO_OPEN" | "KO_LOCKED" | "FINAL" | null, snapshotGroupLocked?: boolean | null, snapshotKoLocked?: boolean | null, snapshotFinalized?: boolean | null }`
- `selectedDemoPhase`: `"PRE_GROUP" | "GROUP_OPEN" | "GROUP_LOCKED" | "KO_OPEN" | "KO_LOCKED" | "FINAL" | null`
- `demoOverride`: same enum as `selectedDemoPhase` or `null`

Deadline naming guardrail:

- `GROUP_STAGE_DEADLINE_UTC` is an alias for `deadlines.groupStageDeadlineUtc`. No second group deadline source exists.

Source precedence (strict, deterministic):

- Evaluate sources in this order: `demoOverride` -> `selectedDemoPhase` -> `snapshotFields` -> deadline-derived fallback.
- A source is authoritative only if it yields a valid phase per the rules in this section.
- Lower-precedence sources are consulted only when the higher-precedence source yields no phase (`null`/not determinable), not when it yields a contradictory phase.
- If a higher-precedence source yields contradictory fields, resolve using the deterministic snapshot conflict rules below; do not fall through.

Recompute rules:

- Recompute when any phase-source inputs change (deadlines, fixtures that affect draw-confirmed, snapshot fields, demo selections).
- Recompute on a boundary timer: schedule the timer to fire at the next known phase boundary timestamp (`groupStageDeadlineUtc` and `firstKoKickoffUtc` if valid). When it fires, recompute and re-schedule to the next boundary.

Boundary timer guardrail:

- The boundary timer schedules exactly for the next known boundary timestamp and must not poll continuously.
- If no valid boundary timestamps exist, schedule a conservative periodic recompute at 60 seconds.

Snapshot conflict-resolution (deterministic):

- When `snapshotFields` is the selected authoritative source:
  - If `snapshotFinalized === true`, treat phase as `FINAL` regardless of other snapshot fields.
  - Else if `snapshotPhase` is non-null, it is the primary phase indicator and wins over `snapshotGroupLocked`/`snapshotKoLocked`.
  - Else (no `snapshotPhase`):
    - if `snapshotKoLocked === true` -> `KO_LOCKED`
    - else if `snapshotGroupLocked === true` -> `GROUP_LOCKED`
    - else if both booleans are `false` or `null` -> yield no phase (fall through to deadline-derived fallback)
  - If snapshot fields are structurally invalid (for example unrecognized enum), treat as "no phase" and fall through.

Phase criteria (first matching rule wins within the selected authoritative source):

- `FINAL`
  - Source reports tournament complete (`snapshotFinalized === true` OR `snapshotPhase === "FINAL"` OR selected/demo phase is `FINAL`).
- `KO_LOCKED`
  - Source reports KO locked (`snapshotPhase === "KO_LOCKED"` OR `snapshotKoLocked === true` OR selected/demo phase is `KO_LOCKED`).
  - Production KO kickoff fail-safe (`mode = "prod"`): if KO would otherwise be `KO_OPEN` and the first KO kickoff timestamp is missing/invalid/unparseable, force `KO_LOCKED`.
  - Production KO time lock (`mode = "prod"`): if valid `firstKoKickoffUtc` exists and `nowUtc >= firstKoKickoffUtc`, force `KO_LOCKED`.
  - Demo behavior (`mode = "demo"`): missing/invalid `firstKoKickoffUtc` does not force lock; remain in computed state and surface a warning on the bracket page.
- `KO_OPEN`
  - Source reports KO open (`snapshotPhase === "KO_OPEN"` OR selected/demo phase is `KO_OPEN`) and KO is not locked.
  - Deadline-derived fallback: `koDrawConfirmedSignal === true` and KO is not locked.
- `GROUP_LOCKED`
  - Source reports group locked (`snapshotPhase === "GROUP_LOCKED"` OR `snapshotGroupLocked === true` OR selected/demo phase is `GROUP_LOCKED`) and KO is not open/locked.
  - Deadline-derived fallback: `nowUtc >= groupStageDeadlineUtc` and KO is not open/locked.
- `GROUP_OPEN`
  - Source reports group open (`snapshotPhase === "GROUP_OPEN"` OR selected/demo phase is `GROUP_OPEN`).
  - Deadline-derived fallback: `nowUtc < groupStageDeadlineUtc` and no higher-priority phase applies.
- `PRE_GROUP`
  - Source reports pre-group (`snapshotPhase === "PRE_GROUP"` OR selected/demo phase is `PRE_GROUP`).
  - If no source yields a phase, default to `PRE_GROUP`.

Acceptance:

- `tournamentPhase` changes update all pages without reload.
- Group Stage, Match Picks, Bracket locking behavior stays consistent.
- Rival visibility auto-adjusts by `tournamentPhase`.

### 3.2 Locking rules

- Group Stage: one global lock at first group-stage kickoff (`GROUP_STAGE_DEADLINE_UTC`).
- Knockout Bracket: available only when draw is confirmed; all bracket picks lock together before first KO kickoff.

### 3.3 Secrecy and rivalry rules

- Pre-lock: users can edit their own picks.
- Pre-lock: rival picks are hidden; rival identities (name/avatar) may be shown.
- Pre-lock: non-pick competitive signals are allowed.
- Pre-lock non-pick competitive signals must not be derived from hidden rival pick content.
- Post-lock: read-only rival comparison overlays may appear (You + up to 3 rivals).
- Rival edit controls exist only on Landing.

### 3.4 Snapshot behavior

- UI must not imply live scoring.
- Rankings and result-derived states only change when a new snapshot is published.
- No automatic snapshot polling or full-page reload.
- Snapshot timestamp communicates freshness on every relevant surface.
- Messaging must consistently reflect snapshot-based updates.
- Snapshot timestamps are rendered in the viewer's local timezone.
- Display format: `MMM d, yyyy, h:mm a`.
- When snapshot data is unavailable, `SnapshotStamp` must render explicit fallback text (`Snapshot unavailable`) instead of being omitted.

### 3.5 Required UX states

- Loading: render skeleton/placeholder states that preserve layout and keep lock/visibility controls non-interactive until state resolves.
- Empty: render explicit empty-state messaging (never blank containers) when no rows/cards are available for a surface.
- Locked: render lock badge/context text and disable edits while preserving read-only visibility.
- Error: render non-blocking error state with explicit user-triggered retry action for fetch/save/export failures; do not auto-reload the page as retry behavior.
- Transitional: if `tournamentPhase` or snapshot changes mid-session, recompute view state without full reload, preserve scroll + disclosure state, and if editability flips to locked keep visible values but disable editing controls in place.
- Pending submit/save: while a write is in flight, show inline pending state and prevent duplicate submit actions.
- Export in progress: keep export UI visible with progress/pending messaging until completion or failure.

Additional required UX states:

- Landing rivals selector loading: show a non-empty loading state while fetching the rival directory.
- Landing rivals selector empty: if no rivals are available, show explicit `No rivals available` empty state (no blank list).
- Phase input conflicts/parse failures: if deadline timestamps are missing/invalid or snapshot fields are conflicting/unparseable, show a non-blocking warning message on affected surfaces and fall back deterministically using section 3.1 rules (do not crash and do not guess).
- Phase flips to locked mid-edit: if editability flips from editable to locked while unsaved local edits exist, preserve visible values, disable inputs immediately, and show brief inline message `Lock reached—editing disabled.` Do not auto-submit.

## 4) Routing and navigation contracts

Required routes:

- `/` -> Landing v2 (default post-login)
- `/group-stage` -> parse global `lastRoute` only when it already matches `/group-stage/:groupId`; otherwise redirect to `/group-stage/A`
- `/group-stage/:groupId` where `groupId` is `A..L`
- `/match-picks`
- `/knockout-bracket`
- `/leaderboard` (canonical standings)

`Continue` behavior:

- Landing reads per-user `lastRoute` and routes there.
- Fallback if missing/invalid/unauthorized: `/`.
- On fallback, clear stored `lastRoute` only when fallback is caused by `invalid` or `unauthorized` route validation; do not clear when `lastRoute` is missing.
- `invalid`: path/params do not match the allowed persistence routes in this section.
- `unauthorized`: route is blocked by access guards or a hard route-entry deny rule.
- `/knockout-bracket` is always a valid authorized `lastRoute` target; pre-draw behavior is an in-page empty state and must not be treated as `unauthorized`.

`lastRoute` persistence:

- Persist per user in profile doc.
- Debounce writes (1-2s target).
- Skip unchanged values.
- Persist only when the route is one of:
  - `/group-stage/:groupId`
  - `/match-picks`
  - `/knockout-bracket`
  - `/leaderboard`
- Allow and preserve extra query params on these routes.
- Best effort; never block UI.

## 5) Data and persistence contracts

### 5.1 Production sources

- User directory for rival selection: `users/{uid}` with public fields (`displayName`, optional `photoURL`, etc.).
- Profile doc path is fixed: `users/{uid}`.

Hard rule:

- Do not split `lastRoute` and `rivalUserIds` across different docs.

Suggested profile shape:

- `lastRoute: string` (example `/group-stage/H`)
- `rivalUserIds: string[]` (max 3)
- `updatedAt: timestamp`

### 5.2 Demo mode

- Rival user list from static JSON dataset.
- Demo mode must support rivals + `lastRoute` with existing demo persistence strategy.
- Draw-confirmed gating and `tournamentPhase` simulation must work in demo mode.
- Demo mode uses the selected demo phase by default; when a demo override is active, that override computes `tournamentPhase` instead.
- If both selected demo phase and demo override are present, demo override takes precedence.

Demo persistence contract (required):

- Demo mode must persist `lastRoute` under key `demo:lastRoute`.
- Demo mode must persist `rivalUserIds` under key `demo:rivalUserIds`.
- Use the existing demo persistence store consistently across surfaces (for example `localStorage`); no alternate keys are permitted.

## 6) Shared layout, components, and visual system

### 6.1 Required visuals

- Header wash on primary page headers.
- Primary card glow on:
  - Landing entry tiles
  - Primary prediction cards
  - Bracket cards

Theme requirements:

- Token-driven only; no hard-coded hex in feature components.
- Define for both light and dark themes.
- Aesthetic target: subtle cosmic purple/indigo while maintaining readability.
- Define semantic theme variables including:
  - `--wash-from`
  - `--wash-via`
  - `--wash-to`
  - `--glow-color`

Motion requirements:

- Reuse shared timing/easing tokens.
- Under 200ms.
- Ease-in-out.
- No layout-shifting animation.
- No continuous looping motion.

Typography requirements:

- `PageHeaderV2` defines sole H1 scale for primary pages.
- Secondary sections use H2 tokens.
- No ad-hoc heading scales.

Density target:

- 3-6 primary interactive elements visible without scroll on desktop primary prediction surfaces.

### 6.2 Required primitives

Create/adapt under existing structure (example `src/components/v2/`):

- `AppShellV2` (consistent max-width + padding; desktop rail support)
- `PageHeaderV2` (title, subtitle, actions; includes header wash)
- `RailLayoutV2` (desktop main+rail, mobile single-column + peek trigger)
- `SnapshotStamp`
- `StatusBadge` (`PENDING`, `PROVISIONAL`, `FINAL`, `LOCKED`)
- `ProgressMeter`
- `TeamIdentity`
- `V2Card` (includes glow)

StatusBadge color semantics:

- `PENDING` neutral
- `PROVISIONAL` accent
- `FINAL` success
- `LOCKED` muted

Coloring must come from theme tokens.

### 6.3 Rival Mode toggle contract

- One global header toggle controls Rival Mode.
- Session-scoped state (not persisted to Firestore).
- Initial state defaults to OFF on application load.
- State survives route navigation.
- Rival Mode state is single-source global UI state; pages must not create independent toggle state or persist it.
- No page-local Rival Mode toggles.
- Toggling Rival Mode updates presentation only (no data reload trigger).

Supported pages:

- Group Stage
- Match Picks
- Knockout Bracket
- Leaderboard

Acceptance:

- Enabling on one page enables everywhere supported.
- Navigation does not reset it.

### 6.4 Persistent leaderboard rail contract

Desktop-only rail on:

- Group Stage
- Match Picks
- Knockout Bracket

Rail behavior:

- Informational only (no editing)
- Links to `/leaderboard`
- Always includes `SnapshotStamp`
- Contextual content varies by page + `tournamentPhase`
- Until snapshot data is available, rail shows a skeleton or placeholder with snapshot messaging (never an empty rail).

Context examples by surface:

- Group Stage: projected placement, qualification pressure, rival proximity
- Match Picks: momentum summaries, upcoming swing potential
- Bracket: advancement comparisons, rivalry deltas

Mobile behavior:

- No rail
- Use mobile leaderboard peek sheet

Acceptance:

- Shared rail layout across all 3 pages
- No layout shifts between pages
- Rival Mode toggle updates rail context without navigation

## 7) Surface contracts

### 7.1 Landing v2 (`/`)

Purpose:

- App hub and only rival-edit surface.

Required UI:

1. Exactly 4 entry tiles:
- Group Stage
- Match Picks
- Knockout Bracket
- Main Leaderboard

2. Continue CTA:
- Prominent `Continue`
- Uses per-user `lastRoute`
- Fallback `/` for missing/invalid/unauthorized `lastRoute`; clear stored `lastRoute` only for invalid/unauthorized cases

3. Rivals selector (Landing-only editable):
- Button label `Rivals (N/3)`
- Opens modal/drawer
- Data source prod: Firestore users directory
- Data source demo: static JSON users list
- Max selection 3, removable chips/list
- Persist `rivalUserIds` to profile doc

4. Rules/info block:
- Absolute group-stage lock timestamp
- Rival/other-user picks hidden until lock (users can always view/edit their own picks pre-lock)
- Leaderboard updates daily
- Snapshot stamp

Acceptance:

- `/` is default post-login route.
- Continue routes to stored `lastRoute` or fallback.
- Fallback behavior clears invalid/unauthorized `lastRoute` entries.
- Stored `/knockout-bracket` remains routable pre-draw and shows the bracket empty state (no fallback and no `lastRoute` clearing).
- Rival editing only on Landing; cap enforced and persisted.
- Pre-lock: no rival picks revealed outside Landing.

Rival Mode presentation from Landing-configured rivals:

- Supported pages use tabs like `You | Rival 1 | Rival 2 | Rival 3`.
- Pre-lock: rival identities can be visible but pick content remains hidden.
- Post-lock: comparisons/social signals enabled.

### 7.2 Cross-surface Rival Mode and overlays

Global rules:

- `rivalUserIds` max 3, editable only on Landing.
- No edit-rivals control outside Landing.
- Pre-lock: rival picks hidden; identity-only view allowed.
- Pre-lock: non-pick signals allowed.
- Post-lock: read-only comparisons allowed.

Allowed post-lock overlay placements:

- Group Stage locked view: within group panels/cards
- Match Picks locked view: within match list/cards
- Bracket locked view: on winner chips/paths
- Each supported Rival Mode page must render at least one post-lock read-only comparison element. Placement bullets in this section are examples of acceptable placements, not optionality of having comparisons.

### 7.3 Group Stage v2 (`/group-stage/:groupId`)

Group picker:

- Sticky header
- Scrollable pill tabs `A-L`
- Jump grid modal/sheet with status per group:
  - `complete` if ranking length is 4 and unique
  - `incomplete` otherwise
  - `locked` after global deadline

Group ranking:

- Strict ordering 1-4
- Drag-and-drop reorder (`dnd-kit` recommended)
- Top 3 emphasis:
  - 1st/2nd = Qualified
  - 3rd = Third-place candidate
- Row content: flag + name + optional accent + drag handle

Best 8 third-place qualifier board:

- Separate section with 12 group tiles (`A-L`)
- Tile value is each group's current 3rd-place candidate
- Must select exactly 8 groups

Exact selection rules:

- Meter text: `Third-place qualifiers: X / 8 selected`
- Hint text:
  - if `X < 8`: `{8 - X} more left`
  - if `X == 8`: `All set`
- When `X == 8`:
  - disable selecting unselected tiles
  - allow deselecting selected tiles
- Incomplete group ranking -> tile disabled with `Not ready`
- If selected group's 3rd-place team changes:
  - selection remains attached to group
  - tile content updates to new team

Required UX feedback for selection persistence:

- Subtle tile update animation
- Transient helper text: `Selection stays with Group X`
- Feedback auto-dismisses

Acceptance:

- Selection count does not change when 3rd-place team changes in selected group.
- No extra user action required.

Lock/locked behavior:

- Uses `GROUP_STAGE_DEADLINE_UTC`.
- Post-lock disables ranking + qualifier edits.
- Show lock badge + snapshot stamp.
- Enable read-only rival overlays post-lock.

Locked view:

- Show status driven by results: `PENDING` / `PROVISIONAL` / `FINAL`
- Always show snapshot stamp

Rival/social context in this screen:

- Show comparison overlays when Rival Mode on
- Never reveal hidden picks pre-lock
- Pre-lock can show non-pick competitive signals while keeping picks hidden
- Post-lock can show deltas/momentum/qualification pressure signals
- Overlays remain read-only and do not alter interaction
- Allowed example signals include:
  - `You lead Rival 1 by +2 pts`
  - qualification risk indicators
  - per-group delta arrows

### 7.4 Match Picks v2 (`/match-picks`)

Timeline feed and editable window:

- Render one time-ordered feed segmented into sections.
- Latest-first ordering within each section.
- Editable matches restricted to rolling next 48-hour window.
- All match-window calculations must use UTC.
- Compute section assignment and editability through shared logic (for example `computeMatchTimelineModel(matches, nowUtc, lockFlags)` and `isMatchEditable(match, nowUtc, lockFlags)`); `/match-picks` must consume this derived model and must not implement independent time gating.
- If no upcoming matches exist, the editable window must anchor to the most recent kickoff timestamp and extend 48 hours from that kickoff.

Zero-fixture dataset rule:

- If there are no fixtures at all (no upcoming and no historical kickoff timestamps), render an explicit empty state: `No matches available` with snapshot stamp.
- No editable window is computed; all editing controls are disabled.

Sections:

1. `UPCOMING (Editable)`
2. `RECENT RESULTS` (completed in last 48h)
3. `OLDER RESULTS` (collapsed archive)

Status assignment rules:

- `scheduled`/`not_started`: `UPCOMING`; editable only when canonical shared editability logic marks it editable (kickoff inside editable window + shared lock flags allow edits).
- `live`/`in_progress`: `UPCOMING`; always read-only.
- `completed`: `RECENT RESULTS` when completion timestamp is within last 48h (or kickoff timestamp fallback when completion timestamp missing); otherwise `OLDER RESULTS`.
- `postponed`/`canceled`: `OLDER RESULTS`; always read-only.
- Unknown status: `OLDER RESULTS`; always read-only.
- If required kickoff/completion timestamps are missing or invalid and no explicit fallback applies, classify as `OLDER RESULTS` and keep read-only.

Archive behavior:

- Always collapsed on load
- Expansion state is not remembered

Boundary recalculation requirements:

- Recalculate section assignment on page load
- Recalculate every 5 minutes while page stays open
- Recalculation uses already-loaded match data only; it does not refetch fixtures or snapshots.
- The 5-minute recalculation reclassifies using already-loaded match data and the normalized UTC clock only; it must not refetch snapshots, leaderboard data, or fixtures.
- Matches auto-move between sections when crossing boundaries
- No manual refresh required
- Reclassification must not reset scroll position
- Reclassification must not reset expanded/collapsed state
- Use one normalized UTC clock source for all time comparisons

Purpose:

- prevent inconsistent ordering across sessions
- ensure all users see the same timeline grouping

Card layout:

- Card-based M1 layout
- Card fields: teams, predicted scores, lock context

KO extras (strict logic):

- Knockout match + predicted draw at 90 (`homeScore === awayScore`):
  - show required `eventualWinnerTeamId`
  - show required `koWinMethod` (AET/Pens)
- Otherwise:
  - hide KO extras
  - clear any previously stored KO extras on save (`eventualWinnerTeamId`, `koWinMethod`)

Lock behavior:

- Disable edits only when the canonical shared match editability model (derived from shared selectors plus shared `tournamentPhase`/`lockFlags`) marks the match non-editable.
- `/match-picks` must not perform page-local kickoff/time inference; it renders canonical derived editability state.
- Rival secrecy timing (Match Picks):
  - Rival pick content for Match Picks is hidden until global `lockFlags.picksHidden` becomes `false` (post-lock).
  - Rival match picks do not unlock per-match kickoff; visibility is controlled only by shared `lockFlags.picksHidden` / `lockFlags.rivalsComparisonVisible`.

Acceptance:

- Editing disabled outside allowed window.
- Archive starts collapsed on refresh.
- Timeline order/classification deterministic across sessions.
- KO extras shown only for predicted draws and cleared on save when not draw.

### 7.5 Knockout Bracket v2 (`/knockout-bracket`)

Draw-confirmed gating (canonical detection; required):

- `koDrawConfirmedSignal` is `true` only when all of the following are satisfied:
  - There is a fixture list for the opening KO round (Round of 32) identifiable by either:
    - `stage === "KO"` and `round === "R32"` (preferred), or
    - `knockoutRoundIndex === 0` (stable fallback for numeric-index datasets).
  - The opening KO round contains at least 16 fixtures.
  - For those fixtures, each has:
    - `homeTeamId` and `awayTeamId` both present and non-empty.
    - `kickoffUtc` present and parseable as a UTC timestamp.
- If fixture metadata cannot identify the opening KO round, treat the signal as `false` (not draw-confirmed) rather than guessing.
- Demo dataset must include fixture data compatible with the same detection logic.
- This canonical fixture-presence signal is the only allowed source for `koDrawConfirmedSignal` consumed by `computeTournamentPhase`.

Pre-draw UX:

- Stay on `/knockout-bracket` (no redirect)
- Render informative empty state with:
  - page title
  - short explanation
  - snapshot stamp

Pre-draw vs KO fail-safe precedence:

- If `koDrawConfirmedSignal` is `false`, render the pre-draw empty state regardless of KO kickoff validity.
- KO kickoff missing/invalid fail-safe evaluation applies only when `koDrawConfirmedSignal` is `true` and KO would otherwise be open (section 3.1 `KO_LOCKED` rule).

Product rules:

- Winners-only bracket picks (no score input in bracket)
- Guided round-by-round progression
- Next round unlocks only after prior round complete
- Opens when draw confirmed
- Locks all at once before first KO kickoff; kickoff-time evaluation is computed centrally in shared phase/lock computation and exposed via `{ tournamentPhase, lockFlags }`.
- If first KO kickoff is missing/invalid:
  - demo mode: keep unlocked and show warning.
  - production mode: fail-safe to locked only when KO would otherwise be open.
- In production, the KO missing/invalid kickoff fail-safe overrides computed open KO state and forces `tournamentPhase = KO_LOCKED` with `lockFlags.knockoutLocked = true`.
- `/knockout-bracket` must not infer KO lock state from fixture times locally; it renders shared `tournamentPhase` and shared `lockFlags`.
- Status representation:
  - `PROVISIONAL` while tournament ongoing
  - `FINAL` when complete
- Always show snapshot stamp

Demo mode:

- End-to-end bracket flow must work in demo
- Draw-confirmed gating must work in demo

Visuals:

- Global v2 visual tokens apply
- Optional ambient bracket gradient allowed only if token-driven, low opacity, readable in both themes

Rival Mode:

- Pre-lock: rivals visible, picks hidden
- Post-lock: advancement path differences + momentum signals
- Layout must remain stable when Rival Mode toggles
- Comparisons must not interfere with pick interaction

### 7.6 Leaderboard surfaces

Desktop L1:

- Persistent right rail only on Group Stage, Match Picks, Bracket
- Informational only
- Always shows snapshot stamp
- Links to `/leaderboard`

Mobile L2:

- `League Peek` bottom sheet
- Trigger via FAB or header icon
- Shows leaderboard summary
- Always includes snapshot stamp

Canonical `/leaderboard` page:

- Primary destination
- Snapshot-driven only (no live recompute)
- Finalized points display
- Total points column
- Expandable breakdown:
  - Group Stage
  - Match Picks
  - Knockout Bracket
- Rival Mode social signals include:
  - rank changes
  - momentum indicators
  - rivalry swings
  - projected narrative messaging

Acceptance:

- Totals equal sum of breakdown categories
- Expanding rows does not reorder ranking
- Snapshot timestamp always visible

### 7.7 Exports migration (v2)

Goal:

- Add contextual per-screen exports while keeping Admin Console Exports working.
- Remove JSON and PNG export types across all export surfaces (user and admin).
- CSV is the only supported export format across all export surfaces.
- Do not add Exports tile to Landing.

Where user exports appear:

- Group Stage
- Match Picks
- Knockout Bracket
- Leaderboard

Admin exports:

- Remain on admin tooling page (example `/users` -> Data Tools)
- Existing non-export admin workflows remain unchanged; only export visibility timing/type constraints change in v2.

Visibility and platform rules:

- Desktop-only export UI
- No export UI on mobile
- Hidden pre-lock
- Visible post-lock
- Snapshot-based exports only
- Across user and admin export surfaces, exports are desktop-only, post-lock only, snapshot-only, and include no rival-specific fields.
- Export payload scope (deterministic):
  - Non-leaderboard pages (`/group-stage`, `/match-picks`, `/knockout-bracket`) export only the viewer's own picks for that surface and do not include leaderboard rows.
  - `/leaderboard` export includes the full canonical snapshot leaderboard rows (the same rows shown on `/leaderboard`) and no picks beyond what is shown on `/leaderboard`.
  - Rails and mobile peek sheets never define export scope.
- Per-surface visibility mapping:
- `/group-stage`: visible only when `tournamentPhase` is `GROUP_LOCKED`, `KO_OPEN`, `KO_LOCKED`, or `FINAL`.
- `/match-picks`: visible only when `tournamentPhase` is `GROUP_LOCKED`, `KO_OPEN`, `KO_LOCKED`, or `FINAL`.
- `/knockout-bracket`: visible only when `tournamentPhase` is `GROUP_LOCKED`, `KO_OPEN`, `KO_LOCKED`, or `FINAL`.
- `/leaderboard`: visible only when `tournamentPhase` is `GROUP_LOCKED`, `KO_OPEN`, `KO_LOCKED`, or `FINAL`.
- Admin export tooling: visible only when `tournamentPhase` is `GROUP_LOCKED`, `KO_OPEN`, `KO_LOCKED`, or `FINAL`.

Shared export UI:

- `ExportMenuV2` trigger/menu
- `ExportSheetV2` desktop panel/modal/sheet

Export UI must show:

- scope
- snapshot stamp (`Snapshot as of ...`)
- lock-state messaging

Export types for v2 (implementation order):

1. Download CSV (page-relevant scope, flattened)

Global rule:

- JSON export and PNG export are not available anywhere (user or admin).

Per-surface CSV scope:

- Group Stage: user group rankings + best-8 third selections
- Match Picks: user picks + KO extras if present
- Bracket: winners-only selections
- Leaderboard: full canonical snapshot ranking rows (`/leaderboard`), including total + breakdown columns if present in snapshot

Required export metadata:

- `exportedAt`
- `snapshotAsOf`
- `viewerUserId`
- `mode` (`demo` or `prod`)
- CSV format includes these as metadata header rows at the top of the file (not repeated per data row).

Data safety rule:

- No rival metadata in user or admin exports.

Migration phases:

- Phase A: ship contextual exports on the four user surfaces and enforce CSV-only export types across user and admin.
- Phase B: optional cleanup to reuse v2 export components in admin tooling.

Acceptance:

- Export button never appears on mobile.
- Export visibility follows `tournamentPhase`/lock state.
- CSV exports work in demo and prod.
- Only CSV export options appear across user and admin surfaces.
- JSON and PNG export options do not appear anywhere.
- Required metadata included.
- No rival metadata included.
- Admin exports remain functional.

## 8) Validation and execution plan

### 8.1 Validation approach

No Jest/Vitest required. Validate with:

1. `npm run build`
2. existing/custom lint checks
3. manual demo simulation

Manual simulation checklist:

- Landing:
  - `/` loads post-login
  - Continue uses stored `lastRoute`
  - invalid/unauthorized `lastRoute` falls back to `/` and clears `lastRoute`
  - stored `/knockout-bracket` continues to `/knockout-bracket` pre-draw and renders empty state (not unauthorized)
  - rivals editable only here, cap 3
- Group Stage:
  - DnD reorder persists
  - best-8 cap and hint text correct
  - group-attached third-place selection persistence works
  - lock disables edits
- Match Picks:
  - KO extras only for predicted draws
  - KO extras clear when save non-draw
- Bracket:
  - gated by draw-confirmed signal
  - winners-only guided flow
  - lock-all-at-once works
- Leaderboard:
  - desktop rail and mobile peek include snapshot stamp
- Exports:
  - hidden pre-lock
  - visible post-lock on desktop only
  - JSON/PNG options absent across user and admin export surfaces

### 8.2 Chunked delivery (same scope, normalized dependency order)

Chunk 0 - Guardrails and config:

- Confirm single sources for deadlines, snapshot formatting, demo mode, `tournamentPhase` source
- Add explicit mode input contract for the phase engine (no implicit mode inference)
- Define snapshot conflict tie-break behavior
- Define demo persistence contract (what persists, scope, and reset behavior)
- Confirm in-place v2 always-on activation contract
- Acceptance: `npm run build` passes and existing flows continue to work

Chunk 1 - Theme tokens and v2 primitives:

- Wash/glow tokens for light/dark
- `PageHeaderV2`, `V2Card`, shared motion/typography rules
- Acceptance: both themes show subtle wash/glow using tokens only

Chunk 2 - Landing v2 + profile persistence:

- Build landing hub
- Implement profile read/write for `lastRoute` + `rivalUserIds`
- `lastRoute` policy: clear only when stored route is invalid or unauthorized
- Acceptance: `/` is default post-login; Continue fallback to `/` clears invalid/unauthorized `lastRoute` only; rivals edit only on Landing with cap 3 and persistence

Chunk 3 - Route tracking:

- Debounced per-user `lastRoute` persistence
- `lastRoute` clear behavior aligns with Landing policy (clear only on invalid/unauthorized)
- Acceptance: navigating to `/group-stage/H` then `Continue` returns to `/group-stage/H`; valid stored routes are not cleared

Chunk 4 - Group Stage shell and group navigation:

- Route redirect behavior
- Tabs/jump/status
- Per-surface `ExportMenuV2` wiring for Group Stage (desktop-only, post-lock)
- Acceptance: tabs and jump update URL/state correctly on desktop and mobile

Chunk 5 - Group ranking DnD:

- Strict ranking + persistence + lock handling
- Acceptance: no duplicates; persists after refresh; lock disables drag

Chunk 6 - Best-8 third-place board:

- Exact cap logic + group-attached selection behavior + feedback
- Acceptance: behavior exactly matches section 7.3 cap/hint/group-sticky rules

Chunk 7 - Leaderboard embed surfaces:

- Prerequisite: `tournamentPhase` source and snapshot model implemented.
- Desktop rail + mobile peek
- Snapshot stamp consistency
- Per-surface `ExportMenuV2` wiring for Leaderboard (desktop-only, post-lock)
- Acceptance: no layout crush, mobile sheet works, snapshot stamp always visible

Chunk 8 - Match Picks v2:

- Timeline model + deterministic boundaries
- KO extras logic
- Lock gating
- Per-surface `ExportMenuV2` wiring for Match Picks (desktop-only, post-lock)
- Acceptance: KO extras shown only for predicted draws; locked matches are non-editable

Chunk 9 - Knockout Bracket v2:

- Draw-confirmed gating
- Guided winners-only flow
- Lock-all-at-once
- Demo completeness
- Per-surface `ExportMenuV2` wiring for Knockout Bracket (desktop-only, post-lock)
- Acceptance: end-to-end in demo mode with draw-confirmed gating and snapshot stamp

Chunk 10 - Final polish:

- spacing, hierarchy, micro-interactions
- Rival Mode behavior consistency and secrecy validation
- Enforce CSV-only exports across all surfaces
- Remove JSON/PNG export options everywhere
- Confirm at least one Rival Mode overlay per supported page
- Fill remaining missing UX states
- Acceptance: visual polish is consistent; exports are CSV-only; rival behavior remains post-lock/read-only; required Rival Mode overlays and missing UX states are complete

Global Rival Mode acceptance checklist:

- Single global toggle behavior
- Pre-lock secrecy preserved
- Post-lock comparisons enabled consistently
- Rail reacts immediately to toggle
- No page navigation required to refresh rival view state

## 10) Clarifying questions (remaining)

- None. All previously open decisions are resolved in this spec version.
