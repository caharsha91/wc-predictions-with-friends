Group Stage UX/Layout Refinement Plan (v1.1 — 1440p-first, Tailwind + tokens, 70/30, resilient across odd resolutions)

SCOPE / NON-NEGOTIABLES
- UI/layout/presentation only. No scoring/backend/model changes.
- Tailwind CSS + existing theme tokens only (no new palette, no hex).
- Remove Edit mode entirely (inline Save/Cancel per row remains as implemented).
- Remove `status` param usage (already removed) and clean legacy URL params via replace.
- Preserve “one viewport” feel on desktop targets while avoiding “unsupported resolution” awkwardness (free space, uneven stacks).

SUMMARY
1) Clarify results: remove ambiguous dots and add inline result markers next to each pick (1st/2nd) using icon + compact code + tooltip; add legend in subheader/meta line (only when Points ON).
2) Simplify controls: remove Group + Focus controls from Group Picks; keep Points toggle only; default Points to On; make Potential vs Final points explicit.
3) Desktop layout at `xl`: switch to 70/30 with guardrails; swap right rail order to Standings then Leaderboard; keep rail sticky and capped at 420px.
4) Fix 1440p “slightly off” overflow by correcting height math and eliminating accidental padding/margin overflow.
5) Rename header text to “Group stage”.
6) Strengthen standings attribution with pills that read “Your 1st” / “Your 2nd”.
7) Add pinned “You” row in leaderboard curated view.
8) Apply all “pop” improvements (select field chips, dirty/saved indicators, consistent card headers, hover affordances, anti-wrap stability) without increasing vertical bloat.
9) Add resolution-resilience rules so intermediate/odd desktop resolutions don’t look broken (avoid large free space, uneven spacing).

RESULTS UI (Selected: Inline pick icons + compact codes + tooltips)
- Show result markers next to BOTH 1st and 2nd pick cells:
  - correct   -> ✓ OK   (tooltip: “Correct”)
  - incorrect -> × NO   (tooltip: “Incorrect”)
  - pending   -> ⏳ PEN (tooltip: “Pending”)
  - locked    -> 🔒 LCK (tooltip: “Locked”)
- Legend placement: in the subheader/meta line near “TABLE PENDING/FINAL”.
- Best 3rd uses Correct/Incorrect/Pending/Locked only (no Qualified/Missed labels).

IMPLEMENTATION CHANGES

1) src/ui/components/group-stage/GroupStageDashboardComponents.tsx
HEADER
- Change title to exactly: “Group stage” (exact casing).
- Ensure title/subtitle container uses `min-w-0` + `truncate` so it never wraps into 2 lines unexpectedly.

GROUP PICKS (GroupPicksDenseTable)
- Remove Group and Focus controls from this panel.
- Keep only Points toggle.
- Remove focus-based dimming behavior.
- Remove left row status dot (ambiguous colored dot).
- Add inline status markers (icon + code) for BOTH pick columns with tooltips (Radix/shadcn tooltip).
  - Ensure marker is compact and does not increase row height.
  - Use `text-[10px]–text-[11px]`, `leading-none`, `inline-flex items-center gap-1`.
- Add pointsContextLabel string in meta line:
  - “Potential points” when not final
  - “Final points” when final

CONDITIONAL META STRIP (Legend + Points context only when Points ON)
- Meta/subheader line (“TABLE PENDING/FINAL” line):
  - Always show: table state badge (PENDING/FINAL) and any lock/close timing you already show.
  - Conditionally show ONLY when pointsEnabled:
    - pointsContextLabel (“Potential points” / “Final points”)
    - Legend: “✓ OK × NO ⏳ PEN 🔒 LCK”
  - When Points OFF: hide legend + pointsContextLabel entirely (no empty gap).
  - Keep meta line height stable via fixed line height:
    - e.g. meta row uses `h-7` or `h-8` with contents vertically centered.
  - Legend styling:
    - `text-[10px]–text-[11px] text-muted-foreground whitespace-nowrap truncate`
    - Prefer icon-forward spacing, minimal punctuation.

BEST THIRD (BestThirdPicksCompact)
- Desktop: always expanded.
- Remove desktop inner scroll cap (no `max-h-72 overflow-y-auto` on desktop).
- Allow mobile/tablet caps only if necessary via breakpoints (e.g. `max-md:`).

