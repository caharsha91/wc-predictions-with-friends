# wc-predictions-with-friends

Simple World Cup predictions app for a private league with my friends: picks, points, and bragging rights.

## App Flow (Current)

- `/` redirects to `/upcoming`
- `/upcoming` remaining matches by matchday with picks + lock countdown banner (group filter; knockout unlocks after groups)
- `/results` completed matches by matchday with your picks (group filter; knockout unlocks after groups)
- `/bracket` bracket predictions (group qualifiers + knockout winners, auto-advances by picks, graphical knockout bracket + inline team pick pills)
- `/leaderboard` category points + standings pagination
- `/themes` theme selector (light/dark + theme packs)
- `/users` allowlist manager (admins only, or simulation enabled)
- `/simulation` local-only simulation sandbox (admins only, or simulation enabled)
- `/exports` finished-only CSV exports (admins only, or simulation enabled)

Mock data lives in `public/data/` (`matches.json`, `members.json`, `picks.json`, `scoring.json`, `bracket-group.json`, `bracket-knockout.json`, `best-third-qualifiers.json`, `leaderboard.json`, `allowlist.json`).

## How the App Works (Contributor Guide)

- Entry + routing: `src/main.tsx` bootstraps the app and applies theme attributes; `src/ui/App.tsx` defines routes; `src/ui/Layout.tsx` owns the shared header/nav shell.
- Data flow: `src/ui/hooks/*` fetches from Firestore when enabled (see `src/lib/firebase.ts`), otherwise reads mock JSON from `public/data/`. Picks updates flow through `src/lib/picks.ts`.
- Match grouping: `src/lib/matches.ts` normalizes and groups matches by PST matchday + stage for upcoming/results views.
- Scoring: `src/lib/scoring.ts` computes pick + bracket points from `public/data/scoring.json`, surfaced in leaderboard views.
- Theming: base tokens live in `src/styles/theme.css`, per-theme palettes in `src/styles/themes.css`, and state in `src/theme/ThemeProvider.tsx` with persistence in localStorage.
- UI primitives: reusable components are in `src/ui/components/ui/` and app-specific components in `src/ui/components/`.

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

## Backstage

- Backstage pages are available to admins (or when simulation mode is enabled).
- `/users` includes the allowlist manager (name/email/admin flag).
- `/simulation` provides local-only simulation controls.
- `/exports` provides finished-only CSV downloads (picks, brackets, leaderboard).

## Firestore Data Model (when enabled)

- `leagues/{leagueId}/members/{userId}`
- `leagues/{leagueId}/picks/{userId}` → one doc per user with all match picks
- `leagues/{leagueId}/bracket-group/{userId}` → one doc per user (group + best thirds)
- `leagues/{leagueId}/bracket-knockout/{userId}` → one doc per user (knockout winners)
- `leagues/{leagueId}/allowlist/{email}`

JSON mirrors for local mode: `public/data/allowlist.json`, `public/data/members.json`, `public/data/picks.json`, `public/data/bracket-group.json`, `public/data/bracket-knockout.json`.

## Data Updates (Fixtures/Results)

Match data is sourced from `https://api.football-data.org/v4/competitions/WC/matches`.

- Local update: set `FOOTBALL_DATA_TOKEN` and run `npm run update-matches`
- Local leaderboard refresh: `npx tsx scripts/updateLeaderboard.ts`
- GitHub Actions: `.github/workflows/update-matches.yml` (daily + manual) writes `public/data/matches.json` + `public/data/leaderboard.json`
- Best third-place qualifiers: update `public/data/best-third-qualifiers.json` if it differs from computed standings
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
