# World Cup Predictions App – MVP

## 1. Authentication & Private League Gate
- Google sign-in (Firebase Auth)
- Private league access
  - MVP: email allowlist (admin-managed)
- User profile creation (name + avatar)

## 2. Fixtures & Results (Daily Batch)
- GitHub Action runs once per day
  - Fetch World Cup fixtures/results from football-data.org
  - Write and commit `data/matches.json`
- Display “Last updated” timestamp in the app

## 3. Match Browsing
- Match list grouped by:
  - Date
  - Stage (Group, R16, QF, SF, Final)
- Match rows show:
  - Teams
  - Kickoff time (league timezone)
  - Status
  - Final score (when available)

## 4. Picks
- Create and edit picks
  - Group stage: predicted score
  - Knockout stage: predicted winner (+ ET/Pens toggle if draw after 90)
- “My Picks” view
  - Upcoming matches
  - Missing picks indicator
- Pick locking
  - Edits disabled starting 12:00am league time the day before kickoff
  - Show “Locked since …” indicator

## 5. Scoring & Leaderboard (Client-Side)
- Deterministic scoring function
  - Exact score points
  - Correct outcome points
  - Knockout winner points
- Leaderboard
  - Total points per user
  - Tie-breakers (e.g., number of exact scores, then earliest submission)
- Recompute totals:
  - On page load
  - When `matches.json` changes (or via manual refresh)

## 6. Minimal Admin
- Admin-only page to:
  - Manage email allowlist / league members
  - (Optional) Configure league name and scoring toggles
