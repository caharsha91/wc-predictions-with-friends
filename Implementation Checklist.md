# Implementation Plan (Step 1–5)

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

## Step 2 — Firebase Auth + Firestore (Free Tier)
**Goal:** Users can sign in with Google and you have storage for members and picks.

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

---

## Step 3 — Picks + Pick Locking
**Goal:** Users can submit picks and edits lock the day before kickoff.

- [ ] Implement “private league gate” (MVP: email allowlist)
  - [ ] If allowed: upsert `members/{uid}`
  - [ ] If not allowed: show “Not invited”
- [ ] Implement pick form + Firestore upsert
  - [ ] Group stage: predicted score
  - [ ] Knockout: predicted winner (+ ET/Pens toggle if draw after 90)
- [ ] Implement pick locking rule:
  - [ ] Lock at 12:00am league time the day before kickoff
  - [ ] Disable inputs and show “Locked since …”
- [ ] Build “My Picks” view:
  - [ ] Upcoming matches + missing pick indicator

---

## Step 4 — Scoring + Leaderboard (Client-Side)
**Goal:** A working leaderboard computed from picks + results.

- [ ] Implement deterministic scoring function:
  - [ ] Exact score points
  - [ ] Correct outcome points
  - [ ] Knockout winner points (+ method handling if used)
- [ ] Leaderboard page:
  - [ ] Fetch members + picks from Firestore
  - [ ] Fetch `/data/matches.json`
  - [ ] Compute totals + tie-breakers (e.g., exact count, earliest submission)
  - [ ] Render standings
- [ ] Show `matches.json` `lastUpdated` and add optional “Refresh” button

---

## Step 5 — API Integration (Daily Batch Sync → `matches.json`)
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
