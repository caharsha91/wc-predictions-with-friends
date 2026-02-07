# 1. Executive Summary
- Redesign the app into a deterministic Play Center loop: Plan → Pick → Advance → Review → Compete → Export, with one dominant CTA per screen.
- Replace dashboard-first information density with action-first hierarchy: above-the-fold next action, secondary data collapsed by default, and strict pagination caps.
- Implement a pure resolver + state machine to make “what to do now” predictable across refreshes, saves, and lock transitions.
- Keep route compatibility through explicit redirects while adopting a cleaner `/play` and `/admin` IA.
- Preserve all behavior contracts: picks logic, lock rules, Spark-safe reads/writes, and export shape/metadata.
- Enforce token-only theming with CI guardrails to prevent ad-hoc color drift and maintain the black/gray modern visual system.
- Include full cleanup scope (dead routes/components/styles/tokens/copy/tests) to reduce long-term maintenance risk and prevent UX regressions.

# 2. IA + Route Map
## 2.1 Route Tree
- `/play`
- `/play/picks`
- `/play/picks/wizard`
- `/play/bracket`
- `/play/results`
- `/play/league`
- `/admin/players`
- `/admin/exports`
- `/settings` (minimal account/theme only)

## 2.2 Redirect Table
| Legacy route | Redirect target |
|---|---|
| `/` | `/play` |
| `/picks` | `/play/picks` |
| `/picks/wizard` | `/play/picks/wizard` |
| `/bracket` | `/play/bracket` |
| `/results` | `/play/results` |
| `/leaderboard` | `/play/league` |
| `/players` | `/admin/players` |
| `/exports` | `/admin/exports` |

## 2.3 Navigation Model
- Primary sidebar groups:
  - `Play`: Play Center, Picks, Bracket, Results, League
  - `Admin` (de-emphasized): Players, Exports
  - `Settings`: minimal account/theme
- Mobile navigation mirrors desktop order and labels.
- Exactly one active primary nav item at a time; no duplicate destinations.
- Redirects execute before auth-gate rendering to avoid route flicker.

# 3. Deterministic Play Center Resolver
## 3.1 Data Inputs (list what data is needed)
- `nowUtc` (clock tick source)
- Open picks candidates: `{ id, lockDeadlineUtc, kickoffUtc, stageOrder, label }`
- Open bracket candidates: `{ id, lockDeadlineUtc, kickoffUtc, stageOrder, label }`
- Latest results update timestamp: `latestResultsUpdatedUtc`
- Session “results seen” timestamp: `seenResultsUpdatedUtc`
- Locked/waiting next unlock timestamp: `nextUnlockUtc` (if known)
- Locked/waiting next relevant deadline timestamp: `nextDeadlineUtc` (fallback)
- Last submitted pick timestamp: `lastSubmittedUtc`
- Optional view flags: `hasOpenPicks`, `hasOpenBracket`, `hasRecentResults`

## 3.2 State Definitions
- `LOADING`: initial/refresh pending; resolver not yet run successfully.
- `READY_OPEN_PICKS`: dominant action is open picks.
- `READY_OPEN_BRACKET`: dominant action is open bracket picks.
- `READY_RESULTS`: dominant action is view unseen latest results.
- `READY_LOCKED_WAITING`: no open action; waiting for unlock/deadline.
- `READY_IDLE`: no pending actions.
- `ERROR`: data load or resolver input failure.

## 3.3 Event Handling Rules
- Supported events: `DATA_LOADED`, `DATA_REFRESHED`, `CLOCK_TICK`, `PICK_SAVED`, `BRACKET_SAVED`, `LOCK_STATUS_CHANGED`, `ROUTE_ENTERED`, `DATA_FAILED`.
- On all non-error events: run `resolveNextAction(context)` and map to one `READY_*` state.
- `DATA_FAILED` always transitions to `ERROR`.
- `LOADING` exists only until first successful resolver run.
- `CLOCK_TICK` interval: 30s while `/play` or wizard routes are active.
- `PICK_SAVED`/`BRACKET_SAVED` always trigger immediate re-resolve.

