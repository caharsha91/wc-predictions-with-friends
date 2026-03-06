# Codex Phase 0 Brief — World Cup Predictions UX Pass

Use this file as the standing context for the entire UX pass.

## Product constraints
Preserve these constraints:

- private invited-friends-only league
- exactly one league / one tournament
- desktop-first, mobile-secondary
- daily snapshot-based updates
- no chat
- no notifications
- no realtime/live assumptions
- no Blaze-tier-dependent architecture or features
- minimal operational complexity
- do not replace the tech stack
- do not redesign the app into mobile-first
- prefer existing components/patterns/data flow
- avoid broad rewrites

## Product intent
This app should feel like:

**a polished private World Cup side-game that people check to make picks, review the latest published snapshot, and compare standings with friends for casual banter**

It is **not** a live fantasy platform.

## UX rules
Across all affected screens, reinforce these concepts consistently:

- **Latest snapshot**
- **Editable until**
- **Locked**
- **Saved**
- **Published**
- **Final**
- **Demo mode** only in testing/admin contexts

Avoid implying the app is live/realtime.

## Visual rules
Keep the current visual style and theme. Do not redesign the brand.

Preserve:
- dark premium sports aesthetic
- current gradient/header/card language
- existing nav structure
- existing sports-focused visual identity

But improve consistency in state communication.

## State semantics
Use or standardize visual meaning where possible:

- selected / your item / active pick → teal/cyan emphasis
- locked / read-only / deadline → amber emphasis
- correct / confirmed success → green
- primary CTA → filled purple button
- secondary action → outline/ghost button

Do not overdo new colors if the existing design system already encodes these.

## Global implementation rules
- Reuse and extend existing patterns wherever possible.
- Avoid broad rewrites.
- If there are ambiguities, prefer localized improvements over structural rewrites.
- Use screenshots only as visual reference. Infer structure from the codebase first.
- Prefer small, high-confidence improvements over sweeping rewrites.

## Execution chunks
1. shared page-level status/copy cleanup
2. shared save/lock state treatment
3. Play Center improvements
4. Group Stage clarity pass
5. Match Picks right rail replacement and tie/AET/PEN clarity
6. Knockout Bracket orientation and round clarity
7. Leaderboard / League social clarity pass
8. Admin screens clarity pass
9. final copy and consistency sweep

## Expected deliverables from Codex
- infer current structure from the codebase first
- map likely files/components before changes
- implement chunk-by-chunk
- summarize what changed and where after each chunk
- list manual QA checks after each chunk
