# Mobile Companion Refactor Plan (`implement_mobile.md`)

## 1. Product Boundary (Companion, Not Parity)
Mobile is a companion surface, not a parity surface.

- Web remains primary for dense setup, administration, demo mode, and advanced comparison.
- Mobile prioritizes quick check-ins, live tracking, lightweight edits, rivalry, match context, and reminders.
- Dense, comparative, administrative, or setup-heavy workflows default to explicit web handoff, not mobile replication.
- Decision rule: prefer mobile only when a workflow is fast, time-sensitive, and understandable as a narrow-screen, stepwise flow.

## 2. Repo-Grounded Current State
Current architecture and constraints in this repo:

- Single shared SPA with `HashRouter` in `src/main.tsx` and route gates in `src/ui/App.tsx`.
- Current routes include member, admin, and demo surfaces (`/`, `/group-stage/*`, `/match-picks`, `/knockout-bracket`, `/leaderboard`, `/admin/*`, `/demo/*`).
- Shared desktop shell in `src/ui/Layout.tsx`; mobile currently uses page-level responsive adaptations, not a dedicated companion shell.
- Core pages are dense/monolithic:
  - `src/ui/pages/LandingPageContent.tsx`
  - `src/ui/pages/GroupStagePage.tsx`
  - `src/ui/pages/PicksPage.tsx`
  - `src/ui/pages/BracketPageContent.tsx`
  - `src/ui/pages/LeaderboardPage.tsx`
- Shared data/write logic already exists and should be reused:
  - Snapshot/data cache: `src/lib/data.ts`
  - Picks write/read: `src/ui/hooks/usePicksData.ts`
  - Group-stage write/read: `src/ui/hooks/useGroupStageData.ts`
  - Bracket write/read: `src/ui/hooks/useBracketKnockoutData.ts`
  - Profile/rivals: `src/ui/lib/profilePersistence.ts`
  - Phase/lock flags: `src/ui/context/TournamentPhaseContext.tsx`, `src/ui/lib/tournamentPhase.ts`
- Admin/demo are route-driven and role-gated today, but shared-component reuse creates risk that admin/demo affordances could appear in companion routes unless explicitly constrained.
- No existing push notification or analytics pipeline in repo today.

## 3. Non-Goals
- No full web parity on mobile.
- No admin workflows on mobile.
- No demo mode on mobile.
- No dense table-first mobile UX.
- No drag-first mobile UX.
- No separate app architecture in this phase unless repo constraints force it.

## 4. Phased Implementation (With Ongoing Cleanup)
Cleanup/deprecation is continuous, not final-phase-only.

### Phase 0: Companion Guardrails + Early Cleanup
Objective: establish hard boundaries before feature work.

- Add companion capability model (surface, mode, role) and feature flags.
- Introduce companion route namespace (`/m/*`) for companion functionality ownership.
- Keep legacy routes web-owned; do not treat desktop-first routes as companion routes via responsive styling alone.
- Block/redirect invalid companion entry points:
  - `/admin*` and `/demo*` from companion surface
  - desktop-first dense paths when opened from companion shell
- Begin cleanup immediately:
  - remove companion links to admin/demo
  - remove mobile entry shortcuts into desktop-only dense workflows
- Add smoke tests for route gating and capability enforcement.

### Phase 1: Dedicated Mobile Companion Shell
Objective: ship mobile-native navigation and context framing.

- Build `MobileCompanionLayout` for `/m/*` with bottom nav:
  - Home, Predictions, Leaderboard, Match Center, Profile.
- Keep existing desktop `Layout` for web routes.
- Add explicit capability props/wrappers for reused components so companion surface cannot render admin/demo actions.

Cleanup in this phase:
- Retire duplicate floating affordances that conflict with shell navigation on migrated companion routes.

### Phase 2: Home / Live Dashboard (`/m`)
Objective: quick check-in surface with immediate value.

- Build compact dashboard using existing shared logic:
  - next lock, pending actions, live/recent pulse, rivalry status, continue actions.
- Reuse phase locks and snapshot hooks; avoid parallel business logic.

Cleanup in this phase:
- Remove old mobile shortcuts from legacy pages once dashboard actions replace them.

### Phase 3: Predictions Companion (`/m/predictions`)
Objective: lightweight action-taking only.

In scope:
- Quick match edits in active edit windows.
- Lightweight bracket edits (active-round winner updates).
- Group-stage status/review.

Out of scope:
- Full dense group ranking manipulation.
- Full bracket canvas parity.
- Deep scenario analysis/comparison workflows.

Implementation rule:
- Out-of-scope workflows must use explicit `Continue on web` transitions, not partial or ambiguous mobile implementations.

Implementation:
- Reuse existing write hooks (`usePicksData`, `useBracketKnockoutData`, group-stage read state).
- Keep group-stage dense manipulations web-only with direct handoff.

Cleanup in this phase:
- Retire legacy mobile edit paths that duplicate or conflict with companion predictions flow.

### Phase 4: Leaderboard + Rivalry (`/m/leaderboard`)
Objective: high-engagement standings and rivalry loop.