## 3.4 resolveNextAction() Pseudocode (TypeScript-like)
```ts
type NextActionKind =
  | 'OPEN_PICKS'
  | 'OPEN_BRACKET'
  | 'VIEW_RESULTS'
  | 'LOCKED_WAITING'
  | 'IDLE'

type Candidate = {
  id: string
  label: string
  lockDeadlineUtc?: string
  kickoffUtc?: string
  stageOrder?: number
}

type ResolverInput = {
  openPicks: Candidate[]
  openBracket: Candidate[]
  latestResultsUpdatedUtc?: string
  seenResultsUpdatedUtc?: string
  nextUnlockUtc?: string
  nextDeadlineUtc?: string
  lastSubmittedUtc?: string
}

type ResolverOutput = {
  kind: NextActionKind
  targetId?: string
  label: string
  statusChip: 'deadline' | 'unlock' | 'lastSubmitted'
  timestamp?: string
  reason: string
}

function byTieBreakers(a: Candidate, b: Candidate): number {
  const aDeadline = toMillis(a.lockDeadlineUtc)
  const bDeadline = toMillis(b.lockDeadlineUtc)
  if (aDeadline !== bDeadline) return aDeadline - bDeadline

  const aKickoff = toMillis(a.kickoffUtc)
  const bKickoff = toMillis(b.kickoffUtc)
  if (aKickoff !== bKickoff) return aKickoff - bKickoff

  const aStage = a.stageOrder ?? Number.MAX_SAFE_INTEGER
  const bStage = b.stageOrder ?? Number.MAX_SAFE_INTEGER
  if (aStage !== bStage) return aStage - bStage

  return a.id.localeCompare(b.id)
}

function pickTop(candidates: Candidate[]): Candidate | undefined {
  return [...candidates].sort(byTieBreakers)[0]
}

function resolveNextAction(input: ResolverInput): ResolverOutput {
  const topPick = pickTop(input.openPicks)
  if (topPick) {
    return {
      kind: 'OPEN_PICKS',
      targetId: topPick.id,
      label: topPick.label,
      statusChip: 'deadline',
      timestamp: topPick.lockDeadlineUtc,
      reason: 'Open picks due'
    }
  }

  const topBracket = pickTop(input.openBracket)
  if (topBracket) {
    return {
      kind: 'OPEN_BRACKET',
      targetId: topBracket.id,
      label: topBracket.label,
      statusChip: 'deadline',
      timestamp: topBracket.lockDeadlineUtc,
      reason: 'Open bracket picks due'
    }
  }

  const unseenResults =
    !!input.latestResultsUpdatedUtc &&
    (!input.seenResultsUpdatedUtc ||
      toMillis(input.latestResultsUpdatedUtc) > toMillis(input.seenResultsUpdatedUtc))

  if (unseenResults) {
    return {
      kind: 'VIEW_RESULTS',
      label: 'Review latest results',
      statusChip: 'lastSubmitted',
      timestamp: input.latestResultsUpdatedUtc,
      reason: 'Unseen latest results'
    }
  }

  if (input.nextUnlockUtc || input.nextDeadlineUtc) {
    return {
      kind: 'LOCKED_WAITING',
      label: 'Waiting for next unlock',
      statusChip: input.nextUnlockUtc ? 'unlock' : 'deadline',
      timestamp: input.nextUnlockUtc ?? input.nextDeadlineUtc,
      reason: 'No editable items'
    }
  }

  return {
    kind: 'IDLE',
    label: 'All caught up',
    statusChip: 'lastSubmitted',
    timestamp: input.lastSubmittedUtc,
    reason: 'No pending actions'
  }
}
```

## 3.5 Mid-Session Lock Handling Spec
- Trigger points: `CLOCK_TICK`, `PICK_SAVED`, `BRACKET_SAVED`, and failed save due to lock.
- If currently edited item locks:
  - UI switches to read-only controls.
  - Unsaved draft remains local and is not persisted.
  - Inline message: `Locked at {time}; moved to next action`.
  - Dominant CTA changes to `Go to next action`.
- Resolver re-runs immediately and updates state/CTA.
- If no next editable item exists, transition to `READY_LOCKED_WAITING` and show unlock/deadline chip.

