# UX Audit: World Cup Friends App

## 1. Executive Summary
 - **Primary User Goal:** Quickly enter predictions, track social standing, and (for admins) manage league integrity.
 - **Biggest Global Friction Point:** **Data Density on Mobile.** Across Group Stage, Knockout, and Admin tables, the UI tries to show too much desktop-class data, leading to horizontal scrolling or cognitive overload.
- **Simplify the Product:**
  1. Combine "Upcoming Matches" and "Prediction Entry" into a single card view on the Dashboard.
  2. Remove detailed "Group Standings" from the primary nav, moving it to a secondary "Stats" tab to focus on the social leaderboard.
  3. **Mobile Views:** Implement "List Views" for complex data structures like the Knockout Bracket and Group Tables.

## 2. Screen-by-Screen Analysis

### Global Navigation & Shell
- **Scorecard:**
  - **Clarity:** 8/10
  - **Information Hierarchy:** 7/10
  - **Cognitive Ease:** 8/10 (Hidden complexity is appropriate for Admin-only features)
  - **Speed of Use:** 7/10
  - **Affordance & Feedback:** 6/10
  - **Visual Design:** 8/10
  - **Fun / Engagement:** 5/10
- **Visual vs. Code:** `Layout.tsx` nests "Theme" and the "Enter/Exit Demo Mode" toggle inside `SidebarAccountMenu`. This is appropriate as Demo Mode is an admin-only testing tool.
- **Top Fix:** Add a persistent "Demo Mode Active" banner when active to prevent admins from confusing simulation with live data.

### Dashboard / Home
- **Scorecard:**
  - **Clarity:** 8/10
  - **Information Hierarchy:** 6/10 (Rank is hidden below the fold)
  - **Cognitive Ease:** 4/10
  - **Speed of Use:** 8/10
  - **Affordance & Feedback:** 5/10
  - **Visual Design:** 7/10
  - **Fun / Engagement:** 6/10
- **Visual vs. Code:** Code fetches matches; UI needs pagination or "Focus on Today". Ensure "Save" state uses `ToastProvider` (top-right stack) and optimistic UI updates.
- **Top Fix:** Elevate the user's current rank and points to the very top. Add a "Rivalry Strip" (UI only) comparing user vs. nearest rival using existing leaderboard data.

### Prediction Entry
- **Scorecard:**
  - **Clarity:** 9/10
  - **Information Hierarchy:** 8/10
  - **Cognitive Ease:** 7/10 (Good, focused)
  - **Speed of Use:** 6/10 (Input fields require keyboard dismissal)
  - **Affordance & Feedback:** 4/10 (Unclear if auto-saved or requires manual submit)
  - **Visual Design:** 6/10
  - **Fun / Engagement:** 5/10
- **Visual vs. Code:** Ensure `inputmode="numeric"`. Use existing theme tokens for all new UI elements (e.g., Stepper buttons).
- **Top Fix:** Implement "Stepper" controls (+/- buttons) for scores to avoid keyboard usage on mobile.

### Leaderboard
- **Scorecard:**
  - **Clarity:** 10/10
  - **Information Hierarchy:** 9/10
  - **Cognitive Ease:** 8/10
  - **Speed of Use:** 10/10
  - **Affordance & Feedback:** 2/10 (Static list, no drill-down)
  - **Visual Design:** 7/10
  - **Fun / Engagement:** 8/10
- **Visual vs. Code:** Sorting logic must handle tie-breakers consistently.
- **Top Fix:** Highlight the current user's row permanently (sticky footer or distinct color using theme variables). Add computed "Social Badges" (e.g., "Contrarian") derived from `picks.json` vs `matches.json`.

### Group Stage Detail (/play/group-stage)
- **Scorecard:**
  - **Clarity:** 5/10 (Table heavy)
  - **Information Hierarchy:** 5/10
  - **Cognitive Ease:** 2/10 (Too much data for mobile)
  - **Speed of Use:** 5/10
  - **Affordance & Feedback:** 1/10 (Read-only)
  - **Visual Design:** 4/10 (Looks like a spreadsheet)
  - **Fun / Engagement:** 3/10
- **Visual vs. Code:** Complex calculation logic (GD, Points) and "Best Third" evaluation. Ensure frontend memoizes these calculations.
- **Top Fix:** Hide detailed columns (Goals For/Against) behind a "Details" toggle. Add visual status indicators (Check/X) next to the user's "Qualifiers" picks to show success at a glance.

### Knockout Bracket (/play/knockout)
- **Scorecard:**
  - **Clarity:** 7/10 (Visual representation is standard)
  - **Information Hierarchy:** 9/10 (Progression is clear)
  - **Cognitive Ease:** 5/10 (Mobile brackets require panning/zooming)
  - **Speed:** 7/10
  - **Affordance & Feedback:** 8/10 (Pills look clickable)
  - **Visual Design:** 9/10
  - **Fun / Engagement:** 10/10 (High stakes)
