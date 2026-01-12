# Bracket Page

## Route
/bracket

## Component
src/ui/pages/BracketPage.tsx

## Purpose
Collect bracket predictions for group qualifiers, best third-place teams, and knockout winners.

## Data and state
- Loads matches, bracket predictions, and best-third qualifiers via src/lib/data.ts.
- Merges predictions with local storage and Firestore (if enabled) and autosaves changes.
- Uses PST lock times from src/lib/matches.ts to lock group and knockout steps.

## Key UI
- Stepper with three sections: group qualifiers, third-place flow, knockout bracket.
- Validation banner with jump-to-issue links.
- Group cards and third-place selectors, plus a mobile round list and desktop bracket graph.

## Behavior
- Knockout picks unlock only after group stage completion, best third qualifiers published, and the knockout draw is ready.
- Result badges show pending/correct/incorrect as matches finish.
- Uses different layouts for mobile (round tabs) and desktop (graph columns).