# 4. Page Specs (One Dominant CTA)
## /play
### Purpose
- Global action hub to route user to the highest-priority playable task.
### Above-the-fold content
- PlayCenterHero with next action headline, last updated, status chip, and compact progress summary.
- DeadlineQueuePanel (top 3 upcoming deadlines, collapsed details).
### Dominant CTA
- `Continue next action` (resolver-driven target).
### Secondary actions
- `Open quick queue`, `View league` (ghost/secondary).
### Default collapsed/opt-in history behavior
- Sections: Open, Completed, Locked, Past; only Open expanded by default.
### Empty states
- `No actions right now. Check league or wait for next unlock.`
### Telemetry (events to log)
- `play_center_viewed`, `play_center_primary_cta_clicked`, `play_center_state_changed`, `play_center_lock_transition`.

## /play/picks
### Purpose
- Picks-focused action queue and wizard launcher.
### Above-the-fold content
- ActionSummaryStrip: needs-action count, deadline chip, progress bar.
- Compact quick queue (top N actionable matches).
### Dominant CTA
- `Continue picks wizard`.
### Secondary actions
- `Quick edit next match`.
### Default collapsed/opt-in history behavior
- History tab hidden behind `Past matchdays`; collapsed filters and paginated table.
### Empty states
- `No open picks. You’re ready for bracket/results.`
### Telemetry (events to log)
- `picks_page_viewed`, `picks_wizard_launch_clicked`, `picks_quick_edit_opened`, `picks_history_filter_changed`.

## /play/picks/wizard
### Purpose
- Complete picks in a deterministic step flow.
### Above-the-fold content
- Step index, progress, lock status, inline validation summary.
### Dominant CTA
- `Save & Next`.
### Secondary actions
- `Previous`, `Go to Next Incomplete`, context `Review & Submit` (only when allowed).
### Default collapsed/opt-in history behavior
- No dense history table on entry; review tables in collapsed disclosure.
### Empty states
- `No editable picks right now. Return when next window opens.`
### Telemetry (events to log)
- `picks_wizard_step_viewed`, `picks_wizard_saved`, `picks_wizard_validation_failed`, `picks_wizard_lock_transition`.

## /play/bracket
### Purpose
- Bracket progression and completion with clear next step.
### Above-the-fold content
- Next unresolved bracket matchup, lock timing, stage progress.
### Dominant CTA
- `Resume Next Action`.
### Secondary actions
- `Review bracket`, `Save bracket`.
### Default collapsed/opt-in history behavior
- Stage summary and full review collapsed by default.
### Empty states
- `No bracket action available. Return at next stage unlock.`
### Telemetry (events to log)
- `bracket_viewed`, `bracket_resume_clicked`, `bracket_pick_saved`, `bracket_lock_transition`.

## /play/results
### Purpose
- Fast results check with current-first context.
### Above-the-fold content
- Current matchday score summary and concise current table.
### Dominant CTA
- `Review latest results`.
### Secondary actions
- `Open Past matchdays`, `View scoring info`.
### Default collapsed/opt-in history behavior
- `Past matchdays` tab opt-in; disclosure for scoring info collapsed.
### Empty states
- `No finished matches yet.`
### Telemetry (events to log)
- `results_viewed`, `results_primary_review_clicked`, `results_history_opened`, `results_filter_changed`.

## /play/league
### Purpose
- Competitive standings with immediate personal context.
### Above-the-fold content
- Hero cards: current rank, gap to leader, one actionable insight.
### Dominant CTA
- `Improve next round` (deep-link to `/play/picks`).
### Secondary actions
- `View full standings`, `Open advanced metrics`.
### Default collapsed/opt-in history behavior
- Standings paginated by default; advanced metrics in disclosure.
### Empty states
- `No rank yet. Complete first picks to enter standings.` and `No scoring yet` fallback.
### Telemetry (events to log)
- `league_viewed`, `league_primary_cta_clicked`, `league_insight_rendered`, `league_pagination_changed`.

