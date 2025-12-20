# Implementation Plan (Step 1–4)

## Step 1 — UI Shell + Mock Data
**Goal:** A working UI you can navigate, deployed on GitHub Pages, powered by local JSON.

- [ ] Create repo + Vite React + TypeScript app
- [ ] Add routing/pages:
  - [ ] `/` (landing)
  - [ ] `/matches` (match list)
  - [ ] `/leaderboard` (placeholder)
  - [ ] `/admin` (placeholder)
- [ ] Add `public/data/matches.json` with mock matches + `lastUpdated`
- [ ] Build Matches page reading `/data/matches.json`
  - [ ] Group by date + stage
  - [ ] Show teams, kickoff time, status, score (if finished)
- [ ] Add simple UI stub for “Pick” per match (not wired)
- [ ] Set up GitHub Pages deploy workflow and verify site loads

---

## Step 2 — Full Working App (Mock JSON + Local Storage)
**Goal:** End-to-end picks + leaderboard using mock JSON and local storage (no Firebase yet).

- [ ] Expand mock data:
  - [ ] `public/data/matches.json` with results + statuses
  - [ ] `public/data/members.json` with sample users
  - [ ] `public/data/picks.json` with sample picks
- [ ] Add “My Picks” view (route + nav)
  - [ ] Group by date + stage
  - [ ] Show missing pick indicators
- [ ] Implement pick entry UI
  - [ ] Group stage: predicted score inputs
  - [ ] Knockout: predicted winner (+ ET/Pens toggle if draw after 90)
- [ ] Save picks locally (localStorage) and allow edits
- [ ] Implement pick locking rule (day before kickoff at 12:00am league time)
  - [ ] Disable inputs and show “Locked since …”
- [ ] Implement scoring + leaderboard (client-side, mock data)
  - [ ] Compute totals + tie-breakers (exact count, earliest submission)
  - [ ] Render standings from mock members + picks
- [ ] Show `matches.json` `lastUpdated` + optional “Refresh” button

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
  - [ ] Sign in/out buttons on `/`
  - [ ] Redirect signed-in users to `/matches`
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
