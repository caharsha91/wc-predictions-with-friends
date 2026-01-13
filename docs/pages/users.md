# Users Page

## Route
/users

## Component
src/ui/pages/AdminUsersPage.tsx

## Purpose
Manage league members who can access the private league and admin capabilities.
This page is linked from Settings for admins.

## Data and state
- Loads members from Firestore collection leagues/{leagueId}/members.
- Falls back to simulation users when simulation mode is enabled.
- Tracks pagination and add/edit drawer state locally.

## Key UI
- Members table with name, email, and role badges.
- Add/Edit member drawer with name, email, and admin toggle.
- Pagination controls for the member list.

## Behavior
- Member updates are disabled when simulation is enabled or Firebase is not configured.
- Editing an existing user locks the email field; updates merge into Firestore with setDoc.