## /admin/players
### Purpose
- Manage league members and roles.
### Above-the-fold content
- Compact roster summary + form status.
### Dominant CTA
- `Save player`.
### Secondary actions
- `New`, `Edit role`.
### Default collapsed/opt-in history behavior
- Roster table paginated; no expanded audit/history by default.
### Empty states
- `No players configured.`
### Telemetry (events to log)
- `admin_players_viewed`, `admin_player_saved`, `admin_player_role_changed`.

## /admin/exports
### Purpose
- Generate admin-only Excel exports safely.
### Above-the-fold content
- Mode chooser, selector row, export status summary.
### Dominant CTA
- Mode-dependent single primary button:
  - Mode 1: `Download User Picks Export`
  - Mode 2: `Download Matchday Picks Export`
### Secondary actions
- Mode-dependent secondary export button (results/leaderboard snapshot).
### Default collapsed/opt-in history behavior
- Advanced diagnostics/status details collapsed.
### Empty states
- `No exportable records for selected filters.`
### Telemetry (events to log)
- `admin_exports_viewed`, `admin_exports_mode_changed`, `admin_export_started`, `admin_export_completed`, `admin_export_failed`.

## /settings (optional; if included keep minimal)
### Purpose
- Minimal account/theme controls only.
### Above-the-fold content
- Theme selector and sign-out.
### Dominant CTA
- `Save preferences`.
### Secondary actions
- `Reset to system theme`.
### Default collapsed/opt-in history behavior
- No history sections.
### Empty states
- `Settings unavailable for guest session.`
### Telemetry (events to log)
- `settings_viewed`, `settings_theme_changed`, `settings_saved`.

# 5. UI Tokens + Guardrails
## 5.1 Token Inventory (semantic + interaction + density tokens)
- Semantic:
  - `--background`, `--card`, `--surface-muted`, `--foreground`, `--muted-foreground`, `--border`, `--ring`.
- Brand/Accent:
  - `--primary`, `--secondary`, `--info` (blue/violet/cyan family only).
- Status:
  - `--success`, `--warning`, `--danger`, `--locked`.
- Interaction:
  - `--cta-primary-bg`, `--cta-secondary-bg`, `--hover-surface`, `--focus-ring`, `--disabled-opacity`.
- Density:
  - spacing/radius scales and list page-size constants:
    - core lists: `10`
    - history lists: `15`

## 5.2 Theme Files (which files own what)
- `/src/styles/themes.css`: raw light/dark palette primitives.
- `/src/styles/theme.css`: semantic token mapping and cross-app aliases.
- `/src/ui/theme/brand.ts`: brand constants and gradient usage policy.
- No color literals in page/component logic files.

## 5.3 Lint/CI Rules (explicit checks/patterns)
- `lint:tokens` script fails CI on ad-hoc `#hex`, `rgb()`, `hsl()` in non-theme TS/TSX files.
- CI step order: `lint:tokens` -> `tsc -b` -> `vitest` -> `vite build`.
- Rule: fail if pagination constants are bypassed by inline numeric page-size literals.
- Rule: fail if legacy route labels (`Picks` root-only naming) are reintroduced in nav config.

# 6. Component + File-Level Implementation Spec
## 6.1 Component Map
### PlayCenterHero
- Responsibilities: render resolver outcome headline, state chip, last-updated, single dominant CTA region.
- Required props: `state`, `headline`, `statusChip`, `timestamp`, `primaryAction`, `secondaryActions[]`.
- Must NOT do: fetch data, compute resolver logic, mutate picks/bracket state.
- Used on pages: `/play`, `/play/picks`, `/play/bracket`, `/play/results`, `/play/league`.

### ActionSummaryStrip
- Responsibilities: display counts, progress, and status chip in compact format.
- Required props: `headline`, `subline?`, `metrics[]`, `statusChip`, `primaryAction`, `secondaryAction?`.
- Must NOT do: picks/bracket domain logic or resolver decisions.
- Used on pages: `/play`, `/play/picks`.

### DeadlineQueuePanel
- Responsibilities: show prioritized upcoming lock/deadline queue with compact rows.
- Required props: `items[]`, `onOpenItem`, `pageSize=10`.
- Must NOT do: determine priority order (expects pre-sorted input).
- Used on pages: `/play`, `/play/picks`.

