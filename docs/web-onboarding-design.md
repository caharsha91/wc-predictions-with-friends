# Web Onboarding Design

## Goal

Design a first-time user guide for the web app that:

- supports regular users and admins
- resumes from the user's last onboarding state across sessions and devices
- uses backend persistence per user
- keeps knockout onboarding locked until the knockout bracket is truly open
- stays web-only for this phase

This design intentionally builds on the current app architecture:

- routing and resume behavior in `src/ui/Layout.tsx`, `src/ui/lib/lastRoute.ts`, and `src/ui/pages/LandingPageContent.tsx`
- per-user backend profile persistence in `src/ui/lib/profilePersistence.ts`
- role detection in `src/ui/hooks/useCurrentUser.ts`
- tournament-phase gating in `src/ui/context/TournamentPhaseContext.tsx` and `src/ui/lib/tournamentPhase.ts`

## Product Shape

Use a mix of three patterns, each for a different job:

1. Welcome modal
   Shown on first eligible web entry after membership is resolved. This explains the league structure, sets expectations, and starts the guide without forcing page-by-page tooltips immediately.

2. Persistent onboarding checklist in Play Center
   This is the main "resume from where you left off" surface. It stays visible until the active visible track is complete or explicitly dismissed.

3. Lightweight page-level coach marks
   These appear only when the user launches a checklist step or lands on a first-time guided page. They call out the one or two important interactions on that page.

The mix keeps the first-use experience understandable without turning every page into a tooltip tour.

## Core UX Principles

- Start from the Play Center, because it already acts like the user's hub.
- Keep the guide role-aware, but avoid splitting admins into a separate product. Admins complete the same player track and then see extra admin steps.
- Resume from the exact next incomplete step, not just the last route.
- Never present knockout as actionable before the draw is confirmed and the bracket is open.
- Do not add onboarding to companion/mobile right now, but keep the stored state reusable later.

## Entry Conditions

Show onboarding only when all of the following are true:

- user is a valid member
- web surface is active, not `/m`
- onboarding version is current
- user has not completed or fully dismissed the visible guide

First entry behavior:

- land the user in the existing Play Center
- open a welcome modal above the Play Center content
- after dismiss/start, reveal a checklist card inline in the Play Center

Re-entry behavior:

- if onboarding is in progress, show the checklist card on Play Center
- if the user clicks "Continue setup", route them to the saved step target
- do not re-open the welcome modal after it has been seen unless the onboarding version changes

## Information Architecture

### Player Track

Recommended visible order:

1. Welcome to the league
2. Set your group stage rankings
3. Make your match picks
4. Check the league table and rivals
5. Knockout bracket

### Admin Track

Admins see all player steps plus an Admin tools section:

1. Manage the roster
2. Export league workbooks
3. Use demo controls

Admin steps should appear as a second section in the same checklist, not as a separate onboarding system.

## Why Each Pattern Goes Where

### Welcome modal

Best for:

- explaining the league format
- separating player and admin expectations
- giving one strong CTA

Modal content:

- short headline: "Welcome to WC Predictions"
- 3-card overview:
  - Group Stage: rank every group and best third-place teams
  - Match Picks: set scores before each rolling lock
  - Knockout Bracket: opens after the draw is confirmed
- admin-only note when `isAdmin === true`: "You also have league admin tools after player setup"

Actions:

- `Start guide`
- `Skip for now`

If skipped:

- mark onboarding as `in_progress`
- keep the checklist visible on Play Center
- do not force the user into coach marks

### Checklist card in Play Center

Best for:

- progress tracking
- cross-session resume
- handling steps that are temporarily locked

Checklist behavior:

- appears as a prominent card near the top of Play Center
- shows current step, section labels, and completion count
- each step has one of: `Not started`, `In progress`, `Done`, `Locked`
- CTA button text changes by state:
  - `Start`
  - `Continue`
  - `Review`
  - `Locked`

Locked knockout checklist item:

- label: `Knockout bracket`
- state: `Locked`
- helper copy: `Opens after group lock and draw confirmation`
- CTA disabled until bracket is actually editable

### Coach marks

Best for:

- highlighting the exact interaction users might miss
- keeping page guidance short and contextual

Coach mark rules:

- maximum 2-3 callouts per page
- user can close the page guide without losing checklist progress
- page guide completion does not require reading every tooltip; it requires either interacting with the page or explicitly clicking `Got it`

## Detailed Step Design

### Step 1: Welcome to the league

Surface:

- welcome modal on Play Center

Completion:

- user clicks `Start guide` or `Skip for now`

Stored result:

- mark welcome as completed
- set next step to `group_stage`

