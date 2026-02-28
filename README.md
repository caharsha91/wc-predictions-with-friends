# wc-predictions-with-friends

World Cup predictions app for a private league: match picks, group-stage picks, knockout bracket picks, and leaderboard standings.

## Current App Routes

The app uses `HashRouter`, so deployed URLs are in the form `/#/<route>`.

Default mode routes:
- `/` play center
- `/group-stage` group-stage entry (redirects to a group)
- `/group-stage/:groupId` group-stage detail (`A`-`L`)
- `/match-picks` match picks detail
- `/knockout-bracket` knockout detail
- `/leaderboard` league standings
- `/admin` admin entry (redirects to `/admin/players`)
- `/admin/players` admin player manager
- `/admin/exports` admin exports
- `/admin/controls` admin demo controls
- `/login` sign-in page
- `/access-denied` unauthorized page

Demo mode routes (admin only):
- `/demo`
- `/demo/group-stage`
- `/demo/group-stage/:groupId`
- `/demo/match-picks`
- `/demo/knockout-bracket`
- `/demo/leaderboard`
- `/demo/admin`
- `/demo/admin/players`
- `/demo/admin/exports`
- `/demo/admin/controls`

## Cleanup / Breaking Changes

This cleanup intentionally removed backward-compat aliases and dead assets/code:
- Removed legacy routes: `/play*` and `/demo/play*`
- Removed legacy admin tab parsing via query/hash (`?tab=` / `#...`)
- Removed legacy group-stage query cleanup for `status`, `group`, `focus`, `points`
- Removed unused top-level flag SVGs in `public/flags/*.svg` (canonical flags remain in `public/flags/lib/*` plus `public/flags/unknown.svg`)

## Data Files

Primary snapshot data lives in `public/data/`:
- `matches.json`
- `members.json`
- `picks.json`
- `scoring.json`
- `bracket-group.json`
- `bracket-knockout.json`
- `best-third-qualifiers.json`
- `leaderboard.json`

Demo snapshot data lives in scenario folders:
- `public/data/demo/scenarios/pre-group/`
- `public/data/demo/scenarios/mid-group/`
- `public/data/demo/scenarios/end-group-draw-confirmed/`
- `public/data/demo/scenarios/mid-knockout/`
- `public/data/demo/scenarios/world-cup-final-pending/`

## Development

Requirements:
- Node.js 20+

Commands:
```sh
npm install
npm run dev
```

Primary validation/build command:
```sh
npm run build
```

`build` runs:
- `npm run lint:tokens`
- `npm run lint:contrast`
- `npm run lint:routes`
- `tsc -b`
- `vite build`

## Scripts

Core app/dev scripts:
- `npm run dev`
- `npm run build`
- `npm run preview`

Data update scripts:
- `npm run update-matches`
- `npm run update-leaderboard`
- `npm run update-snapshots`

Demo simulation scripts:
- `npm run demo:simulate -- --scenario=<scenario> --users=50 --seed=123`
- `npm run demo:simulate:all`

Admin/ops scripts:
- `npm run backfill-member-uids`
- `npm run seed:prod`

## Local Firebase Emulators

1. Ensure `.env.local` includes:
   - `VITE_USE_FIREBASE_EMULATORS=true`
   - `VITE_FIREBASE_EMULATOR_HOST=127.0.0.1`
   - `VITE_FIREBASE_AUTH_EMULATOR_PORT=9099`
   - `VITE_FIRESTORE_EMULATOR_PORT=8080`
2. Start emulators:
   ```sh
   firebase emulators:start
   ```
3. Seed emulator data:
   ```sh
   VITE_USE_FIREBASE_EMULATORS=true FIREBASE_PROJECT_ID=demo-wc-predictions node scripts/seedEmulators.js
   ```
4. Run app:
   ```sh
   npm run dev
   ```

## Firebase Setup (Production)

1. Create Firebase project and web app.
2. Enable Google sign-in.
3. Create Firestore.
4. Apply `firestore.rules`.
5. Seed member docs at `leagues/{leagueId}/members/{email}`.
6. Configure `.env` values from `.env.example`.

## GitHub Actions Configuration

Set in GitHub `Settings -> Secrets and variables -> Actions`.

Secret:
- `FOOTBALL_DATA_TOKEN`

Variables:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_LEAGUE_ID`

Workflows:
- `.github/workflows/update-matches.yml` refreshes `matches.json` and `leaderboard.json`
- `.github/workflows/deploy-pages.yml` builds and deploys to GitHub Pages

## Seed Production Firestore

Run locally only, with service-account credentials:

```sh
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/.secrets/firebase-adminsdk.json"
export FIREBASE_PROJECT_ID="your-project-id"
export LEAGUE_ID="default"
npm run seed:prod
```

## Match/Leaderboard Data Refresh

- Update fixtures/results:
  ```sh
  npm run update-matches
  ```
- Rebuild leaderboard snapshot:
  ```sh
  npm run update-leaderboard
  ```
- Run both:
  ```sh
  npm run update-snapshots
  ```

## Demo Simulation Examples

```sh
npm run demo:simulate -- --scenario=pre-group --users=50 --seed=101
npm run demo:simulate -- --scenario=mid-group --users=50 --seed=202
npm run demo:simulate -- --scenario=end-group-draw-confirmed --users=50 --seed=303
npm run demo:simulate -- --scenario=mid-knockout --users=50 --seed=404
npm run demo:simulate -- --scenario=world-cup-final-pending --users=50 --seed=505
npm run demo:simulate:all
```

## Deployment

GitHub Pages deploy runs automatically on pushes to `main` via `.github/workflows/deploy-pages.yml`.