### DetailsDisclosure
- Responsibilities: hide non-urgent content behind opt-in disclosure.
- Required props: `title`, `children`, `defaultOpen?`, `meta?`.
- Must NOT do: own fetch/mutation or page routing.
- Used on pages: `/play/results`, `/play/league`, `/play/bracket`, `/admin/exports`.

### PaginatedTable
- Responsibilities: reusable paginated table shell with default caps and controls.
- Required props: `columns`, `rows`, `pageSize`, `emptyState`, `onPageChange?`.
- Must NOT do: load remote data, infer filters, own business logic.
- Used on pages: `/play/results`, `/play/league`, `/admin/players`, `/admin/exports`.

## 6.2 Proposed File Tree Changes
- `+ src/ui/pages/play/PlayPage.tsx`
- `+ src/ui/pages/play/PlayPicksPage.tsx`
- `+ src/ui/pages/play/PlayPicksWizardPage.tsx`
- `+ src/ui/pages/play/PlayBracketPage.tsx`
- `+ src/ui/pages/play/PlayResultsPage.tsx`
- `+ src/ui/pages/play/PlayLeaguePage.tsx`
- `+ src/ui/components/ui/PlayCenterHero.tsx`
- `+ src/ui/components/ui/DeadlineQueuePanel.tsx`
- `+ src/ui/components/ui/PaginatedTable.tsx`
- `~ src/ui/App.tsx` (new route tree + redirects)
- `~ src/ui/nav.ts` (new labels/grouping)
- `~ src/ui/Layout.tsx` (admin de-emphasis + shell alignment)
- `~ src/ui/lib/nextActionResolver.ts` (final resolver contract)
- `~ src/ui/constants/pagination.ts` (single source of limits)
- `~ src/ui/pages/AdminUsersPage.tsx` (consume PaginatedTable)
- `~ src/ui/pages/AdminExportsPage.tsx` (single dominant CTA by mode)
- `- src/ui/pages/PicksPage.tsx` (migrated)
- `- src/ui/pages/PicksWizardPage.tsx` (migrated)
- `- src/ui/pages/BracketPage.tsx` (migrated)
- `- src/ui/pages/ResultsPage.tsx` (migrated)
- `- src/ui/pages/LeaderboardPage.tsx` (migrated)

# 7. Execution Plan (Increments) + DoD
## 1) Foundation + Theme
- Scope:
  - Finalize token mapping for black/gray system and accent constraints.
  - Add/strengthen token guardrail scripts and pagination constants.
- Files touched:
  - `src/styles/theme.css`, `src/styles/themes.css`, `src/ui/theme/brand.ts`, `scripts/checkThemeTokens.mjs`, `package.json`, `src/ui/constants/pagination.ts`.
- Definition of Done (checklist):
  - [ ] Token guard script passes locally and in CI.
  - [ ] No ad-hoc color literals in component/page TS/TSX files.
  - [ ] Core/history page-size caps centralized and imported.
  - [ ] `npm run build` and `npm run test` pass.
- Risks/Mitigations:
  - Risk: false positives in token lint.
  - Mitigation: scoped allowlist for theme files only.

## 2) Routing + IA Shell
- Scope:
  - Implement `/play` and `/admin` route tree and explicit redirects.
  - Update nav labels/grouping and keep auth gates unchanged.
- Files touched:
  - `src/ui/App.tsx`, `src/ui/nav.ts`, `src/ui/Layout.tsx`, route tests.
- Definition of Done (checklist):
  - [ ] All redirects resolve exactly as specified.
  - [ ] Sidebar/nav reflects Play Center IA.
  - [ ] Admin group visually de-emphasized.
  - [ ] No route-based permission regressions.
- Risks/Mitigations:
  - Risk: deep links break.
  - Mitigation: integration tests for old and new routes.

## 3) Play Center Hub
- Scope:
  - Create `/play` hub using resolver output and deadline queue.
  - Add one dominant CTA and collapsed secondary sections.
- Files touched:
  - `src/ui/pages/play/PlayPage.tsx`, `PlayCenterHero`, `ActionSummaryStrip`, `DeadlineQueuePanel`, resolver integration.
