# Implementation Plan (Step 1–5)

## Step 1 — UI Shell + Mock Data
**Goal:** A working UI you can navigate, deployed on GitHub Pages, powered by local JSON.

- [x] Create repo + Vite React + TypeScript app
- [x] Add routing/pages:
  - [x] `/` (redirects to `/upcoming`)
  - [x] `/upcoming` (all remaining matches)
  - [x] `/results` (completed matches)
  - [x] `/leaderboard` (placeholder)
  - [x] `/admin` (placeholder)
- [x] Add `public/data/matches.json` with mock matches + `lastUpdated`
- [x] Build results view reading `/data/matches.json`
  - [x] Show teams, kickoff time, status, score (if finished)
- [x] Set up GitHub Pages deploy workflow and verify site loads

---

## Step 2 — Full Working App (Mock JSON + Local Storage)
**Goal:** End-to-end picks + leaderboard using mock JSON and local storage (no Firebase yet).

- [x] Expand mock data:
  - [x] `public/data/matches.json` with results + statuses
  - [x] `public/data/members.json` with sample users
  - [x] `public/data/picks.json` with sample picks
  - [x] `public/data/scoring.json` for group + knockout points
- [x] Home: next matchday only
  - [x] Highlight missing picks
- [x] Upcoming page: all remaining matches in ascending order
  - [x] Same pick inputs as home
- [x] Results page: completed matches (descending)
  - [x] Show results + your picks (including missing picks)
- [x] Implement pick entry UI
  - [x] Exact score (home/away)
  - [x] Match outcome (home win/draw/away win)
  - [x] Knockout extras (eventual winner AET/Pens, independent of result)
- [x] Save picks locally (localStorage) and allow edits
- [x] Implement pick locking rule (30 minutes before kickoff)
  - [x] Lock at kickoff minus 30 minutes (PST display)
  - [x] Disable inputs and show “Locked since …”
- [x] Implement scoring + leaderboard (client-side, mock data)
  - [x] Separate points for exact, outcome, knockout extras
  - [x] Stage-specific knockout scoring (R32, R16, QF, SF, Third, Final)
  - [x] Render standings from mock members + picks
- [x] Add admin-only navigation under user dropdown
- [x] Add light/dark mode toggle in the header
- [x] Add theme packs with admin selection
- [x] Add upcoming lock reminder banner on `/upcoming`
- [x] Add leaderboard pagination (default 6 per page)
- [x] Add gameday history chart with user vs user comparison

---

## Step 3 — API Integration (Daily Batch Sync → `matches.json`)
**Goal:** Automate fixtures/results updates once per day without exposing API keys.

- [x] Create football-data.org API token
- [x] Add GitHub repo secret: `FOOTBALL_DATA_TOKEN`
- [x] Add Node script `scripts/updateMatches.js` that:
  - [x] Calls football-data.org World Cup endpoint
  - [x] Normalizes response into your `public/data/matches.json` schema
  - [x] Sets `lastUpdated` timestamp
- [x] Add npm script `update-matches`
- [x] Add GitHub Action workflow (cron, daily) that:
  - [x] Runs the script
  - [x] Commits updated `public/data/matches.json`

---

## Step 4 — Bracket Prediction
**Goal:** Allow users to predict group qualifiers and knockout winners, score them, and show on leaderboard.

- [x] Add bracket prediction model:
  - [x] Predict top 2 for each group
  - [x] Predict 8 best third-place qualifiers
  - [x] Predict knockout winners through final
- [x] Extend `public/data/scoring.json` with bracket prediction scoring:
  - [x] Group qualifier points
  - [x] Best third-place qualifier points
  - [x] Knockout round points (R32, R16, QF, SF, Third, Final)
- [x] Evaluate bracket prediction scoring on matchday update
- [x] Add bracket prediction points to leaderboard breakdown
- [x] Build new page for bracket prediction
- [x] Auto-advance knockout bracket rounds based on user picks
- [x] Lock bracket picks at 11:59 PM PST (group: day before first group match; knockout: day before first knockout match)
- [x] Add bracket view toggle (group vs knockout) with knockout default after group stage
- [x] Add official best third-place qualifier list in `public/data/best-third-qualifiers.json`
- [x] Refresh leaderboard on `matches.json` deploys
- [x] Refresh bracket scoring on best third-place qualifier deploys
- [x] Add simulated data modes (group partial/complete, knockout partial/complete) with per-mode JSON files
- [x] Define Firebase data structure for bracket predictions

---

## Step 5 — Firebase Auth + Firestore (Free Tier)
**Goal:** Replace local mock storage with real auth + database.

- [ ] Create Firebase project (Spark plan)
- [ ] Enable Google sign-in provider
- [ ] Add authorized domains (localhost + GitHub Pages domain)
- [ ] Create Firestore database
- [ ] Add minimal Firestore structure:
  - [ ] `leagues/{leagueId}`
  - [ ] `leagues/{leagueId}/allowlist/*` (or join-requests if you choose)
  - [ ] `leagues/{leagueId}/members/*`
  - [ ] `leagues/{leagueId}/picks/*`
- [ ] Add minimal Firestore security rules:
  - [ ] Auth required
  - [ ] Only members can read league data
  - [ ] Users can only write their own picks
  - [ ] Only admin can manage allowlist/members
- [ ] Wire Firebase SDK into the app
  - [ ] Sign in/out buttons in header
  - [ ] Redirect signed-in users to `/`
- [ ] Migrate local storage picks/members to Firestore
- [ ] Final checks:
  - [ ] Repo updates daily
  - [ ] GitHub Pages serves updated JSON
  - [ ] App reflects new results on next load/refresh