- **Visual vs. Code:** Code infers draw readiness; UI must clearly state *why* a pick is locked or why a matchup isn't ready (e.g., "Waiting for Group A").
- **Top Fix:** Add a "List View" toggle for mobile users who struggle with panning the large bracket canvas.

### Picks History (/play/picks)
- **Scorecard:**
  - **Clarity:** 8/10
  - **Information Hierarchy:** 6/10 (List can get long)
  - **Cognitive Ease:** 8/10
  - **Speed:** 5/10 (Pagination breaks flow)
  - **Affordance & Feedback:** 3/10 (Read-only state often confuses users trying to edit)
  - **Visual Design:** 6/10
  - **Fun / Engagement:** 4/10
- **Visual vs. Code:** README mentions pagination (size 10). Code likely fetches all picks; client-side pagination creates artificial friction.
- **Top Fix:** Remove pagination in favor of a virtualized infinite scroll or "Group by Day" list. Add a "Jump to Today" button.

### Admin: Players Tab
- **Scorecard:**
  - **Clarity:** 9/10 (List of members)
  - **Information Hierarchy:** 7/10
  - **Cognitive Ease:** 8/10
  - **Speed:** 8/10
  - **Affordance & Feedback:** 7/10
  - **Visual Design:** 5/10 (Standard table)
  - **Fun / Engagement:** 2/10 (Pure utility)
- **Visual vs. Code:** Ensure "Is Admin" toggles have immediate optimistic updates or clear loading states.
- **Top Fix:** Add a search/filter bar if the league grows beyond 20 members.

### Admin: Exports Tab
- **Scorecard:**
  - **Clarity:** 6/10 (Technical labels like "Seed Data" vs "Backup")
  - **Information Hierarchy:** 5/10 (Often a flat list of buttons)
  - **Cognitive Ease:** 6/10
  - **Speed:** 9/10
  - **Affordance & Feedback:** 4/10 (Needs clear success toasts for background tasks)
  - **Visual Design:** 3/10
  - **Fun / Engagement:** 1/10
- **Visual vs. Code:** Long-running exports need progress indicators, not just a spinner.
- **Top Fix:** Group exports by category (e.g., "Backups" vs "Analysis") and add descriptions for what each file contains.

### Admin: Demo Controls Tab
- **Scorecard:**
  - **Clarity:** 4/10 (Requires knowledge of internal scenarios like "mid-knockout")
  - **Information Hierarchy:** 5/10
  - **Cognitive Ease:** 3/10 (High complexity, affects global app state)
  - **Speed:** 9/10 (Instant scenario switching)
  - **Affordance & Feedback:** 8/10 (Scenario active state usually clear)
  - **Visual Design:** 3/10 (Dev tool aesthetic)
  - **Fun / Engagement:** 5/10 (God mode is fun)
- **Visual vs. Code:** Changing scenarios triggers massive state changes; ensure the UI forces a reload or clearly signals that data has changed.
- **Top Fix:** Add a "Reset to Live" button that is visually distinct (e.g., Red) to quickly exit demo mode.

## 3. Gap Analysis
- **What's Missing:**
  - **Social Signals (No Schema Change):** Instead of chat/comments (which require schema changes), add computed "Social Signals" like "Trend Cards" or "Contrarian" badges based on existing pick data.
  - **"What-If" Scenarios:** Client-side calculator to see how a result affects leaderboard standing.
  - **Data Freshness:** UI indicators for when data was last updated (since backend is static/GH Actions).
  - **Admin Safety Nets:** Lack of confirmation dialogs for destructive actions (Seed, Reset).
  - **Mobile-First Data Navigation:** Infinite scroll or "Jump to Today" is missing from Picks History; Brackets lack a non-canvas view.

- **Actionable Improvement Ideas:**
  - **Quick Wins:**
    - **Toast Standardization:** Ensure all success/error messages use `ToastProvider` fixed to the top-right stack, never covering CTAs.
    - **Admin Safety:** Add confirmation modals for "Seed Database" and "Reset" actions.
    - **Demo Mode:** Add a distinct "Reset to Live" button.
    - **Picks History:** Remove pagination; add "Jump to Today".
    - Add "Pull to Refresh" for scores.
    - Add a "Copy Invite Link" button to the dashboard to grow the league easily.
  - **Strategic Shifts:**
    - **Gamification:** Add badges for "Perfect Prediction" or "Underdog Picker" (computed client-side).
    - **Legibility:** Ensure all new social components pass contrast checks in Light, Dark, and System modes.
    - **View Toggles:** Implement "Chart vs List" toggles for Brackets and Group tables to support mobile users.