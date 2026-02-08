# Picks Page

## Route
`/play/picks`  
Legacy redirects: `/picks` -> `/play/picks`, `/results` -> `/play/picks`

## Purpose
Reference + quick-edit workspace for picks and inline finished results.

## Key behavior
- Top area is compact and non-duplicative:
  - Next lock summary with countdown and `Review pick`
  - Rules card with `Open Play Center` redirect
- Picks queue remains action-first:
  - open now
  - completed (open)
  - locked / waiting
- Guided picks workflow is hosted in Play Center (`/play`) instead of this page.
- Finished matches is an inline category in the same flow (collapsed by default).
- Inline pick editor (desktop side panel, mobile sheet) for score + knockout advance.
- Finished matches table includes match, your pick, final result, and points with compact pagination.
- Saves to Firestore when member auth is enabled; otherwise browser-local.
