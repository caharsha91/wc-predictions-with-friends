--- /dev/null
+++ /Users/harshacopparam/Code/wc-predictions-with-friends/implementation_plan.md
@@ -0,0 +1,85 @@
+# Implementation Plan: World Cup Friends App
+
+## Phase 1: Global UI & Admin Hardening
+**Objective:** Establish a robust, safe, and visually modern foundation for the application, addressing the "Admin Safety Nets" gap and "Toast Standardization" quick win identified in the audit.
+
**Cost-Efficiency Note:** All changes are strictly UI/Layout modifications. Admin safety checks are client-side gates before existing API calls.

**Key Tasks:**
- [x] **Toast Overhaul:**
    - [x] Refactor `ToastProvider` to enforce a fixed top-right stacking context (z-index high).
    - [x] Update visual design to a "Glassmorphism" aesthetic using existing theme tokens.
    - [x] Ensure distinct visual states for Success, Error, and Info.
- [x] **Demo Mode Visibility:**
    - [x] Implement a persistent "Demo Mode Active" banner in `Layout.tsx`.
    - [x] Ensure the banner is unobtrusive but clearly visible.
- [x] **Admin Safety (Partially Complete):**
    - [x] Create a reusable `ConfirmationModal` component.
    - [x] Wrap destructive actions in `/admin` (Seed Database, Reset) with this modal to prevent accidental data loss.
    - [x] Add a distinct "Reset to Live" button in the Demo Controls tab.

**Theme Support:**
- [x] Verify Toast legibility against both Light and Dark modes.
- [x] Ensure the Demo Mode banner uses a semantic warning color accessible in all themes.
+
+## Phase 2: Dashboard & Leaderboard UX
+**Objective:** Solve the "Information Hierarchy" issues where critical user status (Rank/Points) is hidden, and increase social engagement via the "Rivalry Strip".
+
+**Cost-Efficiency Note:** The "Rivalry Strip" and Rank elevation are computed entirely client-side from the already-fetched `leaderboard.json`, requiring no new Firestore reads.
+
+**Key Tasks:**
+- [x] **Dashboard Hierarchy:**
+    - Create a `UserStatusCard` component to display current Rank and Points at the very top of the Dashboard (above upcoming matches).
+    - Implement the "Rivalry Strip" within this card: Find the user's rank, identify the immediate neighbor (up or down), and display the point differential (e.g., "4 pts behind @josh").
+- [x] **Leaderboard Polish:**
+    - Implement "Sticky User Row": Ensure the current user's row in the Leaderboard table is always visible (pinned to bottom or top) if they scroll away from it.
+    - Use theme variables to highlight the user's row distinctively.
+- [x] **Navigation Simplification:**
+    - (Optional per audit) Evaluate combining "Upcoming Matches" and "Prediction Entry" if screen real estate permits.
+
+**Theme Support:**
+- [x] Check contrast ratios for the "Sticky Row" highlight color in Dark Mode.
+- [x] Ensure the "Rivalry Strip" text (especially negative/positive deltas) is color-coded accessibly.
+
+## Phase 3: Mobile Interaction & Density
+**Objective:** Address "Cognitive Overload" and "Data Density" on mobile devices, specifically for data-heavy views like Brackets and Prediction Entry.
+
+**Cost-Efficiency Note:** All view toggles and filters operate on local state. Infinite scroll is simulated using client-side chunking of the full static dataset.
+
+**Key Tasks:**
+- [x] **Prediction Entry:**
+    - Create a `ScoreStepper` component ([- 1 +]) to replace/augment raw number inputs. This prevents the mobile keyboard from triggering and obscuring the UI for simple score adjustments.
+- [x] **Complex Data Views:**
+    - Implement a "List View" toggle for the `KnockoutBracket` component. On mobile, default to List View to avoid panning/zooming issues.
+    - Add a "Details" toggle for Group Standings tables to hide non-essential columns (GD, GA, GF) on small screens.
+- [x] **Picks History:**
+    - Remove pagination.
+    - Implement "Virtual Infinite Scroll" or "Group by Day" rendering for the Picks list.
+    - Add a "Jump to Today" button to quickly navigate the long list.
+
+**Theme Support:**
+- [x] Ensure Stepper buttons have sufficient touch targets (min 44px) and clear active states in all themes.
+- [x] Verify that "List View" cards maintain clear separation in Dark Mode.
+
+## Phase 4: Client-Side Gamification
+**Objective:** Implement "Strategic Shifts" from the audit to increase fun and engagement without incurring database costs.
+
+**Cost-Efficiency Note:** Badges and "What-If" scenarios are derived purely from `picks.json` (static) and `matches.json` (static) using client-side logic.
+
+**Key Tasks:**
+- [x] **Social Signals (Badges):**
+    - Create a utility to compute badges:
+        - **Contrarian:** Picked a winner that <20% of the league picked.
+        - **Perfect Pick:** Correct score prediction.
+        - **Underdog:** Picked a team with low win probability (if odds data available) or low league selection rate.
+    - Display these badges on the Leaderboard row expansion or User Profile.
+- [x] **"What-If" Simulator:**
+    - Build a client-side calculator modal.
+    - Allow users to input hypothetical results for upcoming matches.
+    - Re-calculate the local leaderboard state to show "Projected Rank" based on those inputs.
+
+**Theme Support:**
+- [x] Design badges using SVG icons that adapt fill colors based on the active theme (Light/Dark).
+- [x] Ensure the "What-If" simulator UI clearly distinguishes between "Live" data and "Simulated" data (e.g., using a dashed border or distinct background tint).
