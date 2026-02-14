# WC Predictions UX Audit

Source basis: screenshot-only review of desktop screens.

## 1. Play Center

### Scores (0–10)

- Clarity: 7/10  
  The page states "Your move" and pushes active tasks up top, so intent is mostly obvious. Labels still feel system-first in places, not player-first.
- Information hierarchy: 8/10  
  The "Up next" framing, deadline chips, and progress strip correctly prioritize action over reference. This is the best-organized screen in the product.
- Cognitive load: 6/10  
  Too many pills and micro-status labels compete for attention at once. Users must decode the UI before making picks.
- Speed of use: 8/10  
  Inline edit controls and "Save + Next" create fast throughput for repetitive picks. It supports flow better than any other screen.
- Affordance & feedback: 7/10  
  Buttons and status chips are visible and consistent. Feedback is adequate, but confidence signals after save are too subtle for high-volume entry.
- Visual design: 7/10  
  Clean, coherent dark theme with decent spacing. The visual language is polished but overly sterile for a game among friends.
- Fun / engagement: 4/10  
  It feels like a dashboard, not a competition with social stakes. No rivalry, no momentum, no emotional hooks.

### Primary user goal

Submit pending picks before locks with the fewest clicks and zero confusion.

### Biggest friction point

The screen is still split-brain: users must bounce to separate detail views for context that should be in this workflow.

### What’s missing

- Rival pressure strip with "you vs nearest two friends" and current point delta.  
  Why: this is the action screen, so stakes must be visible where choices happen.  
  Visibility: Always visible.
- Consensus pick and upset probability for each upcoming match.  
  Why: users need a fast signal to choose safe or contrarian picks without leaving the flow.  
  Visibility: Progressive disclosure.
- Recent friend activity feed ("Sam locked 12 picks 3m ago", "Ava changed winner in ESP vs CPV").  
  Why: activity creates urgency and social pull during picking sessions.  
  Visibility: Optional.
- Personal performance trend card (last 10 picks exact/outcome hit rate).  
  Why: users adjust strategy faster when they see whether they are overfitting exact scores or playing too safe.  
  Visibility: Optional.
- One-line narrative/stakes banner ("Round starts in 4h, 28 points swing still in play").  
  Why: converts static deadlines into clear consequence.  
  Visibility: Always visible.

### Simplify the product

- Merge Picks Detail, Group Stage Detail, and Knockout Detail into Play Center subviews (tabs or disclosures in one route).
- Remove separate left-nav items for read-only detail pages; keep one `Play` destination for all pick-related work.
- Move secondary actions (schedule view, exports, debug info) into section overflow menus instead of standalone buttons and pages.

### Improve

- Remove/simplify: kill the multi-button cluster (`Continue`, `Next one`, `Schedule`) and keep one primary next-action button plus overflow.
- High-impact improvement: add a keyboard-first "rapid pick rail" (arrow/select/enter, auto-advance, persistent save state) for batch completion.

## 2. Picks Detail

### Scores (0–10)

- Clarity: 6/10  
  It is readable as a list of open matches with edit hooks. But "reference" positioning conflicts with visible edit affordances.
- Information hierarchy: 5/10  
  Every row carries similar weight, so urgency is weak beyond the top chip. The eye scans too much before acting.
- Cognitive load: 4/10  
  Repeating status pills and sparse row metadata create high scanning cost. Users parse boilerplate instead of making decisions.
- Speed of use: 4/10  
  Row-by-row editing is slow for large pending counts. This is the wrong interaction model for high-volume picks.
- Affordance & feedback: 5/10  
  Edit actions exist, but nothing clearly signals completion confidence across many rows. Progress context is weak during long sessions.
- Visual design: 6/10  
  Consistent style with the rest of the app. Density is acceptable, but layout feels list-heavy and monotonous.
- Fun / engagement: 3/10  
  No social context, no rivalry pressure, no sense of game progression.

### Primary user goal

Quickly review pending matches and adjust picks before deadlines.

### Biggest friction point

This page duplicates Play Center intent but executes it slower, forcing users into a long, repetitive list flow.

### What’s missing

- Sort/filter bar for `Closing soon`, `Unpicked`, `Live`, `High swing`.  
  Why: users need fast triage when dozens of matches are open.  
  Visibility: Always visible.
- Inline consensus + bookmaker-inspired win probability hints per row.  
  Why: decision support belongs where picks are made, not in external tabs.  
  Visibility: Progressive disclosure.
- "Friends picked" sparkline per match (split by teams).  
  Why: social divergence is the core game mechanic and should influence pick confidence.  
  Visibility: Optional.
- Batch actions (`Pick home all`, `Clear all`, `Mark reviewed`) with undo.  
  Why: repetitive interaction should be compressed into deliberate bulk operations.  
  Visibility: Progressive disclosure.

