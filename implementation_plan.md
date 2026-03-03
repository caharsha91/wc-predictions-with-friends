## Residual Risk Follow-Up Plan: Trusted Match Pick Writes + One-Shot Cutover

### Summary
This plan removes the remaining fairness gap by moving match-pick writes to a trusted callable backend, storing one immutable record per `(userId, matchId)`, and validating editability against trusted fixtures synced into Firestore. It uses a one-shot cutover, with pre-cutover migration and verification to avoid data loss.

### Locked Decisions
1. Enforcement model: `Callable backend`.
2. Rollout model: `One-shot cutover`.
3. History model: `Immutable createdAt + mutable updatedAt only` (no revision log).
4. Trusted fixture source: `Firestore fixtures synced from matches.json`.

### Scope
1. Replace client direct writes to `leagues/{leagueId}/picks/{userId}` with callable function writes.
2. Migrate pick storage from array-per-user docs to per-match docs.
3. Keep read access in app/admin/export/leaderboard from new per-match model.
4. Keep legacy docs for rollback reference only; disable legacy client writes.

### Data Model (New)
1. Trusted fixtures collection:
   `leagues/{leagueId}/fixtures/{matchId}`
   Fields: `leagueId`, `matchId`, `kickoffUtc`, `status`, `stage`, `updatedAt`.
2. Match picks collection:
   `leagues/{leagueId}/picks/{userId}/match-picks/{matchId}`
   Fields: `leagueId`, `userId`, `matchId`, `homeScore`, `awayScore`, `advances?`, `decidedBy?`, `createdAt`, `updatedAt`, `submittedByUid`, `submittedByEmail`.
3. Legacy docs retained read-only:
   `leagues/{leagueId}/picks/{userId}` with historical `picks[]`.

### Public/Interface Changes
1. New callable API `submitMatchPick` (Firebase Functions, region `us-central1`).
2. Input schema:
   `{ matchId: string, homeScore: number, awayScore: number, advances?: 'HOME'|'AWAY'|null, decidedBy?: 'ET'|'PENS'|null }`.
3. Output schema:
   `{ pick: { userId, matchId, homeScore, awayScore, advances?, decidedBy?, createdAt, updatedAt }, window: { anchorUtc, endUtc, source } }`.
4. Error contract:
   `permission-denied`, `invalid-argument`, `failed-precondition`, `not-found`.
5. Frontend hook contract change in [usePicksData.ts](/Users/harshacopparam/Code/wc-predictions-with-friends/src/ui/hooks/usePicksData.ts):
   expose `savePick(matchId, payload)` instead of bulk `savePicks(nextPicks)`.

### Enforcement Logic (Server)
1. AuthN/AuthZ: require signed-in user; resolve canonical member ID from `members/{email}`.
2. Validate payload: non-negative integers for scores; knockout draw requires both `advances` and `decidedBy`; group-stage ignores knockout extras.
3. Build editable window from trusted fixtures using current rolling 48h policy (same semantics as [matchTimeline.ts](/Users/harshacopparam/Code/wc-predictions-with-friends/src/ui/lib/matchTimeline.ts)).
4. Reject writes when target match is not `SCHEDULED`, missing fixture, outside window, or kickoff already passed.
5. Transactional write to per-match doc:
   preserve existing `createdAt` if doc exists; always update `updatedAt`; enforce one doc per user+match.

### Firestore Rules Changes
1. Deny direct client writes to both:
   `leagues/{leagueId}/picks/{userId}` and `.../match-picks/{matchId}`.
2. Allow reads:
   self or admin on user pick docs/subcollection.
3. Keep admin list access for export/social features.
4. Keep bracket/group rules as currently remediated.

### Client/Script Changes
1. Frontend write path:
   [PicksPage.tsx](/Users/harshacopparam/Code/wc-predictions-with-friends/src/ui/pages/PicksPage.tsx) calls callable per save action.
2. Frontend read path:
   query `leagues/{leagueId}/picks/{userId}/match-picks` for current user.
3. Admin/social reads:
   switch to `collectionGroup('match-picks')` filtered by `leagueId`.
   Update [LeaderboardPage.tsx](/Users/harshacopparam/Code/wc-predictions-with-friends/src/ui/pages/LeaderboardPage.tsx), [AdminExportsPage.tsx](/Users/harshacopparam/Code/wc-predictions-with-friends/src/ui/pages/AdminExportsPage.tsx), and [socialBadges.ts](/Users/harshacopparam/Code/wc-predictions-with-friends/src/ui/lib/socialBadges.ts) shaping logic.
4. Leaderboard builder:
   update [updateLeaderboard.ts](/Users/harshacopparam/Code/wc-predictions-with-friends/scripts/updateLeaderboard.ts) Firestore source loader to read `collectionGroup('match-picks')` and regroup by user.
5. Fixture sync:
   add `scripts/syncFixturesToFirestore.ts` and call it from `.github/workflows/update-matches.yml` after `update-matches`.

### One-Shot Cutover Runbook
1. Deploy callable backend and fixture sync script first (rules unchanged yet).
2. Run fixture sync once for production league.
3. Run migration dry-run from legacy picks array docs to per-match docs.
4. Run migration apply.
5. Run verification script; require zero mismatches before proceeding.
6. Deploy frontend that reads/writes new model.
7. Immediately deploy strict rules denying all direct picks writes.
8. Monitor function errors and write success for 24 hours.
9. Keep legacy docs untouched for rollback window; no client writes allowed.

### Migration + Verification
1. Add `scripts/migrateLegacyPicksToMatchPicks.ts` with `--dry-run` and `--apply`.
2. Add `scripts/verifyMatchPicksCutover.ts` that compares normalized legacy vs new `(userId, matchId)` records.
3. Migration correctness rule:
   latest `updatedAt` wins per duplicate `matchId`; preserve earliest existing `createdAt` when present.

### Test Cases and Acceptance Criteria
1. Auth/member guard: non-member cannot save picks.
2. Lock enforcement: write outside rolling window fails with `failed-precondition`.
3. Kickoff enforcement: write after kickoff fails.
4. Knockout validation: draw without winner/method fails with `invalid-argument`.
5. Immutability: second save to same match keeps original `createdAt`.
6. Uniqueness: only one doc exists per `(userId, matchId)`.
7. Rule hardening: direct client `setDoc` to picks paths is denied.
8. Data parity: migration verifier reports `0` mismatches.
9. Build/quality: `npm run build` passes.
10. Ops path: update workflow successfully syncs fixtures and still updates `matches.json` + `leaderboard.json`.

### Rollback Plan
1. Re-enable previous frontend build and temporary permissive picks rules only if critical outage occurs.
2. Run reverse migration script from new per-match docs back to legacy array docs if rollback exceeds brief window.
3. Keep legacy docs unchanged until stability window ends to make rollback deterministic.

### Assumptions and Defaults
1. League remains single-tenant by `VITE_LEAGUE_ID`/`LEAGUE_ID`.
2. Existing rolling 48-hour policy is preserved exactly.
3. Scores are integers `>= 0`; server normalizes and rejects invalid shapes.
4. Legacy `outcome/winner` remain compatibility-only and are not trusted for writes.
5. No revision history table is added in this phase.
