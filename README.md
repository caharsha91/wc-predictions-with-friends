# wc-predictions-with-friends

Simple World Cup predictions app for a private league with my friends: picks, points, and bragging rights.

## App Flow (Current)

- `/` next matchday picks (highlights missing picks)
- `/upcoming` all remaining matches with picks
- `/results` completed matches + your picks
- `/bracket` bracket predictions (group qualifiers + knockout winners)
- `/leaderboard` category points (exact, outcome, knockout extras, bracket)

Mock data lives in `public/data/` (`matches.json`, `members.json`, `picks.json`, `scoring.json`, `bracket-predictions.json`).

## Dev

1. Install Node.js (v20+ recommended)
2. Install deps: `npm install`
3. Run: `npm run dev`

## Data Updates (Fixtures/Results)

Match data is sourced from `https://api.football-data.org/v4/competitions/WC/matches`.

- Local update: set `FOOTBALL_DATA_TOKEN` and run `npm run update-matches`
- GitHub Actions: `.github/workflows/update-matches.yml` (daily + manual) writes `public/data/matches.json`

Notes:
- Do not commit API tokens to this repo.
- Check football-data.org for plan limits and rate caps.

## Deploy (GitHub Pages)

This repo includes a workflow at `.github/workflows/deploy-pages.yml` that builds the Vite app and deploys `dist/` to GitHub Pages on pushes to `main`.

1. Commit and push to `main`: `git add -A && git commit -m "Deploy" && git push`
2. In GitHub: `Settings → Pages → Build and deployment → Source: GitHub Actions`
3. Wait for `Actions → Deploy to GitHub Pages` to finish, then open:
   - `https://<your-username>.github.io/<repo-name>/`