- Definition of Done (checklist):
  - [ ] Resolver drives dominant CTA deterministically.
  - [ ] First meaningful action is above fold.
  - [ ] Open/Completed/Locked/Past behaviors match defaults.
  - [ ] Telemetry events emitted for view/state/CTA.
- Risks/Mitigations:
  - Risk: stale resolver data.
  - Mitigation: clock tick + post-save re-resolve.

## 4) Picks + Bracket Wizard Tightening
- Scope:
  - Enforce one dominant CTA and deterministic step progression.
  - Lock-transition readonly fallback + local unsaved draft preservation.
- Files touched:
  - `PlayPicksPage.tsx`, `PlayPicksWizardPage.tsx`, `PlayBracketPage.tsx`, resolver and wizard hooks.
- Definition of Done (checklist):
  - [ ] Picks resume path is <=2 clicks from `/play`.
  - [ ] Mandatory knockout tie “Who advances?” validation enforced.
  - [ ] `Review & Submit` appears only under allowed conditions.
  - [ ] Lock transition message + CTA switch implemented.
- Risks/Mitigations:
  - Risk: wizard state confusion.
  - Mitigation: persistent resume key + deterministic next-step function.

## 5) Results + League
- Scope:
  - Current-first results, past history opt-in, and concise league motivation.
- Files touched:
  - `PlayResultsPage.tsx`, `PlayLeaguePage.tsx`, `DetailsDisclosure`, `PaginatedTable`.
- Definition of Done (checklist):
  - [ ] Results default = Current; Past matchdays tab present.
  - [ ] No expanded dense history table by default.
  - [ ] League shows current rank, gap to leader, actionable insight with fallback.
  - [ ] Only current user row highlighted.
- Risks/Mitigations:
  - Risk: empty data awkwardness.
  - Mitigation: explicit empty and fallback copy paths.

## 6) Admin Exports
- Scope:
  - Keep admin-only Excel export contract while simplifying UI hierarchy.
- Files touched:
  - `src/ui/pages/AdminExportsPage.tsx`, shared buttons/panels.
- Definition of Done (checklist):
  - [ ] Admin-only access intact.
  - [ ] `.xlsx` only flow preserved.
  - [ ] Required sheets/metadata unchanged.
  - [ ] One dominant CTA per selected mode.
- Risks/Mitigations:
  - Risk: regression in export payload shape.
  - Mitigation: fixture-based export contract tests.

## 7) QA + Polish + Full Cleanup Sweep (explicitly called out)
- Scope:
  - Remove dead routes/components/styles/tokens/utilities/copy/tests and finalize consistency.
- Files touched:
  - All migrated pages/components/styles/tests; cleanup scripts and CI workflow files.
- Definition of Done (checklist):
  - [ ] Legacy route-only pages removed or redirect-only.
  - [ ] Unused components/variants removed.
  - [ ] Stale CSS/duplicate utilities removed.
  - [ ] Unused tokens and outdated labels removed.
  - [ ] No unused exports and no dead test fixtures.
  - [ ] Full regression sweep passes (`build`, `test`, route checks, manual QA).
- Risks/Mitigations:
  - Risk: deleting still-needed assets.
  - Mitigation: identify → deprecate → migrate → remove with grep/tsc gates.

# 8. Cleanup Plan (Explicit)
## 8.1 Cleanup Inventory (what to search for and remove)
- Dead routes and redirect-only legacy pages.
- Unused components + variants.
- Stale CSS/utilities and duplicate classes.
- Unused tokens/variables.
- Old copy/labels and deprecated navigation items.
- Unused tests/fixtures/mocks.

## 8.2 Cleanup Method (safe migration)
- Identify → deprecate → migrate call sites → remove.
- “No usage” verification steps:
  - `grep -R` for legacy route/component/token identifiers.
  - `tsc -b` for type-level dead reference detection.
  - `npm run build` + `npm run test` as removal gate.
- Rollback strategy:
  - Keep route-level feature flag for one release cycle.
  - Re-enable legacy page wrappers if critical regression appears.

## 8.3 Cleanup Guardrails (prevent regression)
- Lint rules:
  - no ad-hoc colors outside theme files,
  - banned legacy classnames/selectors,
  - no unused exports.
