# Implementation Plan

This document tracks the agreed implementation plan and completion status for demo mode, play-center flow updates, and route/data behavior changes.

## Locked Requirements

1. Keep current stack/theme/element design unchanged.
2. Picks-for-matches remain always available in Play Center (`/play` and `/demo/play`).
3. Demo scope is only `/demo/play/*` and `/demo/admin/*`.
4. Non-admin access to any `/demo/*` redirects to `/play`.
5. Use existing `/access-denied` route (no `/demo/login`).
6. Remove `/join/:inviteCode` route and related logic.
7. Demo simulation presets use exact timestamps in `America/Los_Angeles`.
8. Demo writes never go to Firestore; only localStorage, with explicit clear on logout/exit.

## Delivery Protocol

1. Implement one increment at a time.
2. At the end of every increment, run:
   - `npm run build`
   - `npm test`
3. Update:
   - `/Users/harshacopparam/Code/wc-predictions-with-friends/README.md`
   - `/Users/harshacopparam/Code/wc-predictions-with-friends/IMPLEMENTATION_PLAN.md`
4. Wait for user confirmation before starting the next increment.

## Increment 1: Route Foundation + Join Removal

### Planned Changes

1. Add demo route tree under `/demo/play/*` and `/demo/admin/*` in `src/ui/App.tsx`.
2. Add admin-only gate for all `/demo/*`; redirect non-admin users to `/play`.
3. Remove `/join/:inviteCode` route.
4. Remove invite/join page usage and any dead navigation references.
5. Keep `/access-denied` unchanged for non-demo auth denial cases.

### UX / Logic Checks

1. `/demo/play` and `/demo/admin/*` load only for admins.
2. Non-admin opening `/demo/play` or `/demo/admin/*` lands on `/play`.
3. Existing `/play/*` and `/admin/*` behavior remains intact.
4. `/join/:inviteCode` is gone and no broken nav links remain.

### Risks / Mitigations

1. Route regressions in nested routing.
   - Mitigation: update route tests in `src/ui/App.router.test.tsx`.
2. Hidden references to removed join flow.
   - Mitigation: search and remove imports/usages, then typecheck in build.
3. Admin guard race condition during auth loading.
   - Mitigation: preserve existing loading gate behavior before redirect.
4. Mobile nav stale entries.
   - Mitigation: update `src/ui/nav.ts` and related nav tests.

### Documentation Updates This Increment

1. Update `README.md` route table.
2. Update `IMPLEMENTATION_PLAN.md` with completion status.

### Status

- `completed` (2026-02-08)

### Completion Notes

1. Added `/demo/play/*` and `/demo/admin/*` route trees.
2. Added demo admin gate that redirects non-admin users to `/play`.
3. Removed `/join/:inviteCode` route and deleted `src/ui/pages/JoinLeaguePage.tsx`.
4. Updated route tests to cover demo canonical paths and non-admin redirect behavior.
5. Updated README route list to include demo routes and remove join route.

### Verification

1. `npm run build` passed.
2. `npm test` passed.

## Increment 2: Demo Data Partition + Storage Namespace

### Planned Changes

1. Create full demo snapshot set in `public/data/demo/`.
2. Add data-loading mode so demo routes read from `public/data/demo/*` and normal routes read from `public/data/*`.
3. Namespace cache/storage keys for demo mode to prevent cross-contamination.
4. Add demo localStorage utility for explicit cleanup on logout/exit.
5. Ensure no demo path ever writes to Firestore hooks.

### UX / Logic Checks

1. Demo pages visibly use demo data (leaderboard/picks/bracket differ from prod snapshots).
2. Switching between normal and demo routes doesn’t leak cached values.
3. Logout/exit clears demo session keys explicitly.
4. Normal mode still uses existing Firestore/local fallback behavior unchanged.

### Risks / Mitigations

1. Cache key collisions.
   - Mitigation: include mode prefix in all data cache keys.
2. Accidental Firestore writes in demo.
   - Mitigation: central `isDemoMode` guard in all save hooks.
3. Partial dataset mismatch in `public/data/demo`.
   - Mitigation: validate required files exist before loading route.
4. Stale demo data after generation.
   - Mitigation: clear demo cache keys after simulation generation.

### Documentation Updates This Increment

1. Update README demo data section and storage behavior.
2. Update `IMPLEMENTATION_PLAN.md` progress and validation results.

### Status

- `pending`

## Increment 3: Demo Simulation CLI (50 Users + Time Presets)

### Planned Changes

1. Add CLI script (for example `scripts/simulateDemoUsers.ts`).
2. Add npm command (for example `demo:simulate`) in `package.json`.
3. Generate random picks for 50 users for group matches, picks, and knockout based on scenario timestamps.
4. Support presets: pre-group, mid-group, end-group, draw-confirmed, mid-knockout with exact PST-based timestamps.
5. Write generated files only to `public/data/demo/*`.

### UX / Logic Checks

1. Running script regenerates demo snapshots for repeated UX testing.
2. Lock behavior changes correctly by scenario timestamp.
3. Leaderboard position changes when switching selected demo user.
4. Knockout data appears only in draw-confirmed/mid-knockout scenarios.

