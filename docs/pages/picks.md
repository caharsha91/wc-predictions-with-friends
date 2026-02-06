# Picks Page

## Route
`/` and `/picks`

## Purpose
Primary picks workspace for upcoming matches and group outcomes.

## Key behavior
- Upcoming picks list with stage filter and pending-first ordering.
- Inline pick editor (desktop side panel, mobile sheet) for score + knockout advance.
- Group outcomes editor with validation for top-2 and best-third slots.
- Saves to Firestore when member auth is enabled; otherwise browser-local.