2) src/ui/pages/GroupStagePage.tsx
GROUP PICKS RENDERING
- Remove table-level Group/Focus filtering; always pass full rows A–L.
- Keep standings group selector intact.

POINTS BEHAVIOR
- Default Points to On when query param missing (see groupStageFilters.ts).
- Pass pointsContextLabel based on `groupsFinal`.

DESKTOP LAYOUT (xl+)
- Use 70/30 split with guardrails:
  - `xl:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]`
  - cap rail: `xl:[&_.right-rail]:max-w-[420px]`
- Right rail order: Standings first, Leaderboard second.
- Ensure sticky rail on xl+ only:
  - right rail: `xl:sticky xl:top-[calc(var(--toolbar-h,56px)+var(--meta-h,32px)+20px)]`
  - fallback if no CSS vars: use existing known heights; keep consistent.

FIX 1440p OVERFLOW (HEIGHT MATH + MIN-H-0)
- Make the page a fixed-height flex shell with correct `min-h-0` plumbing:
  - outer shell: `h-[calc(100vh-var(--app-header-h,0px))] overflow-hidden`
  - inner: `flex flex-col h-full min-h-0 gap-2 p-4`
  - main grid wrapper: `flex-1 min-h-0 overflow-hidden`
  - left and right column wrappers: `min-h-0`
- Audit/trim extra vertical padding/margins that cause 1–8px overflow.

STANDINGS PILLS
- Rename “1st” -> “Your 1st”
- Rename “2nd” -> “Your 2nd”
- Strengthen picked-row emphasis without relying on color-only:
  - subtle surface lift/border/ring using tokens (no new colors)
  - maintain compact row height.

3) src/ui/lib/groupStageFilters.ts
DEFAULTS
- Change `GROUP_STAGE_QUERY_DEFAULTS.points` from 'off' to 'on'
- Honor explicit `?points=off`

URL WRITING
- Do not write default values into URL when missing (clean share links).
- Only add `?points=off` when user explicitly toggles off.

URL PARAMS UPDATE / CLEANUP (Replace)
- Remove all references to `status` param (read/write/default).
- Stop using `group` and `focus` params for Group Picks behavior.
- On page mount:
  - If legacy params (`status`, `group`, `focus`) exist, strip them via:
    - `setSearchParams(cleaned, { replace: true })`
  - Never re-add them.
- Only maintain supported params going forward (likely `points` + any standings param if it exists).

LEADERBOARD: “YOU” PIN ROW
- Curated view keeps existing behavior, plus:
  - Always show “You” row in curated view.
  - If “You” already appears in top section, do not duplicate; instead highlight it.
  - If not present, insert a subtle separator then “You” row.
  - Add “You” badge and subtle highlight (token-based ring/bg).
- Keep “View full” behavior intact (internal scroll only when expanded).

APPLY ALL “POP” UX IMPROVEMENTS (SAFE, ON-BRAND, LOW-RISK)

1) Select “field chip” treatment (Group Picks + Best 3rd)
- Select trigger styling:
  - `h-8 rounded-lg border border-border bg-background/?? px-2`
  - hover: `hover:bg-background/??`
  - focus: `focus-visible:ring-1 focus-visible:ring-ring/?? focus-visible:outline-none`
  - label: `min-w-0 truncate text-[12px]`
- No increase in row height.

2) Row-level dirty indicator (“Edited”)
- When row is dirty: show compact pill in actions column:
  - `h-6 px-2 rounded-full border border-border text-[10px] text-muted-foreground whitespace-nowrap`
  - tooltip: “Unsaved changes”
- Must fit within reserved actions space; no row expansion.

3) Per-row “Saved” confirmation (brief)
- After save: show “Saved” in actions area for ~2–3 seconds, then hide.
- Must not reflow; use reserved area.

4) “You” consistency
- Leaderboard: consistent “You” badge styling.
- Group Picks: highlight ONLY the active edited (dirty) row subtly with token-based bg/ring.

5) Standings: stronger “Your picks” emphasis (non-color-only)
- Picked rows get subtle lift/border/ring + pills “Your 1st/Your 2nd”.

6) Pending/Final as clear mode badge
- Add small mode badge in Group Picks header or meta line:
  - “FINAL” when final
  - “LIVE” or “PENDING” when not final