### Step 2: Group stage

Primary route:

- `/group-stage/A` or the user's saved active group stage route

Coach marks:

- highlight the ranking list and drag/reorder behavior
- highlight the best third-place selection area
- optional callout for leaderboard outlook if present

Completion rule:

- user finishes at least one group ranking interaction

Recommended progression rule:

- step remains `in_progress` until all groups plus best-third picks are complete
- checklist CTA says `Continue` until full completion

This avoids a fake "done" state after only seeing the page once.

### Step 3: Match picks

Primary route:

- `/match-picks`

Coach marks:

- highlight score entry interaction
- highlight `What's left` panel because it already summarizes progress and remaining work

Completion rule:

- user saves at least one match pick

Recommended progression rule:

- step stays `in_progress` while there are editable upcoming picks still unset
- step becomes `done` when the currently open pick window is fully set, not when the entire tournament is done

### Step 4: League table and rivals

Primary route:

- `/leaderboard`

Coach marks:

- highlight podium/full leaderboard
- highlight rival watch and manage rivals affordance

Completion rule:

- user reaches the page and dismisses the coach marks

This is an orientation step more than a data-entry step.

### Step 5: Knockout bracket

Primary route:

- `/knockout-bracket`

Precondition:

- draw confirmed
- tournament phase exposes bracket as open
- bracket is editable

Source of truth:

- `phaseState.lockFlags.bracketEditable`
- knockout availability logic already derived from `TournamentPhaseContext`
- draw confirmation stays tied to the existing bracket/draw logic

Before unlock:

- checklist item shows `Locked`
- coach marks cannot launch
- if user manually opens the page, they see the existing locked state with onboarding helper copy but no active guide

After unlock:

- checklist state becomes actionable
- CTA changes to `Start`
- coach marks highlight round-by-round winner picking and auto-progression through the bracket

Completion rule:

- user makes at least one knockout winner pick

Progression rule:

- stays `in_progress` until all currently editable bracket picks are filled

## Admin Extension

Admins get the player flow first, then an Admin tools section.

This keeps league setup understandable before exposing operational tools.

### Admin Step 1: Roster

Primary route:

- `/admin/players`

Coach marks:

- highlight member search/list
- highlight add/edit member action
- explain member ID and admin toggle briefly

Completion rule:

- user opens the page and dismisses the guide

Optional stronger completion:

- if preferred later, upgrade to "creates or edits one member" without changing the guide structure

### Admin Step 2: Exports

Primary route:

- `/admin/exports`

Coach marks:

- preset/member selection
- export lock state and availability explanation
- workbook preview area

Completion rule:

- user opens page and dismisses guide

If exports are locked, keep the step available for orientation but annotate it as `Preview only until exports unlock`.

### Admin Step 3: Demo controls

Primary route:

- `/admin/controls`

Coach marks:

- scenario selector
- capability summary
- apply scenario action

Completion rule:

- user opens page and dismisses guide

This step should only appear for admins and only on web.

## Resume and Persistence Model

Persist onboarding state in the backend per user, alongside the existing member profile document in `leagues/{leagueId}/members/{email}`.

Recommended shape:

```ts
type OnboardingStepStatus = 'not_started' | 'in_progress' | 'completed' | 'locked' | 'dismissed'

type OnboardingState = {
  version: number
  status: 'not_started' | 'in_progress' | 'completed' | 'dismissed'
  welcomeSeenAt: string | null
  activeStepId: string | null
  activeRoute: string | null
  completedVisibleTracks: Array<'player' | 'admin'>
  roleSnapshot: {
    isAdmin: boolean
  }
  steps: Record<
    string,
    {
      status: OnboardingStepStatus
      startedAt: string | null
      completedAt: string | null
      lastRoute: string | null
      lastContext: Record<string, string | number | boolean | null> | null
    }
  >
  dismissedAt: string | null
  updatedAt: string
}
```

Recommended step ids:

- `player_welcome`
- `player_group_stage`
- `player_match_picks`
- `player_league`
- `player_knockout`
- `admin_roster`
- `admin_exports`
- `admin_demo_controls`

### What gets resumed

The guide should resume from:

- the first visible incomplete actionable step
- otherwise the last visible `in_progress` step
- otherwise the first locked visible step
- otherwise mark the visible guide complete

Use both onboarding state and existing `lastRoute`:

- `lastRoute` remains the general app resume route
- onboarding adds `activeStepId` and `activeRoute` for guided resume

If onboarding is in progress and the user clicks `Continue setup`, prefer onboarding state over plain `lastRoute`.

## Role Change Rules

Role changes must not create contradictory onboarding states.

