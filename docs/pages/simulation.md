# Simulation Page

## Route
/simulation

## Component
src/ui/pages/AdminSimulationPage.tsx

## Purpose
Provide a local-only sandbox to simulate match progress, leaderboard placement, and user roles.

## Data and state
- Uses simulation state from src/lib/simulation.ts.
- Controls include scenario, placement band, selected user, and fixed simulation time.

## Key UI
- Control panel for scenario, placement, user, role, and simulation time.
- Seed data action to rebuild simulated users, picks, and brackets.
- Status cards showing mode, placement, user count, and current simulated time.

## Behavior
- Enabling simulation seeds local data and disables Firestore writes.
- Changing scenario triggers a reseed to match the selected progression.
- Reset time restores the scenario-based time state.
