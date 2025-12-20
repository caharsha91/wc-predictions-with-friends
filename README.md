# wc-predictions-with-friends

Simple World Cup predictions app for a private league with my friends: picks, points, and bragging rights.

## App Flow (Current)

- `/` next matchday picks (highlights missing picks)
- `/upcoming` all remaining matches with picks
- `/results` completed matches + your picks
- `/leaderboard` category points (exact, outcome, knockout extras)

Mock data lives in `public/data/` (`matches.json`, `members.json`, `picks.json`, `scoring.json`).

## Dev

1. Install Node.js (v20+ recommended)
2. Install deps: `npm install`
3. Run: `npm run dev`

## Deploy (GitHub Pages)

This repo includes a workflow at `.github/workflows/deploy-pages.yml` that builds the Vite app and deploys `dist/` to GitHub Pages on pushes to `main`.

1. Commit and push to `main`: `git add -A && git commit -m "Deploy" && git push`
2. In GitHub: `Settings → Pages → Build and deployment → Source: GitHub Actions`
3. Wait for `Actions → Deploy to GitHub Pages` to finish, then open:
   - `https://<your-username>.github.io/<repo-name>/`
