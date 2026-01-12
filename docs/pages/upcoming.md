# Upcoming Matches Page

## Route
/upcoming

## Component
src/ui/pages/UpcomingMatchesPage.tsx

## Purpose
Let users enter and update picks for all remaining matches before they lock.

## Data and state
- Uses usePicksData() to load matches and the viewer's picks (Firestore when enabled, otherwise local storage or public data fallback).
- Tracks view (group or knockout), active matchday, group filter, and filter panel state.

## Key UI
- LockReminderBanner with jump-to-matchday actions.
- FiltersPanel with group vs knockout toggle (unlocks after group stage completion), group chips, and DayPagination.
- PicksBoard for editing picks across matchdays.

## Behavior
- Default view is group stage until all group matches finish, then knockout becomes available.
- Filter panel collapses on desktop and becomes a drawer on mobile.
- Loading and error states show Skeleton/Alert components.
