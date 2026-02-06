# Players Page

## Route
`/players`

## Access
Admin-only.

## Purpose
Manage league players and admin rights.

## Key behavior
- List members from Firestore (`leagues/{leagueId}/members`) when available.
- Add/edit player name, email, and admin role.
- Read-only fallback from static members JSON if Firebase is unavailable.
