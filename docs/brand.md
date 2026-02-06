# Brand Spec

## Source of truth palette (fixed)
- Primary (Electric Blue): `#2563EB`
- Secondary (Hot Purple): `#7C3AED`
- Accent (Neon Lime): `#A3E635`
- Danger: `#EF4444`

These four brand hex values are fixed and must not be changed.

## Semantic tokens
- Brand:
- `--brand-primary`, `--brand-secondary`, `--brand-accent`
- On-colors:
- `--on-primary`, `--on-secondary`, `--on-accent`
- Status:
- `--status-success`, `--status-warn`, `--status-danger`, `--status-info`
- Core neutrals (slate scale):
- `--bg0`, `--bg1`, `--bg2`, `--bg3`
- `--fg0`, `--fg1`, `--fg2`, `--fg-inverse`
- `--border0`, `--border1`

## Gradient rules
- Gradient is allowed only on shell/hero surfaces:
- Sidebar: `--shell-sidebar-surface`
- Header/topbar: `--shell-header-surface`
- Hero: `--hero-surface`
- All gradients are Primary -> Secondary.
- Accent (`#A3E635`) is reserved for small highlights/CTA emphasis only, not large fills.

## Component color rules
- Primary CTA buttons use `--primary` (blue).
- Secondary emphasis uses `--secondary` (purple).
- Accent/lime appears in small badges, highlights, and selective callouts.
- Card/table/content surfaces stay neutral slate tokens; avoid full-surface brand fills.