### Member becomes admin

Behavior:

- keep all player progress exactly as-is
- reveal admin section
- initialize admin steps as `not_started`
- leave current player step active if player track is incomplete
- if player track is complete, set next recommended step to `admin_roster`

### Admin loses admin access

Behavior:

- hide admin checklist section immediately
- preserve stored admin step history in backend
- compute overall visible completion from player steps only
- if admin access returns later, previously completed admin steps reappear

### Why preserve hidden admin state

This keeps the plan consistent if permissions change temporarily and avoids restarting the admin tour from zero.

## Gating Rules

### Player guide gating

- show group-stage step whenever the page is reachable
- show match-picks step whenever the page is reachable
- show knockout step in the checklist from day one, but as `Locked` until truly open

### Knockout guide gating

A knockout onboarding step is actionable only when:

- the draw is confirmed
- the bracket page is available
- `phaseState.lockFlags.bracketEditable === true`

The guide must not unlock from clock time alone if the draw is still unresolved.

### Admin guide gating

- admin steps only render when `currentUser.isAdmin === true`
- exports step can be viewed anytime by admins, but copy reflects lock state
- demo controls step is always available to admins on web

## Completion and Dismissal Behavior

### Complete guide

Visible guide is complete when:

- regular user: all player steps are completed
- admin: all player and admin steps are completed

After completion:

- remove checklist from the primary Play Center position
- keep a subtle `View guide again` action in settings/account or Play Center

### Skip or dismiss

If the user dismisses the welcome modal:

- do not mark onboarding complete
- keep checklist visible

If the user dismisses the checklist entirely:

- set overall status to `dismissed`
- do not auto-surface again unless:
  - onboarding version changes
  - role changes and a newly visible track has never been started

This balances control with recoverability.

## Recommended Copy Treatments

### Knockout locked

- title: `Knockout bracket opens later`
- body: `Winner picks unlock after the group stage locks and the draw is confirmed. We'll save your guide progress and bring you back here once it opens.`

### Admin section intro

- title: `You also manage the league`
- body: `Finish the player basics first, then we'll walk you through roster, exports, and demo tools.`

### Resume card

- title: `Continue setup`
- subtitle example: `Next: Match Picks`
- meta example: `3 of 5 player steps complete`

## Web-Only Scope

This design is intentionally limited to the desktop/web app.

Reasoning:

- current mobile experience is a separate companion surface with different navigation and compressed layouts
- tooltip density that works on desktop would be noisy on mobile
- Play Center checklist placement is naturally suited to the web landing/dashboard experience

What mobile should inherit later:

- the same backend onboarding state shape
- the same completion rules
- a different presentation model, likely cards and inline prompts instead of coach marks

For now:

- mobile ignores onboarding UI
- backend state remains safe to read later if mobile onboarding is added

## Implementation Touchpoints

Recommended files to extend or add later:

- `src/ui/lib/profilePersistence.ts`
  Add read/write support for onboarding state.
- `firestore.rules`
  Allow users to update the new onboarding fields on their own member document.
- `src/ui/pages/LandingPageContent.tsx`
  Render welcome modal and persistent checklist card.
- `src/ui/Layout.tsx`
  Keep writing general `lastRoute`, but let onboarding-aware resume prefer guided routes.
- `src/ui/context/TournamentPhaseContext.tsx`
  Continue using current phase/lock state as the gating source.
- `src/ui/lib/tournamentPhase.ts`
  Keep knockout editability as the final lock authority.

Recommended new files:

- `src/ui/lib/onboarding.ts`
  Step definitions, role filtering, status derivation, resume target resolution.
- `src/ui/hooks/useOnboardingState.ts`
  Read/write state and expose visible steps, current step, and actions.
- `src/ui/components/onboarding/OnboardingWelcomeModal.tsx`
- `src/ui/components/onboarding/OnboardingChecklistCard.tsx`
- `src/ui/components/onboarding/OnboardingCoachMarks.tsx`

## Recommended MVP Order

1. Add backend schema and rules for onboarding state.
2. Add Play Center checklist card with player steps only.
3. Add welcome modal.
4. Add page-level coach marks for group stage, match picks, leaderboard, and knockout.
5. Add admin section and role-change handling.

This gets resume and gating correct before polishing the walkthrough layer.

## Open Design Decisions For Implementation

These do not block the spec, but they should be decided before coding:

- whether group stage completion means "visited and interacted once" or "all groups fully completed"
- whether admin completion requires page visit only or an actual mutation
- where `View guide again` should live in the account menu or Play Center
- whether we want a lightweight "What's new" treatment when onboarding version increments later