- CI checks:
  - fail pipeline on lint, unused exports, or token violations.
- Optional audit script:
  - token usage scan + component usage matrix diff per PR.

# 9. Test Plan
## 9.1 Unit Tests (include resolveNextAction cases)
- `resolveNextAction` priority tests:
  - open picks beats bracket/results/locked.
  - bracket beats results/locked when no open picks.
  - results beats locked when unseen latest results exists.
  - locked/waiting beats idle when unlock/deadline exists.
- Tie-breaker tests:
  - earliest lock deadline,
  - earliest kickoff,
  - stage order,
  - lexical id.
- Lock transition tests:
  - editable item locks mid-session -> readonly + notice + re-resolve.

## 9.2 Integration/UI Tests (dominant CTA above fold, history collapsed default)
- Route redirect tests from every legacy path.
- `/play` renders one dominant CTA and collapsed secondary sections by default.
- `/play/picks` to `/play/picks/wizard` resume path <=2 interactions.
- `/play/results` defaults to Current; Past matchdays opt-in.
- `/play/league` highlights only current row and renders insight/fallback.
- `/admin/exports` mode-specific dominant CTA and preserved export options.

## 9.3 Manual QA Checklist (deadline boundary, empty league, slow network, redirects)
- Deadline boundary at exact lock minute while editing.
- Empty league/new user with no picks/standings entry.
- Slow network and partial loads (picks ready, results delayed; results ready, picks delayed).
- Old route deep links redirect correctly and browser back/forward remains coherent.
- Dense tables are not expanded by default on all main pages.

# 10. Acceptance Mapping Table
| Acceptance criterion | Pages | Components | Tests | Increment |
|---|---|---|---|---|
| First meaningful action above fold | `/play`, `/play/picks`, `/play/bracket`, `/play/results`, `/play/league` | `PlayCenterHero`, `ActionSummaryStrip` | UI integration snapshot/assertions | 3, 4, 5 |
| Picks completion <=2 clicks from Play Center | `/play`, `/play/picks/wizard` | `PlayCenterHero`, resolver wiring | Integration flow test | 4 |
| No expanded dense history by default | `/play`, `/play/picks`, `/play/results`, `/play/league` | `DetailsDisclosure`, `PaginatedTable` | UI default-state tests | 3, 5 |
| League shows position + gap + one actionable insight | `/play/league` | hero cards + insight module | Unit + UI fallback tests | 5 |
| Admin exports remain admin-only, xlsx-only, required sheets/metadata | `/admin/exports` | export mode panel + download actions | contract tests + role-gate tests | 6 |
| Deterministic resolver priority + tie-breakers | `/play`, `/play/picks`, `/play/bracket` | `resolveNextAction` | unit tests (priority/tie-break) | 3 |
| Mid-session lock handling deterministic | `/play/picks/wizard`, `/play/bracket` | wizard lock handler | unit + integration transition tests | 4 |
| Core lists 10 / history 15 defaults | all paginated pages | `PaginatedTable`, pagination constants | unit tests on page-size config | 1, 5 |
| No ad-hoc color literals outside theme files | all UI code | token lint script | CI lint check | 1, 7 |
| Legacy pages removed or redirect-only | route layer | router config | route coverage tests | 2, 7 |
| No unused exports/components after migration | shared UI + pages | cleanup scripts | CI unused-export check | 7 |

# 11. Diff Summary vs Prior Plan
- Route model is now fully normalized under `/play` and `/admin` with an explicit redirect matrix.
- Added a complete deterministic resolver spec with exact inputs, events, states, and pseudocode.
- Elevated “one dominant CTA” from guidance to per-page implementation contract.
- Added concrete page telemetry event definitions for all redesigned routes.
- Expanded component map with a required `DeadlineQueuePanel` and strict “must not do” boundaries.
- Added explicit file-tree migration plan (`+`, `~`, `-`) to guide refactor execution.
- Integrated cleanup work into every increment, not only as an end-phase task.
- Added a dedicated cleanup section with inventory, safe migration method, and rollback strategy.
- Added stronger CI/lint guardrails including token enforcement and legacy-pattern prevention.
- Added acceptance mapping table linking criteria to pages, components, tests, and increments.
