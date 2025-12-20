# Implementation Plan (Step 1–4)

## Step 1 — UI Shell + Mock Data
**Goal:** A working UI you can navigate, deployed on GitHub Pages, powered by local JSON.

- [ ] Create repo + Vite React + TypeScript app
- [ ] Add routing/pages:
  - [ ] `/` (next matchday picks)
  - [ ] `/upcoming` (all remaining matches)
  - [ ] `/results` (completed matches)
  - [ ] `/leaderboard` (placeholder)
  - [ ] `/admin` (placeholder)
- [ ] Add `public/data/matches.json` with mock matches + `lastUpdated`
- [ ] Build results view reading `/data/matches.json`
  - [ ] Show teams, kickoff time, status, score (if finished)
- [ ] Set up GitHub Pages deploy workflow and verify site loads

---

## Step 2 — Full Working App (Mock JSON + Local Storage)
**Goal:** End-to-end picks + leaderboard using mock JSON and local storage (no Firebase yet).

- [ ] Expand mock data:
  - [ ] `public/data/matches.json` with results + statuses
  - [ ] `public/data/members.json` with sample users
  - [ ] `public/data/picks.json` with sample picks
  - [ ] `public/data/scoring.json` for group + knockout points
- [ ] Home: next matchday only
  - [ ] Highlight missing picks
- [ ] Upcoming page: all remaining matches in ascending order
  - [ ] Same pick inputs as home
- [ ] Results page: completed matches (descending)
  - [ ] Show results + your picks (including missing picks)
- [ ] Implement pick entry UI
  - [ ] Exact score (home/away)
  - [ ] Match outcome (home win/draw/home loss)
  - [ ] Knockout extras (eventual winner AET/Pens when draw)
- [ ] Save picks locally (localStorage) and allow edits
- [ ] Implement pick locking rule (day before kickoff at 12:00am league time)
  - [ ] Disable inputs and show “Locked since …”
- [ ] Implement scoring + leaderboard (client-side, mock data)
  - [ ] Separate points for exact, outcome, knockout extras
  - [ ] Stage-specific knockout scoring (R32, R16, QF, SF, Third, Final)
  - [ ] Render standings from mock members + picks

---

## Step 3 — Firebase Auth + Firestore (Free Tier)
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

---

## Step 4 — API Integration (Daily Batch Sync → `matches.json`)
**Goal:** Automate fixtures/results updates once per day without exposing API keys.

- [ ] Create football-data.org API token
- [ ] Add GitHub repo secret: `FOOTBALL_DATA_TOKEN`
- [ ] Add Node script (e.g., `scripts/updateMatches.ts`) that:
  - [ ] Calls football-data.org World Cup endpoint
  - [ ] Normalizes response into your `public/data/matches.json` schema
  - [ ] Sets `lastUpdated` timestamp
- [ ] Add GitHub Action workflow (cron, daily) that:
  - [ ] Runs the script
  - [ ] Commits updated `public/data/matches.json`
- [ ] Verify end-to-end:
  - [ ] Repo updates daily
  - [ ] GitHub Pages serves updated JSON
  - [ ] App reflects new results on next load/refresh
