# wc-predictions-with-friends

Simple World Cup predictions app for a private league with my friends: picks, points, and bragging rights.

## App Flow (Current)

- `/` redirects to `/upcoming`
- `/upcoming` remaining matches by matchday with picks + lock countdown banner (group filter; knockout unlocks after groups)
- `/results` completed matches by matchday with your picks (group filter; knockout unlocks after groups)
- `/bracket` bracket predictions (group qualifiers + knockout winners, auto-advances by picks, graphical knockout bracket + inline team pick pills)
- `/leaderboard` category points + standings pagination
- `/exports` finished-only CSV exports (picks, brackets, leaderboard)

Mock data lives in `public/data/` (`matches.json`, `members.json`, `picks.json`, `scoring.json`, `bracket-predictions.json`, `best-third-qualifiers.json`).

## Dev

1. Install Node.js (v20+ recommended)
2. Install deps: `npm install`
3. Run: `npm run dev`

## Pick Locks (PST)

- Match picks lock 30 minutes before kickoff.
- Bracket group qualifiers + best third-place picks lock at 11:59 PM PST on the day before the first group match day.
- Bracket knockout picks lock at 11:59 PM PST on the day before the first knockout match day.
- Knockout eventual winner picks are independent of the result selection.

## Bracket Guides

- Group stage guide highlights group qualifiers + best third-place pick flow.
- Knockout guide explains inline team-pill picks and champion badge from the Final.

## Admin & Sim Modes

- Admin is available under the user dropdown (admins only).
- Results mode options:
  - Live
  - Sim: Group partial / Group complete
  - Sim: Knockout partial / Knockout complete
- Sim modes swap JSON files using `-simulated-<mode>.json` suffixes (matches, picks, bracket predictions, best-third qualifiers).
- Switching modes clears local picks + bracket predictions for the current user and reloads the app.

## Data Updates (Fixtures/Results)

Match data is sourced from `https://api.football-data.org/v4/competitions/WC/matches`.

- Local update: set `FOOTBALL_DATA_TOKEN` and run `npm run update-matches`
- GitHub Actions: `.github/workflows/update-matches.yml` (daily + manual) writes `public/data/matches.json`
- Best third-place qualifiers: update `public/data/best-third-qualifiers.json` if it differs from computed standings
- Leaderboard refreshes when `matches.json` updates (daily sync / deploy)
- Best third-place qualifiers updates should be deployed to refresh the bracket scoring

Notes:
- Do not commit API tokens to this repo.
- Check football-data.org for plan limits and rate caps.

## Deploy (GitHub Pages)

This repo includes a workflow at `.github/workflows/deploy-pages.yml` that builds the Vite app and deploys `dist/` to GitHub Pages on pushes to `main`.

1. Commit and push to `main`: `git add -A && git commit -m "Deploy" && git push`
2. In GitHub: `Settings → Pages → Build and deployment → Source: GitHub Actions`
3. Wait for `Actions → Deploy to GitHub Pages` to finish, then open:
   - `https://<your-username>.github.io/<repo-name>/`