### Simplify the product

- Merge this entire screen into a Play Center "All Match Picks" panel and remove it as a top-level destination.
- Remove page-level pagination in favor of one virtualized list with smart filters and urgency grouping.
- Keep low-frequency controls (export, debug metadata, historical snapshots) in overflow menus on the merged view.

### Improve

- Remove/simplify: remove duplicated status pills on every row and keep one compact status token + deadline.
- High-impact improvement: replace row editing with an inline pick matrix that allows rapid sequential score entry without leaving the list.

## 3. Group Stage Detail

### Scores (0–10)

- Clarity: 5/10  
  The table columns are explicit, but the mental model is heavy for casual users. It reads like a spreadsheet, not a game.
- Information hierarchy: 4/10  
  High-volume rows dominate while decision-critical items are buried. Best-third section feels bolted on instead of integrated.
- Cognitive load: 3/10  
  Users must compare multiple columns and statuses per group with little guidance. This is high effort for low immediate payoff.
- Speed of use: 4/10  
  Edit actions exist, but navigation and dense tabular scanning slow down correction. It is not built for quick rounds.
- Affordance & feedback: 5/10  
  Badges indicate pending/incomplete states, yet the next best action remains vague. Feedback is descriptive, not directive.
- Visual design: 5/10  
  Visually consistent but too data-dense for this stage of workflow. Hierarchy is flat inside the table.
- Fun / engagement: 3/10  
  No story, no rivalry framing, no tournament drama despite being a high-stakes phase.

### Primary user goal

Check and adjust group qualification predictions with confidence before lock.

### Biggest friction point

The screen overloads users with table mechanics when they just need clear "what to fix next" guidance.

### What’s missing

- Group confidence meter and upset risk per group.  
  Why: users need risk context to decide whether to defend current picks or pivot.  
  Visibility: Always visible.
- Auto-ranked "next fix" queue (groups most likely to swing leaderboard first).  
  Why: prioritization reduces indecision and speeds edits.  
  Visibility: Always visible.
- Third-place qualification probability explainer with live slot occupancy.  
  Why: best-third logic is non-obvious and currently opaque.  
  Visibility: Progressive disclosure.
- Friend divergence indicator by group ("you differ from 78% of league in Group F").  
  Why: social contrast turns dry table work into strategy.  
  Visibility: Optional.

### Simplify the product

- Merge group-stage detail into Play Center as a compact guided module with expandable advanced table only on demand.
- Remove this as a dedicated nav screen; keep a deep link only for power users.
- Move rare diagnostics and raw standings breakdown under a disclosure panel inside the module.

### Improve

- Remove/simplify: remove always-visible full table by default; show only actionable groups first.
- High-impact improvement: add a guided "Resolve one group at a time" stepper with instant projected leaderboard impact.

## 4. Knockout Detail

### Scores (0–10)

- Clarity: 6/10  
  Stage summaries and table labels are understandable. Activation override messaging, however, is technical and noisy for normal users.
- Information hierarchy: 6/10  
  Round summaries on top help orientation, then detailed rows follow. The warning/status strips can overpower core decisions.
- Cognitive load: 5/10  
  Team-pill choices per row are understandable but still verbose at scale. Users juggle many state badges simultaneously.
- Speed of use: 5/10  
  Faster than classic bracket trees for some users, but still slower than a guided next-action flow. Too much vertical traversal.
- Affordance & feedback: 6/10  
  Choice chips are clear and status badges are explicit. Immediate consequence of a pick on downstream rounds is not emphasized enough.
- Visual design: 6/10  
  Clean and readable, with useful stage segmentation. Feels operational rather than exciting for knockout drama.
- Fun / engagement: 5/10  
  Knockout stakes naturally help engagement, but the UI barely amplifies that energy.

### Primary user goal

Set knockout winners quickly while understanding bracket consequences.

### Biggest friction point

Users can make picks, but they cannot instantly see strategic impact on later-round outcomes and leaderboard swing.

### What’s missing

- Live bracket path preview after each pick ("if ESP advances, your semifinal path changes here").  
  Why: knockout picks are sequential and path-dependent; users need instant causal feedback.  
  Visibility: Always visible.
- Champion probability and expected points swing per branch.  
  Why: this converts picks from guesswork into explicit risk/reward decisions.  
  Visibility: Progressive disclosure.
- "Most picked winner" marker for each tie.  
  Why: social consensus is key context in private-league strategy.  
  Visibility: Optional.
- Rival comparison mode showing where you and target rival diverge.  
  Why: knockout rounds decide standings; head-to-head framing increases decision quality and engagement.  
  Visibility: Optional.

