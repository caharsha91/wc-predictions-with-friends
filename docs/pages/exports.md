# Exports Page

## Route
/exports

## Component
src/ui/pages/AdminExportsPage.tsx (wraps ExportsPanel from src/ui/pages/ExportsPage.tsx)

## Purpose
Download finished-only CSV exports for picks, bracket predictions, and the leaderboard.

## Data and state
- Loads matches, members, picks, bracket predictions, best-third qualifiers, and leaderboard data.
- Merges viewer picks and bracket predictions from Firestore or local storage.
- Tracks export scope (all finished matches vs latest matchday).

## Key UI
- Export guide and match window controls.
- Stats for finished matches, groups, knockout rounds, and players.
- Export tiles for picks, group bracket, knockout bracket, and leaderboard.

## Behavior
- Exports include only finished matches to keep picks private before kickoff.
- Group bracket exports include best-third picks only after group stage completion.
- CSV generation uses helpers in src/lib/exports.ts.
