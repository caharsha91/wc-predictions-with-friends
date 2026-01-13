# Settings Page

## Route
/settings (the legacy /themes route redirects here)

## Component
src/ui/pages/ThemeSelectorPage.tsx

## Purpose
Personalize appearance (light/dark/system) for the ChatGPT-inspired palette, review the about copy, and surface admin shortcuts.

## Data and state
- Uses useTheme() from src/theme/ThemeProvider.tsx for light/dark/system mode and setters.
- Reads current member/admin state from useCurrentUser and simulation state for admin controls.

## Key UI
- Appearance controls for light/dark/system mode.
- About section with league guidance.
- Admin shortcuts (members, exports, simulation) when permitted.

## Behavior
- Updating color mode updates ThemeProvider state, persists to localStorage, and syncs to Firestore for members.
- /themes redirects to /settings.