### Simplify the product

- Merge this into Play Center as a dedicated "Knockout" section with progressive expansion from next-open match to full detail.
- Remove separate bracket detail route from main navigation.
- Place debug override/status internals in an admin/developer disclosure, not in default user-facing surface.

### Improve

- Remove/simplify: hide technical override banners for non-admin viewers by default.
- High-impact improvement: add "Projected finish if current bracket holds" after each knockout save.

## 5. Leaderboard

### Scores (0–10)

- Clarity: 8/10  
  Core ranking table is straightforward and understandable immediately. Top cards provide quick orientation.
- Information hierarchy: 7/10  
  Leader/current-user metrics lead correctly, then full table follows. Advanced details stay tucked away.
- Cognitive load: 7/10  
  Data is digestible and less noisy than other screens. Still, users must infer momentum from static totals.
- Speed of use: 8/10  
  Fast to check status and position at a glance. Good for repeat daily visits.
- Affordance & feedback: 7/10  
  Calls to action are present (`Improve next round`, advanced metrics). Guidance is directionally good but not personalized enough.
- Visual design: 6/10  
  Legible and aligned with product theme. Presentation is competent, but lacks punch for the most emotional screen in the app.
- Fun / engagement: 5/10  
  Competition exists in data, not in storytelling. It misses banter, streaks, and momentum drama.

### Primary user goal

See where I stand, who I am chasing, and what moves can change rank fast.

### Biggest friction point

The board reports position but does not explain trajectory, pressure, or the smartest next move.

### What’s missing

- Rank movement indicator (since last scoring update) with mini trend sparkline.  
  Why: trajectory matters more than static rank in recurring play.  
  Visibility: Always visible.
- Rival module ("closest above", "closest below", projected gap by next deadline).  
  Why: users compete against neighbors, not the entire table.  
  Visibility: Always visible.
- "What to pick next" strategy hints tied to upcoming high-swing matches.  
  Why: leaderboard should connect directly to action, not just reporting.  
  Visibility: Progressive disclosure.
- Social layer (reactions, taunts, brag feed tied to rank events).  
  Why: friend leagues run on banter; this is currently sterile.  
  Visibility: Optional.
- Volatility index per player (stable vs boom-bust profile).  
  Why: helps users choose safer or riskier strategy relative to standing.  
  Visibility: Progressive disclosure.

### Simplify the product

- Keep leaderboard standalone, but merge advanced metrics into inline expanders rather than separate flows.
- Remove any detached "analytics-only" views; the ranking page should host all league-performance context.
- Keep exports/admin-only ranking utilities in admin console overflow, not user leaderboard navigation.

### Improve

- Remove/simplify: drop low-value aggregate cards that repeat table info without changing action.
- High-impact improvement: add a personalized "Path to Top 3" panel with concrete point targets and match opportunities.

## 6. Demo Controls

### Scores (0–10)

- Clarity: 6/10  
  Sections are labeled clearly and controls are understandable for operators. It is still technical and context-heavy for occasional admin use.
- Information hierarchy: 6/10  
  Scenario and viewer controls are split cleanly. Session actions are secondary, which is correct.
- Cognitive load: 6/10  
  Moderate cognitive load due to scenario naming and time semantics. Users need more plain-language outcomes.
- Speed of use: 7/10  
  Primary actions are near selections and easy to execute quickly. Good operational flow for repetitive demo setup.
- Affordance & feedback: 6/10  
  Action buttons are explicit, but impact confirmation is weak after apply operations. State changes should be more obvious.
- Visual design: 5/10  
  Functional but plain. It looks like internal tooling, which is fine but not optimized for rapid operator confidence.
- Fun / engagement: 1/10  
  This is pure utility and should not chase fun. It should chase reliability and clarity.

### Primary user goal

Switch scenario and viewer state quickly without breaking demo consistency.

### Biggest friction point

The screen forces users to interpret technical labels instead of telling them exactly what the chosen scenario will do.

### What’s missing

- Scenario outcome preview ("locks active", "matches in-play", "leaderboard volatility high").  
  Why: operators need confidence before applying changes.  
  Visibility: Always visible.
- One-click preset bundles ("Investor demo", "Late-stage drama", "Admin smoke test").  
  Why: repeated demo narratives should be reusable, not manually reconstructed each time.  
  Visibility: Optional.
- Last action log with actor/time/result.  
  Why: demo ops need traceability and quick rollback confidence.  
  Visibility: Progressive disclosure.
- Safe rollback button to previous snapshot state.  
  Why: mistake recovery should be immediate in demos.  
  Visibility: Always visible.

### Simplify the product

