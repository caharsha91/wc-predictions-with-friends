# Picks Page

## Route
/picks

## Component
src/ui/pages/PicksPage.tsx

## Purpose
Single hub for making upcoming picks and reviewing finished results with a shared data load.

## Data and state
- Uses usePicksData() to load matches and the viewer's picks (Firestore when enabled, otherwise local storage or public data fallback).
- Loads scoring config via fetchScoring() for results breakdowns.
- Uses a shared stage + group filter across upcoming/results views (group filter only when group stage is active).
- Supports query params:
  - tab=upcoming|results
  - match=<matchId> to open the pick editor

## Key UI
- Page header with last-updated metadata.
- Upcoming view: next-lock banner + Today/Matchday/All switch, matchday cards, and match rows.
- Results view: matchday cards with per-match pick summaries and point breakdowns.
- Sticky side rail (desktop) for next-lock context and matchday navigation.
- Inline filters panel (stage + group) shown only when relevant.

## Behavior
- Knockout view unlocks after group stage completion.
- Results view defaults to knockout once finished knockout matches exist.
- Picks are edited in a sheet and saved explicitly (single Firestore write per save).
- Legacy routes (/upcoming, /results) redirect here with the appropriate tab.
