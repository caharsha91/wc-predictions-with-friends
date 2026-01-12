# Project Skills for Codex

## Purpose
- Quick context for working in this repo and locating core flows.

## Stack and entry points
- Vite + React + TypeScript.
- App entry: src/main.tsx
- Routing: src/ui/App.tsx
- Shared layout and nav: src/ui/Layout.tsx

## Data and state
- Mock data lives in public/data/*.json (matches, members, picks, scoring, bracket, leaderboard).
- Fetchers live in src/lib/data.ts and switch to simulation when enabled.
- Firestore integration lives in src/lib/firebase.ts and src/lib/firestoreData.ts.
- Picks and bracket logic live in src/lib/picks.ts and src/lib/bracket.ts.
- Scoring and exports logic live in src/lib/scoring.ts and src/lib/exports.ts.

## UI structure
- Pages: src/ui/pages
- Reusable UI: src/ui/components and src/ui/components/ui
- Hooks: src/ui/hooks
- Theme: src/theme and src/styles

## Admin and simulation
- Admin gate lives in src/ui/App.tsx (AdminGate).
- Simulation state lives in src/lib/simulation.ts and is surfaced in AdminSimulationPage.
- Admin-only pages: /users, /exports, /simulation (also visible when simulation is enabled).

## Common commands
- npm install
- npm run dev
- npm run build
- npm run update-matches (requires FOOTBALL_DATA_TOKEN)
- npx tsx scripts/updateLeaderboard.ts

## Editing notes
- Match and bracket locks use PST logic in src/lib/matches.ts.
- If you add routes, update both src/ui/App.tsx and the nav in src/ui/Layout.tsx.
- Prefer existing hooks (useAuthState/useViewerId/usePicksData) for data access and persistence.
