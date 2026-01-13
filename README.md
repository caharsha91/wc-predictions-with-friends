# wc-predictions-with-friends

Simple World Cup predictions app for a private league with my friends: picks, points, and bragging rights.

## App Flow (Current)

- `/` home landing page (how to play, scoring, quick CTAs)
- `/picks` upcoming picks + results in one view (Upcoming/Results tabs, Today/Matchday/All for upcoming, inline stage/group filters)
- legacy routes: `/upcoming` → `/picks?tab=upcoming`, `/results` → `/picks?tab=results`
- `/bracket` bracket predictions (group qualifiers + knockout winners, auto-advances by picks, graphical knockout bracket + inline team pick pills)
- `/leaderboard` category points + standings pagination
- `/settings` appearance + about + admin shortcuts (light/dark/system; /themes redirects)
- `/users` members manager (admins only, or simulation enabled; accessible from Settings)
- `/simulation` local-only simulation sandbox (admins only, or simulation enabled)
- `/exports` finished-only CSV exports (admins only, or simulation enabled)

Mock data lives in `public/data/` (`matches.json`, `members.json`, `picks.json`, `scoring.json`, `bracket-group.json`, `bracket-knockout.json`, `best-third-qualifiers.json`, `leaderboard.json`).

## Docs

- `skills.md` Codex project guide and pointers.
- `docs/pages/` page summaries for each route.

## How the App Works (Contributor Guide)

- Entry + routing: `src/main.tsx` bootstraps the app and applies theme attributes; `src/ui/App.tsx` defines routes; `src/ui/Layout.tsx` owns the shared header/nav shell.
- Data flow: `src/ui/hooks/*` fetches from Firestore when enabled (see `src/lib/firebase.ts`), otherwise reads mock JSON from `public/data/`. Static JSON fetches use HTTP caching + localStorage TTL to reduce reads. Picks updates flow through `src/lib/picks.ts`.
- Match grouping: `src/lib/matches.ts` normalizes and groups matches by PST matchday + stage for the picks view.
- Scoring: `src/lib/scoring.ts` computes pick + bracket points from `public/data/scoring.json`, surfaced in leaderboard views.
- Theming: base tokens live in `src/styles/theme.css`, ChatGPT-inspired light/dark palettes in `src/styles/themes.css`, and state in `src/theme/ThemeProvider.tsx` with localStorage persistence + optional Firestore sync (surface controls in `/settings`).
- Styling: Tailwind + shadcn/ui components, with remaining page-specific styles in `src/ui/styles.css`.
- UI primitives: reusable components are in `src/ui/components/ui/` and app-specific components in `src/ui/components/`.

## Dev

1. Install Node.js (v20+ recommended)
2. Install deps: `npm install`
3. Run: `npm run dev`

## Local Firebase (Emulators)

1. Install the Firebase CLI (one-time).
2. Ensure `.env.local` includes:
   - `VITE_USE_FIREBASE_EMULATORS=true`
   - `VITE_FIREBASE_EMULATOR_HOST=127.0.0.1`
   - `VITE_FIREBASE_AUTH_EMULATOR_PORT=9099`
   - `VITE_FIRESTORE_EMULATOR_PORT=8080`
3. Start emulators in a separate terminal: `firebase emulators:start`
4. Seed emulator data:
   - `VITE_USE_FIREBASE_EMULATORS=true FIREBASE_PROJECT_ID=demo-wc-predictions node scripts/seedEmulators.js`
5. Run the app: `npm run dev`

## Pick Locks (PST)

- Match picks lock 30 minutes before kickoff.
- Bracket group qualifiers + best third-place picks lock at 11:59 PM PST on the day before the first group match day.
- Bracket knockout picks lock at 11:59 PM PST on the day before the first knockout match day.
- Knockout eventual winner picks are independent of the result selection.

## Bracket Guides

- Group stage guide highlights group qualifiers + best third-place pick flow.
- Knockout guide explains inline team-pill picks and champion badge from the Final.

## Backstage

- Backstage pages are available to admins (or when simulation mode is enabled) and are linked from Settings.
- `/users` includes the members manager (name/email/admin flag).
- `/simulation` provides local-only simulation controls.
- `/exports` provides finished-only CSV downloads (picks, brackets, leaderboard).

## Firestore Data Model (when enabled)

- `leagues/{leagueId}/members/{email}` (doc id is lower-case email)
  - `email`, `name`, `handle?`, `isAdmin?`, `createdAt?`, `theme?`
- `leagues/{leagueId}/picks/{userId}` → one doc per user with all match picks
- `leagues/{leagueId}/bracket-group/{userId}` → one doc per user (group + best thirds)
- `leagues/{leagueId}/bracket-knockout/{userId}` → one doc per user (knockout winners)

JSON mirrors for local mode: `public/data/members.json`, `public/data/picks.json`, `public/data/bracket-group.json`, `public/data/bracket-knockout.json`.

## Firebase Setup (Step 5)

1. Create a Firebase project (Spark plan) and add a Web app.
2. Enable Google sign-in.
3. Add authorized domains (localhost + GitHub Pages domain).
4. Create a Firestore database (production mode).
5. Firestore rules: copy `firestore.rules` into the Rules editor and publish.
6. Seed league access:
   - Members: `leagues/{leagueId}/members/{email}` with `email`, `name`, `isAdmin`, `createdAt`.
   - Doc id is the lower-case email address used to sign in with Google.
7. Add env vars from `.env.example` (set `VITE_LEAGUE_ID` to your league ID) and restart dev server.

## Secrets and Variables (GitHub Actions)

Set these in GitHub: `Settings → Secrets and variables → Actions`.

Secrets:
- `FOOTBALL_DATA_TOKEN` (football-data.org API token used by `.github/workflows/update-matches.yml`)

Variables (public web config used by Vite build):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_LEAGUE_ID`

## Seed Production Firestore (local only)

Do this from your machine (never in CI). Requires a local service account JSON.

```sh
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/.secrets/firebase-adminsdk.json"
export FIREBASE_PROJECT_ID="your-project-id"
export LEAGUE_ID="default"
# Optional: export MEMBERS_PATH="scripts/seed-data/members.json"
npm run seed:prod
```

By default, `seed:prod` reads `public/data/members.json` (or `scripts/seed-data/members.json` if present).

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

1. Ensure GitHub Actions variables/secrets are set (see above).
2. Commit and push to `main`: `git add -A && git commit -m "Deploy" && git push`
3. In GitHub: `Settings → Pages → Build and deployment → Source: GitHub Actions`
4. Wait for `Actions → Deploy to GitHub Pages` to finish, then open:
   - `https://<your-username>.github.io/<repo-name>/`
