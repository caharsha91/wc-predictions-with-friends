# Themes Page

## Route
/themes

## Component
src/ui/pages/ThemeSelectorPage.tsx

## Purpose
Let users pick a theme palette and toggle between light, dark, or system-driven mode.

## Data and state
- Uses useTheme() from src/theme/ThemeProvider.tsx for theme list, mode, and setters.
- Local notice state shows feedback after applying a theme.

## Key UI
- Mode toggle (light/dark) and system mode toggle.
- Theme cards with color swatches, active badge, and apply button.
- Footer note showing the currently selected theme.

## Behavior
- Applying a theme updates ThemeProvider state and shows a short notice.
- Swatches reflect the current color mode (light or dark).
