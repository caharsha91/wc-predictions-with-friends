# World Cup Predictions App – MVP

## 1. Current App Flow (Mock Data + Local Picks)
- Home: next matchday picks (highlight missing)
- Upcoming: all remaining matches + picks
- Results: completed matches + your picks (including missing)
- Leaderboard: category points (exact, outcome, knockout extras)

## 2. Fixtures & Results (Daily Batch)
- GitHub Action runs once per day
  - Fetch World Cup fixtures/results from football-data.org
  - Write and commit `data/matches.json`
- Display “Last updated” timestamp in the app

## 3. Picks
- Exact score prediction (home + away)
- Match outcome prediction (home win / draw / home loss)
- Knockout extras (eventual winner AET/Pens when draw)
- Pick locking
  - Edits disabled starting 12:00am league time the day before kickoff
  - Show “Locked since …” indicator

## 4. Scoring & Leaderboard (Client-Side)
- Configurable scoring in `public/data/scoring.json`
  - Group points: exact score (both/one), result
  - Knockout points per round: R32, R16, QF, SF, Third, Final
- Leaderboard shows category totals (exact, outcome, knockout extras)

## 5. Authentication & Private League Gate (Future)
- Google sign-in (Firebase Auth)
- Private league access (email allowlist)
- User profile creation (name + avatar)

## 6. Minimal Admin
- Admin-only page to:
  - Manage email allowlist / league members
  - (Optional) Configure league name and scoring toggles
