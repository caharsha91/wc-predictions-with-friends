# Landing Page

## Route
/

## Component
src/ui/pages/LandingPage.tsx

## Purpose
Introduce the app, explain how to play, and summarize scoring and lock rules with quick CTAs.

## Data and state
- Loads scoring config with fetchScoring() from src/lib/data.ts (public/data/scoring.json).
- Builds scoring ranges and example point totals with useMemo; shows fallback copy if scoring fails to load.

## Key UI
- Hero card with CTAs to /upcoming and /leaderboard.
- How to play checklist and pick lock rules (PST).
- Scoring breakdown for match picks and bracket picks.
- Example table showing how points add up.
