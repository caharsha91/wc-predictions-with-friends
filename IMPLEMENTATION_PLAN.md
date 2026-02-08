# Implementation Plan

## Status

- Increment 1: Completed
- Increment 2: Completed
- Increment 3: Completed
- Increment 4: Completed

## Increment 3 Delivered

- Demo knockout force-activation added for:
  - `mid-knockout`
  - `world-cup-final-pending`
- Normal mode activation logic preserved (fixture inference remains source of truth in default mode).
- If demo forced activation conflicts with fixture inference, warning banner is shown with explicit source-of-truth labeling.
- Simulator knockout data consistency improved:
  - downstream fixtures only advance from finished upstream matches,
  - unresolved downstream fixtures are reset to scheduled/no-result state,
  - in-play knockout fixtures do not expose finalized winner/decider.
- Scenario snapshots regenerated for:
  - `mid-knockout`
  - `world-cup-final-pending`

## Increment 4 Delivered

- Added/updated tests for changed behavior:
  - Play Center demo forced activation and warning/no-warning paths.
  - Bracket detail demo forced activation and warning/no-warning paths.
  - Shared knockout activation resolver unit tests.
- Documentation updated:
  - `README.md` reflects demo forced activation rules and consistency behavior.
  - `IMPLEMENTATION_PLAN.md` restored and aligned to final behavior.
- Validation tasks:
  - full `npm test`
  - full `npm run build`
