# Landing Page

## Route
/

## Component
src/ui/pages/LandingPage.tsx

## Purpose
Provide a mobile-first entry point with quick CTAs, pick status, and a concise scoring overview.

## Data and state
- Loads scoring config with fetchScoring() from src/lib/data.ts (public/data/scoring.json).
- Loads matches with fetchMatches() to compute the next lock time (static JSON with caching).
- Reads local picks with loadLocalPicks() to calculate pick progress and missing picks.

## Key UI
- Hero card with dynamic primary CTA (Make next pick / Review upcoming) plus Results, Bracket, and Leaderboard links.
- Status card showing pick progress, next lock, and a missing/picked badge.
- Four-step quick start cards for onboarding.
- Scoring snapshot grid with group, knockout, and bracket point ranges.

## Behavior
- Falls back to copy if scoring or matches fail to load.