- Merge Demo Controls into a unified Admin Console tab and remove it as separate left-nav destination.
- Remove split between "open demo play" style actions and scenario actions by exposing one consolidated launch control.
- Move low-frequency session maintenance actions into a collapsible "Maintenance" group.

### Improve

- Remove/simplify: remove raw timestamp verbosity and show one readable local time plus relative offset.
- High-impact improvement: add preflight validation + post-apply confirmation banner with explicit changed entities.

## 7. Players

### Scores (0–10)

- Clarity: 7/10  
  Purpose is clear: manage members and roles. Table + editor split is understandable.
- Information hierarchy: 6/10  
  Roster dominates correctly, but editor panel competes for space even when unused. Row actions are repetitive.
- Cognitive load: 5/10  
  Long tables with repeated edit buttons create scan fatigue. Role management is clear but not efficient.
- Speed of use: 6/10  
  Basic tasks are possible quickly, but bulk admin operations are missing. Managing many users is slower than needed.
- Affordance & feedback: 6/10  
  Inputs and actions are visible. Confirmation and error prevention for role changes can be stronger.
- Visual design: 5/10  
  Clean but flat and utilitarian. Dense rows and repeated controls make it visually heavy.
- Fun / engagement: 1/10  
  This is administration, not gameplay. Engagement is irrelevant; speed and safety matter.

### Primary user goal

Add, update, and permission-manage league members with minimal risk.

### Biggest friction point

The UI is optimized for single edits while real admins need fast bulk operations and clearer role safety rails.

### What’s missing

- Bulk select + batch role updates/invites.  
  Why: admin tasks are usually multi-user operations, not one-row-at-a-time edits.  
  Visibility: Always visible.
- Invite status and last-activity indicators per member.  
  Why: admins need to see who is inactive or pending without opening other views.  
  Visibility: Always visible.
- Role-change impact warning modal (who loses/gains critical permissions).  
  Why: prevents accidental privilege changes.  
  Visibility: Progressive disclosure.
- Search + saved filters (`Admins`, `Inactive 14d`, `No picks submitted`).  
  Why: large rosters require instant segmentation for operational tasks.  
  Visibility: Always visible.

### Simplify the product

- Merge this page into Admin Console under a `Players` tab; remove separate admin nav item.
- Remove persistent left-side editor panel; switch to row drawer/modal to reclaim table space.
- Keep rare actions (import/export members, audit logs) in overflow menu on the same tab.

### Improve

- Remove/simplify: remove one `Edit` button per row and replace with row click + compact context menu.
- High-impact improvement: add bulk actions with undo stack and audit trail for all membership and role changes.

## 8. Exports

### Scores (0–10)

- Clarity: 6/10  
  Export purpose is clear, and modes are labeled. Technical wording still leaks implementation details.
- Information hierarchy: 5/10  
  Mode cards and user selector are visible, but call-to-action hierarchy is weak. Users must parse text blocks to understand output.
- Cognitive load: 4/10  
  Multiple modes, formats, and implied datasets increase decision overhead. Too much explanation, too little guidance.
- Speed of use: 5/10  
  Repeat users can work fast, but first-time admins spend time decoding mode differences.
- Affordance & feedback: 5/10  
  Download buttons are visible. Success/failure/state feedback appears minimal for long-running export operations.
- Visual design: 4/10  
  Functional but visually flat and dense. This reads as a form, not an efficient export console.
- Fun / engagement: 1/10  
  This is back-office utility; fun is irrelevant.

### Primary user goal

Generate the right export artifact quickly and confidently with minimal configuration mistakes.

### Biggest friction point

Admins must choose between abstract modes instead of starting from concrete outcomes like "I need user picks CSV now."

### What’s missing

- Outcome-first presets (`User picks workbook`, `Matchday leaderboard snapshot`, `Full audit pack`).  
  Why: admins think in deliverables, not internal mode IDs.  
  Visibility: Always visible.
- Export history with file metadata and one-click rerun.  
  Why: repeat reporting should be replayable without reconfiguring forms.  
  Visibility: Progressive disclosure.
- Progress + completion toasts with row counts and generation time.  
  Why: export operations need explicit trust signals and diagnostics.  
  Visibility: Always visible.
- Field/schema preview before download.  
  Why: prevents wrong exports and follow-up rework.  
  Visibility: Optional.

### Simplify the product

- Merge Exports into the unified Admin Console as an `Exports` tab and remove separate navigation item.
- Remove mode-centric UX; replace with goal-centric preset cards plus advanced options behind disclosure.
- Move niche secondary downloads under an "Advanced exports" expander instead of standalone blocks.

### Improve

- Remove/simplify: remove ambiguous `Mode 1/Mode 2` framing and rename actions to concrete outcomes.
- High-impact improvement: add export job queue with saved templates, status, and rerun-from-history.