- Tooltip:
  - pending: “Points are potential until groups finalize.”
  - final: “Finalized scoring.”

7) Legend icon-forward formatting
- Legend text: “✓ OK × NO ⏳ PEN 🔒 LCK”
- Only visible when Points ON (per conditional meta strip).

8) Consistent card header template across the page
- Standardize card headers to:
  - `h-10 px-3 flex items-center justify-between gap-2`
- Title style:
  - `text-[11px] uppercase tracking-wide text-muted-foreground`
- Apply to Group Picks, Best 3rd, Standings, Leaderboard cards.

9) Anti-wrap stability (prevent jitter)
- Add `min-w-0` + `truncate` to:
  - toolbar title/subtitle
  - meta strip text
  - select trigger labels
  - leaderboard name column
  - standings team name column

10) Hover affordances (modern feel)
- Add subtle hover states using tokens:
  - rows: `hover:bg-background/?? transition-colors`
  - use `cursor-pointer` only if row click does something.

RESOLUTION RESILIENCE (avoid “unsupported resolution” weirdness)
GOAL
- Prevent large dead space, uneven spacing, or awkward stacks at intermediate desktop sizes (1536×864, 1600×900, 1920×1200, ultrawide).

RULES
1) Correct flex/min-h-0 usage everywhere (no accidental overflow).
- outer: `h-[calc(100vh-var(--app-header-h,0px))] overflow-hidden`
- wrapper: `flex flex-col h-full min-h-0`
- main grid: `flex-1 min-h-0 overflow-hidden`
- left/right wrappers: `min-h-0`

2) Avoid arbitrary fixed heights for card bodies
- Only fix: toolbar/meta/table header/row/control heights.
- Card bodies should be natural height unless explicitly intended to fill (`flex-1 min-h-0`)—no random fixed card heights.

3) Right rail stack strategy (prevents tall empty column)
- Right rail container: `flex flex-col gap-3`
- Standings card: `flex-none` (natural height)
- Leaderboard card:
  - curated view: `flex-none` (natural height)
  - “View full” only: `max-h-[min(320px,calc(100vh-<reserved>))] overflow-y-auto`
- This prevents the rail from stretching into empty space.

4) Left column absorbs extra height gracefully (prevents “free space below table”)
- Left column container: `flex flex-col min-h-0`
- Make Group Picks card: `flex-1 min-h-0` so it fills remaining space cleanly.
- Best 3rd card remains `flex-none` (natural height).
- Do NOT add vertical padding at larger resolutions; absorb height through the Group Picks container.

5) Large-resolution scaling via clamp (no vertical bloat)
- At `2xl` (if present):
  - allow slight horizontal padding increases and minor typography bumps (NOT height/gaps):
    - `2xl:px-4` where appropriate
    - `2xl:text-[13px]` for body text if it doesn’t increase row height
  - Do not increase vertical gaps/heights at 2xl.

OPTIONAL ULTRAWIDE SAFEGUARD (recommended)
- Add max content width for the page to prevent over-stretching:
  - `max-w-[1600px] mx-auto w-full`

PUBLIC INTERFACES / TYPES
- GroupPicksDenseTableProps:
  - Remove: groupFilter, focusFilter, onGroupFilterChange, onFocusFilterChange
  - Add: pointsContextLabel: string
- No backend/API changes.

TEST CASES
DESKTOP
1) 2560×1440 (xl): no overflow, 70/30 split with rail cap 420px, sticky rail, balanced spacing (no dead space).
2) 1920×1080: still fits, no main scrollbars, no jitter.
3) Intermediate sizes (1536×864, 1600×900): no awkward gaps/uneven stacks; layout remains balanced.

FUNCTIONAL
4) Results clarity:
  - no dots, inline ✓ OK / × NO / ⏳ PEN / 🔒 LCK with tooltips for both picks.
  - Legend appears only when Points ON in meta line.
5) Points:
  - no params => Points On, URL stays clean.
  - `?points=off` => Points Off, legend/context hidden.
  - pointsContextLabel shows Potential vs Final when Points ON.
6) URL cleanup:
  - old links with status/group/focus get cleaned via replace and never return.
7) Leaderboard:
  - “You” pinned row exists in curated view with no duplicates; “View full” works.

END.
