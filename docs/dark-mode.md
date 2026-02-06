# Dark Mode Spec

## Token model
- Backgrounds: `--bg0` (app), `--bg1` (content), `--bg2` (cards), `--bg3` (overlay surface)
- Foreground: `--fg0` (primary), `--fg1` (secondary), `--fg2` (muted)
- Borders: `--border0` (subtle), `--border1` (interactive)
- Focus: `--ring-color`
- Elevation: `--shadow0`, `--shadow1`, `--shadow2`

## Dark palette rules
- No pure black (`#000`) surfaces.
- App/card/overlay layers must remain distinct.
- Gradients are limited to AppShell sidebar/header and hero surfaces.
- Dark gradients use reduced saturation/brightness versus light mode.
- Lime accent is highlight-only, not a dominant fill.

## Overlay rules (Radix)
- Backdrop: `--overlay-backdrop` (consistent opacity across sheets/dialog-like layers).
- Surface: `--overlay-surface` (maps to `bg3`).
- Border: `--overlay-border`.
- Elevation: `--overlay-shadow`.
- Interactive elements in overlays must have visible focus rings.

## Consistency checklist
- AppShell:
- Sidebar gradient contrast for nav text/icons.
- Topbar readability and sticky behavior.
- Data surfaces:
- Tables and cards preserve row/title/body contrast.
- Controls:
- Buttons, fields, tabs, badges, alerts use tokenized hover/active/disabled/focus states.
- Overlays:
- Sheet and dropdown surfaces, borders, shadows, and focus states match token rules.
