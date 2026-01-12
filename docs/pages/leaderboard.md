# Leaderboard Page

## Route
/leaderboard

## Component
src/ui/pages/LeaderboardPage.tsx

## Purpose
Show league standings with point breakdowns and per-user rank context.

## Data and state
- Loads leaderboard data via fetchLeaderboard (public/data/leaderboard.json or simulation).
- Tracks page index and current viewer id for highlighting and pinned row logic.

## Key UI
- Header with last updated timestamp and a league pulse summary.
- Podium for top 3 entries, paginated list for the rest.
- Point breakdown chips and rank delta tags; current user is highlighted and can be pinned.

## Behavior
- Page size adjusts when the current user is pinned outside the visible page.
- Loading shows Skeleton, errors show Alert, empty data shows a muted card.
