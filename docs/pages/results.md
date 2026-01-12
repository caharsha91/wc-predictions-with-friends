# Results Page

## Route
/results

## Component
src/ui/pages/ResultsPage.tsx

## Purpose
Show finished matches with the user's picks, scoring breakdown, and matchday summaries.

## Data and state
- Loads matches, picks, and scoring via fetchMatches/fetchPicks/fetchScoring.
- Merges base picks with the viewer's picks from Firestore or local storage.
- Groups finished matches by matchday and stage using src/lib/matches.ts helpers.

## Key UI
- FiltersPanel with group vs knockout toggle and group filter chips.
- Matchday cards with collapsible sections and per-match detail drawers.
- Per-match pick summary and points breakdown (exact, outcome, knockout).

## Behavior
- Knockout results view unlocks after group stage completes and knockout results exist.
- Day pagination jumps to matchday sections and expands rows by default.
- Empty state shows when no finished matches are available.