- Mobile-first card rows, rivalry focus, momentum deltas, selected rivals.
- Reuse identity/rival persistence and leaderboard presentation logic.
- Avoid dense horizontal table-first patterns.

Cleanup in this phase:
- Remove companion entry into dense leaderboard table paths once companion route is stable.
- Retire duplicate rivalry controls spread across old pages.

### Phase 5: Match Center (`/m/matches`) (Optional in MVP if low-risk)
Objective: context and awareness loop.

- Use existing timeline model (`computeMatchTimelineModel`) for live/upcoming/results.
- Cross-link to predictions quick edits.

Cleanup in this phase:
- De-emphasize old mobile-unfriendly results/archive flows where redundant.

### Phase 6: Notifications, Profile, and Final Deprecation Sweep
Objective: complete companion loop and remove remaining drift points.

- `/m/profile` for league context and companion-relevant settings.
- In-app reminders first; push behind flag once infra exists.
- Final deprecation sweep after replacement companion routes are validated:
  - remove remaining invalid mobile entry points
  - retire superseded overlays, shortcuts, and competing affordances
  - remove dead legacy mobile UX paths and stale routing hooks
  - consolidate docs and tests to the companion steady state

## 5. Safeguards and Risk Controls
Cross-cutting controls required across phases:

- Admin/demo exposure prevention:
  - route denylist for companion surface
  - no admin/demo nav in companion shell
  - explicit component-level capability checks
- Shared-component leakage prevention:
  - mobile-safe wrappers/capability props for reused UI blocks
  - no implicit rendering of demo toggles/export/admin actions on `/m/*`
- Permission boundaries:
  - preserve current gate logic (`MemberGate`, `AdminGate`, `DemoAdminGate`)
  - preserve Firestore server-side authorization boundaries
- Data/model safety:
  - reuse current write adapters and schemas; additive-only changes
  - avoid introducing privileged list reads into companion-only flows
- Feature flags:
  - global kill switch plus per-surface flags
- Migration safety:
  - keep web routes operational during migration
  - remove legacy mobile paths only after replacement validation
- Telemetry (required for rollout confidence):
  - companion route entry (`/m` area opened)
  - prediction save attempt / success / failure
  - `Continue on web` handoff taps
  - rivalry interactions (add/remove/reorder/select)
  - reminder interactions (view, tap-through, dismiss)

## 6. Success Metrics
Success is measured by companion outcomes, not parity:

- Users complete core companion check-in flows without falling back to desktop-first pages.
- Reduced usage of legacy dense mobile-unfriendly routes.
- Strong save success rate for companion prediction edits.
- Repeat usage of leaderboard/rival flows.
- Strong engagement with time-sensitive reminder surfaces.
- Low incidence of admin/demo affordance exposure on companion routes.

## 7. MVP Boundary (Outcome-Oriented)
MVP is outcome-based, not hard-coupled to exact phase numbers:

- Dedicated companion shell under `/m/*`.
- Hard route/surface gating (admin/demo excluded).
- Home/live dashboard.
- Lightweight predictions flow with explicit web handoff for out-of-scope flows.
- Leaderboard/rivalry flow.
- Match center included only if low-risk using existing timeline model.

Later follow-up:

- Push notification pipeline.
- Deeper analytics dashboards.
- Additional companion refinements after observed usage.

## 8. Cleanup/Deprecation Recommendations
### Remove
- Companion entry to admin/demo surfaces.
- Companion entry to dense desktop-first pages once replacements exist.

### Simplify
- Mobile prediction editing to quick-action flows.
- Bracket mobile to active-round-first editing and summary review.

### Merge
- Spread profile/rival management into companion profile and leaderboard surfaces.
- Replace multiple floating mobile affordances with shell-native navigation/actions.

### Reduce Scope
- Keep exports/admin/demo/advanced comparisons web-only.
- Keep full dense group/bracket manipulation web-only.

### Final Sweep
- Retire duplicate controls that compete with companion shell.
- Remove superseded overlays, shortcuts, and stale affordances (not only CSS) once replacement routes are validated.
- Delete dead mobile-only styling and route glue no longer in use.
- Update smoke tests and route guards to enforce the new steady state.

## 9. Codebase Constraints That Shape This Plan
- Single shared SPA means route and component capability controls are mandatory.
- Large page files favor incremental companion extraction over heavy in-place branching.
- Existing hook/model layer is strong; reuse it to reduce regression risk.
- No current push/analytics infra means reminders/telemetry should stage in gradually.
- Existing strict Firestore rules support safe boundaries but require explicit updates for new collections.

## 10. Revision Summary
This cleanup pass:

- Softened admin/demo leakage wording to “risk unless constrained.”
- Made `/m/*` ownership explicit and rejected responsive-only drift.
- Made web handoff operational in Predictions via explicit `Continue on web` transitions.
- Added concrete telemetry examples (route entry, saves, handoff taps, rivalry, reminders).
- Strengthened final deprecation sweep to include overlays/shortcuts/superseded affordances, not just CSS.
- Added decision rule for when workflows belong on mobile vs web.