### Risks / Mitigations

1. Invalid random picks causing impossible states.
   - Mitigation: validate stage constraints before writing output.
2. Lock-time mistakes with timezone conversion.
   - Mitigation: normalize all scenario timestamps to `America/Los_Angeles`.
3. Inconsistent cross-file data IDs.
   - Mitigation: single source of user/match IDs in generator.
4. Large fixture diffs.
   - Mitigation: keep generated output schema-stable and documented.

### Documentation Updates This Increment

1. Update README command usage and scenario definitions.
2. Update `IMPLEMENTATION_PLAN.md` completion notes.

### Status

- `pending`

## Increment 4: Demo Admin Controls Page

### Planned Changes

1. Add dedicated demo controls page under `/demo/admin/*` (scenario selection + user switch + reset).
2. Wire UI controls to local demo mode state only.
3. Trigger/reload generated demo dataset workflow from this page.
4. Add explicit clear-demo-session control.
5. Ensure access remains admin-only with redirect for non-admin.

### UX / Logic Checks

1. Scenario selection updates route data behavior and lock states.
2. User selector updates viewed leaderboard position context.
3. Clear/reset removes demo localStorage and returns clean state.
4. No Firestore write attempts from controls.

### Risks / Mitigations

1. Controls page affects non-demo mode.
   - Mitigation: hard guard route/context by `/demo/*`.
2. Selected-user state not propagated globally.
   - Mitigation: central demo viewer ID state plus hook tests.
3. Stale UI after scenario swap.
   - Mitigation: force refetch/cache-bust in demo namespace.
4. Admin-only redirect loops.
   - Mitigation: explicit guard ordering tests.

### Documentation Updates This Increment

1. Update README demo controls section.
2. Update `IMPLEMENTATION_PLAN.md` completion checklist.

### Status

- `pending`

## Increment 5: Play Center Rework (Compact + Phase-Oriented)

### Planned Changes

1. Make Play Center the primary active input surface for picks (always active).
2. Add/complete wizard behavior for group stage and knockout in Play Center.
3. Compact interface: dense active-phase block, prioritized action queue, reduced redundant sections.
4. Phase movement rules:
   - Group at top while active.
   - Group moves to bottom/inactive after group start.
   - Knockout moves to top only after group completion and draw inferred from match completeness.
   - Knockout moves bottom/inactive when knockout starts.
5. Metrics shown as `To pick`, `In play`, `Closed`, `Done`; hide knockout metrics until draw inferred complete.

### UX / Logic Checks

1. Picks remain always actionable from Play Center.
2. Group and knockout sections reorder correctly by phase/date state.
3. Knockout remains hidden/inactive until draw readiness condition.
4. Metrics exclude knockout until draw readiness.
5. No theme/layout-system drift.

### Risks / Mitigations

1. Phase-state logic edge cases.
   - Mitigation: centralize phase resolver utility plus unit tests.
2. Compact UI reduces discoverability.
   - Mitigation: keep explicit "Go to detailed page" links per section.
3. Wizard and quick-action conflicts.
   - Mitigation: single active editor state plus queue priority rules.
4. Lock behavior drift.
   - Mitigation: reuse existing lock helpers and scenario-based tests.
5. Performance from dense recomputation.
   - Mitigation: memoize derived queue/metrics selectors.

### Documentation Updates This Increment

1. Update README Play Center behavior section.
2. Update `IMPLEMENTATION_PLAN.md` completion and UX verification notes.

### Status

- `pending`

## Increment 6: Detailed Pages Read-Only + Final Consistency Pass

### Planned Changes

1. `/play/picks`, `/play/group-stage`, `/play/bracket` become detailed read-only views with embedded results.
2. Add consistent right quick menu across these pages (navigation/actions only).
3. Remove quick edit from inactive phases as specified.
4. Add clear link back to Play Center plus completion stats on all detailed pages.
5. Mirror same behavior on `/demo/play/*`.

### UX / Logic Checks

1. Detailed pages are read-only and consistent.
2. Play Center link exists and is obvious on each page.
3. Inactive phase pages show picks/results only.
4. Knockout page remains hidden/inactive until draw condition is met.
5. Demo and non-demo behavior stay parity-consistent except data source/write restrictions.

### Risks / Mitigations

1. Accidental edit paths left in detailed pages.
   - Mitigation: remove/disable edit handlers and assert in tests.
2. Right-menu inconsistency across pages.
   - Mitigation: shared component for quick menu.
3. Broken deep links when knockout is hidden.
   - Mitigation: redirect/guard with explanatory state.
4. Regression in existing page tests.
   - Mitigation: update page-level tests and add read-only coverage.
5. Documentation drift after final refactor.
   - Mitigation: final README and plan reconciliation checklist.

### Documentation Updates This Increment

1. Final README alignment with routes, demo mode, play-center workflow, and removed join flow.
2. Mark `IMPLEMENTATION_PLAN.md` complete with build/test evidence.

### Status

- `pending`
