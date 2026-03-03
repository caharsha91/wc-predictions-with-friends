# WC Predictions Audit (Code + Screenshot Based)

## Evidence labels
- **Confirmed in code**: directly verified from repository code/data.
- **Suggested by UI**: visible in screenshots/UI copy.
- **Inferred**: likely behavior from combining code + UI.
- **Ambiguous**: cannot be confirmed from current repo alone.
- **Confirmed by product owner**: directly provided by project owner for this audit update.

## 1) What the app appears to do
- **Confirmed in code:** A private World Cup league app where invited members make three kinds of predictions and compete on a leaderboard: match scores, group outcomes (including best third-place qualifiers), and knockout bracket winners (`README.md`, routes in `src/ui/App.tsx`).
- **Confirmed in code:** It supports two data modes:
  - default mode (live users + snapshot files + optional Firebase writes)
  - demo mode (scenario snapshots + viewer switching) (`src/lib/data.ts`, `src/ui/pages/DemoControlsPage.tsx`).
- **Suggested by UI:** Main user loop is “Play Center -> make picks -> track rivals -> see leaderboard momentum”, with admin pages for players/exports/demo controls.

## 2) Main workflows, entities, and rules

### Core entities
- **Member**: id/email/name/admin/favoriteTeam/rivals/theme (`src/types/members.ts`).
- **Match**: stage, kickoff, teams, result/winner (`src/types/matches.ts`).
- **Pick**: per-match prediction with scores + legacy fields (`src/types/picks.ts`).
- **Bracket predictions**:
  - group-stage doc: group rankings + best-thirds
  - knockout doc: winner picks by stage (`src/types/bracket.ts`).
- **Leaderboard entry**: total and point breakdown + tie-break timestamp (`src/types/leaderboard.ts`).

### Main workflows
1. **Play Center** summarizes pending actions and rival standings (`src/ui/pages/LandingPage.tsx`).
2. **Group Stage**: rank each group and choose 8 best-third qualifiers (`src/ui/pages/GroupStagePage.tsx`, `src/ui/lib/groupStageBestThirdSelection.ts`).
3. **Match Picks**: enter scorelines; knockout draws require winner + AET/PEN (`src/ui/pages/PicksPage.tsx`).
4. **Knockout Bracket**: choose winners round-by-round (`src/ui/pages/BracketPage.tsx`).
5. **Leaderboard**: snapshot standings + social badges + rival focus (`src/ui/pages/LeaderboardPage.tsx`).
6. **Admin**: roster management, exports, demo controls (`src/ui/pages/AdminUsersPage.tsx`, `src/ui/pages/AdminExportsPage.tsx`, `src/ui/pages/DemoControlsPage.tsx`).

### Rules implemented
- **Scoring config** is data-driven from `public/data/scoring.json`.
- **Group lock**: 30 min before first group kickoff (frontend derives from fixtures; rules also hard-code a UTC date) (`src/lib/tournamentDeadlines.ts`, `firestore.rules`).
- **Match picks editability**: shared 48-hour window model on scheduled matches (`src/ui/lib/matchTimeline.ts`).
- **KO bracket editability**: phase-driven (`src/ui/lib/tournamentPhase.ts`).
- **Rival list**: max 3 (`firestore.rules`, profile normalization code).

## 3) Most important risk areas

### A. Fairness-critical writes are not strongly server-validated (**High**) 
- **Confirmed in code:** Firestore write rules for `picks` and `bracket-knockout` only enforce self-doc identity, not per-match lock/deadline/content integrity (`firestore.rules` lines 109-115, 126-132).
- **Confirmed in code:** Client still sends and stores mutable fields like `createdAt`, `outcome`, `winner` (`src/lib/firestoreData.ts`, `src/lib/picks.ts`).
- **Inferred:** A direct client write can bypass frontend lock UX and manipulate fairness-sensitive fields.

### B. Scoring trusts legacy fields that can disagree with scores (**High**) 
- **Confirmed in code:** `getPickOutcome` prefers `pick.outcome` over derived score outcome (`src/lib/picks.ts` lines 87-93).
- **Confirmed in code:** scoring uses `getPickOutcome` for result points (`src/lib/scoring.ts` lines 40-46).
- **Confirmed in code:** code comment claims scores/advances are source of truth, but scorer still prioritizes legacy outcome (`src/lib/picks.ts` line 148).
- **Inferred:** inconsistent payloads can produce points that do not match displayed scores.

### C. KO-open phase logic likely mismatched to fixture schema (**High**) 
- **Confirmed in code:** KO draw signal expects either `stage==='KO' && round==='R32'` or `knockoutRoundIndex===0` plus `homeTeamId/awayTeamId` (`src/ui/lib/tournamentPhase.ts` lines 157-190).
- **Confirmed in code:** match ingest writes stages as `R32/R16/...` and does not populate those fields (`scripts/updateMatches.js`).
- **Confirmed in data:** `public/data/matches.json` knockout rows have null `round/knockoutRoundIndex/homeTeamId/awayTeamId`.
- **Inferred:** in default mode, KO may stay closed unless manually overridden by another source.

### D. UI rule copy vs actual enforcement mismatch on match lock semantics (**Medium-High**) 
- **Suggested by UI:** “Picks stay editable until each match lock.” (`LandingPage` rules text).
- **Confirmed in code:** Match Picks page uses 48-hour shared window, not strictly per-match lock (`src/ui/lib/matchTimeline.ts`, `src/ui/pages/PicksPage.tsx`).
- **Confirmed by product owner:** shared 48-hour style window is intentional product policy to avoid overloading picks actions.
- **Inferred:** users may perceive lock behavior as inconsistent/unfair.

### E. Member ID mutability can break identity consistency (**Medium**) 
- **Confirmed in code:** Admin can edit `members/{email}.id` (core identity) with no uniqueness validation (`src/ui/pages/AdminUsersPage.tsx`).
- **Confirmed in code:** member id is used to authorize/read picks and bracket docs (`firestore.rules` selfMemberId checks).
- **Inferred:** duplicate or changed IDs can orphan or misattribute predictions.

### F. Some social/projection features silently degrade by permissions (**Medium**) 
- **Confirmed in code:** non-admin permission-denied on list calls returns empty projected group predictions (`src/ui/hooks/usePublishedSnapshot.ts` lines 85-119).
- **Confirmed in code:** leaderboard social badges require listing all picks; failure falls back to empty badges (`src/ui/pages/LeaderboardPage.tsx` lines 445-463, 497-500).
- **Inferred:** users see “less social” UI without clear reason.

### G. Snapshot pipeline is GitHub Actions driven by policy (**Medium**) 
- **Confirmed in code:** `updateLeaderboard` uses Firestore only if service-account credentials file/env exist (`scripts/updateLeaderboard.ts` lines 137-170).
- **Confirmed in CI:** scheduled workflow runs `update-matches` and `update-leaderboard`, then commits `public/data/matches.json` and `public/data/leaderboard.json` (`.github/workflows/update-matches.yml`).
- **Confirmed by product owner:** production updates are expected to flow from `matches.json` updates via GitHub Actions.
- **Inferred:** freshness and scoring visibility depend on workflow cadence and successful runs, not guaranteed continuous Firestore-backed recompute.

## 4) Audit dimensions that matter for this product
1. **Scoring integrity and anti-cheat controls**
2. **Tournament phase/lock correctness**
3. **Identity/data consistency (member IDs, ownership, tie-breaks)**
4. **UX clarity and cross-screen consistency**
5. **Social engagement quality (rivals, badges, momentum loops)**
6. **Operational snapshot reliability (freshness + source-of-truth transparency)**

## 5) Checks and metrics per dimension

### 1. Scoring integrity and anti-cheat
- Checks:
  - Reject writes for locked matches and locked knockout rounds at server layer.
  - Recompute outcome/winner from scores on server; ignore client legacy outcome fields.
  - Enforce one pick per (userId, matchId).
  - Enforce immutable `createdAt` after first write.
- Metrics:
  - `malicious_write_rejection_rate` (target 100% in test harness).
  - `score_recompute_delta_count` between trusted recompute and published leaderboard (target 0).

### 2. Tournament phase/lock correctness
- Checks:
  - Verify KO-open transition with real fixture schema.
  - Ensure “lock” copy matches actual editability logic.
  - Ensure phase lock flags are actually consumed where intended.
- Metrics:
  - `phase_transition_accuracy` across simulated timeline (target 100%).
  - `copy_vs_behavior_mismatch_count` (target 0).

### 3. Identity/data consistency
- Checks:
  - Enforce unique immutable member IDs or managed migration flow.
  - Validate pick doc payload user IDs against path/canonical identity.
  - Prevent orphaned docs after member ID changes.
- Metrics:
  - `duplicate_member_id_count` (target 0).
  - `orphan_prediction_docs_count` (target 0).

### 4. UX clarity and consistency
- Checks:
  - Compare lock indicators across Play Center, Match Picks, Group Stage, Bracket.
  - Validate ordering of upcoming matches by urgency.
  - Explicitly message when data is hidden/unavailable due permissions.
- Metrics:
  - `critical_flow_confusion_events` (qualitative usability test).
  - `time_to_next_action` median from Play Center.

### 5. Social engagement quality
- Checks:
  - Validate rival selection persistence and identity matching reliability.
  - Ensure badges and momentum always have explainable source states.
  - Confirm social hooks are available to non-admin users.
- Metrics:
  - `weekly_active_rival_sets` (users with 1-3 rivals).
  - `badge_visibility_rate` by role.
  - `return_rate_after_snapshot`.

### 6. Snapshot reliability
- Checks:
  - Verify leaderboard build inputs (Firestore vs static files) in production path.
  - Publish snapshot provenance (source + timestamp + job run id).
- Metrics:
  - `snapshot_staleness_minutes`.
  - `snapshot_source_confidence` (binary: verified/not).

## 6) Simple audit checklist / scorecard

| Dimension | Current signal | Evidence status |
|---|---|---|
| Scoring integrity & anti-cheat | **Red** | Outcome precedence + permissive write rules create manipulation surface. |
| Phase/lock correctness | **Red** | KO-open detection likely incompatible with current match schema. |
| Identity/data consistency | **Yellow** | Admin member ID edits can break canonical mapping. |
| UX consistency | **Yellow** | Lock messaging and behavior differ across screens. |
| Social engagement | **Yellow** | Good rival/badge concepts; degraded by permission-based empty fallbacks. |
| Snapshot reliability | **Yellow** | GitHub Actions builds snapshots from repo data; reliability depends on schedule and job success. |

## 7) Main unknowns and best order for full audit

### Main unknowns (resolved March 1, 2026)
- **Resolved (product owner):** deployed Firestore rules match `firestore.rules` in the repo.
- **Resolved (code + product owner):** production `leaderboard.json` updates via GitHub Actions (`.github/workflows/update-matches.yml`).
- **Resolved (product owner):** shared match-picks edit window is intentional product policy to avoid overloading picks actions.
- **Resolved (product owner):** simplified group tie-break (`PTS/GD/GF/alpha`) is accepted league policy for this hobby project as long as fairness is maintained.
- **Resolved (product owner):** behavior should update from `matches.json`, which is refreshed through GitHub Actions.

### Best order for full audit
1. **Trust first:** validate server-side anti-cheat controls and scoring invariants.
2. **Phase/lock:** run timeline simulations to verify lock and KO-open transitions.
3. **Identity integrity:** test member ID change scenarios and doc ownership consistency.
4. **UX walkthrough:** cross-screen consistency pass on lock language, status labels, and ordering.
5. **Social loops:** verify non-admin experience for rivals/badges/projected context.
6. **Ops path:** verify snapshot provenance and freshness end-to-end.

## Concrete product improvements

### Improve fun, social energy, repeat engagement
- Add a **“Rival Roundup” card** after each snapshot: who gained/lost rank and by how much.
- Add **low-friction streaks** (e.g., “3 straight correct outcomes”) and weekly callouts.
- Add **friendly micro-challenges** (contrarian pick of the day, exact-score bounty) with visible badges.
- Add **lock reminders** tied to each user’s pending picks in next 24h.

### Improve trust and fairness (scoring + cheating)
- Move fairness logic to trusted backend layer (rules + server recompute):
  - enforce match/round deadlines server-side,
  - ignore client `outcome/winner` for scoring,
  - freeze picks per match after lock,
  - enforce one pick per user+match.
- Add **audit trail** per pick (`submittedAt`, `lastEditedAt`, pre/post-lock flags) and expose in admin export.
- Add a **public rule explainer** with exact tie-break and lock semantics to reduce disputes.

### Improve UX ease and satisfaction
- Align all copy to one lock model (either per-match lock or shared window) and show exact window boundaries.
- In Match Picks, sort upcoming by **nearest lock first**.
- In KO page, show a **readiness checklist** (fixtures present, pairings confirmed, phase state) when locked.
- Replace silent empty fallbacks with explicit notices (e.g., “Projected comparison unavailable for this role”).

## 8) Full audit completion (March 1, 2026)

### Audit scope executed
- **Code review completed:** Firestore rules, core scoring logic, phase/lock engine, identity/admin flows, data hooks, and UI consistency paths.
- **Ops review completed:** GitHub Actions workflows and leaderboard build script.
- **Data integrity checks completed:** `public/data/matches.json`, `picks.json`, `members.json`, `leaderboard.json`, bracket files.
- **Build verification completed:** `npm run build` passed; no TypeScript or lint guard failures.

### Findings (ordered by severity)

#### High-1: Server rules do not enforce fair-write invariants for picks/knockout
- **Evidence:** `firestore.rules:112-115` and `firestore.rules:129-131` only validate membership + `userId`; they do not validate lock windows, per-match immutability, or pick content integrity.
- **Evidence:** client sends mutable pick metadata (`createdAt`, `outcome`, `winner`) in `src/lib/firestoreData.ts:34-47` and persists with merge at `src/lib/firestoreData.ts:65-69`.
- **Impact:** a direct client write can bypass front-end lock UX and mutate fairness-critical state.

#### High-2: Scoring and tiebreak trust mutable legacy fields
- **Evidence:** `src/lib/picks.ts:87-93` prefers stored `pick.outcome` over derived score outcome.
- **Evidence:** scorer uses that path in `src/lib/scoring.ts:40-46`.
- **Evidence:** leaderboard tie-break uses `pick.createdAt` (`src/lib/scoring.ts:161-168`), while rules do not enforce immutability.
- **Data evidence:** current `public/data/picks.json` contains outcome mismatches (2 picks where stored outcome != score-derived outcome).
- **Impact:** scoring/tie order can diverge from visible scorelines if payloads are inconsistent or manipulated.

#### High-3: KO-open signal is incompatible with current ingest schema
- **Evidence:** KO signal requires R32 + populated team IDs (`src/ui/lib/tournamentPhase.ts:157-190`).
- **Evidence:** ingest does not write `round`, `knockoutRoundIndex`, `homeTeamId`, `awayTeamId` (`scripts/updateMatches.js:81-107`).
- **Data evidence:** in current snapshot, opening 16 R32 fixtures have `homeTeamId/awayTeamId = null`.
- **Runtime evidence:** `computeKoDrawConfirmedSignal` evaluates false with current `matches.json`.
- **Impact:** bracket availability depends on data fields that are never produced by the current pipeline.

#### Medium-1: Member identity can be changed without uniqueness/migration safeguards
- **Evidence:** admin can edit `members/{email}.id` (`src/ui/pages/AdminUsersPage.tsx:166-188`), with no uniqueness/orphan checks.
- **Evidence:** picks/bracket docs are keyed by member ID (`firestore.rules:109-132` and canonical ID resolution in `usePicksData`/`useBracketKnockoutData`).
- **Impact:** ID edits can strand historical docs or split identity history across IDs.

#### Medium-2: Social/projection features silently degrade for non-admin users
- **Evidence:** permission-denied on projected group list returns `[]` in `src/ui/hooks/usePublishedSnapshot.ts:107-117`.
- **Evidence:** leaderboard picks list failures silently fallback to empty social input in `src/ui/pages/LeaderboardPage.tsx:445-463`.
- **Impact:** users get reduced social context with limited explanation.

#### Medium-3: Upcoming match ordering is reverse-urgency
- **Evidence:** upcoming timeline uses descending sort (`src/ui/lib/matchTimeline.ts:149-151`, `src/ui/lib/matchTimeline.ts:221`).
- **Impact:** farthest upcoming fixtures appear before nearest locks, increasing action friction.

#### Medium-4: Leaderboard snapshot timestamp tracks match refresh time, not leaderboard generation time
- **Evidence:** output timestamp is copied from matches file (`scripts/updateLeaderboard.ts:341`) rather than generation clock.
- **Impact:** snapshot freshness messaging can underreport/obscure when leaderboard was rebuilt.

#### Low-1: Group-stage lock deadline is duplicated and hard-coded in rules
- **Evidence:** hard-coded date in rules (`firestore.rules:90-93`) while frontend derives from fixture data (`src/lib/tournamentDeadlines.ts:26-36`).
- **Impact:** future tournament/date changes require multi-place updates and increase drift risk.

#### Low-2: Bundle size warning
- **Evidence:** build emits >500 kB chunk warning.
- **Impact:** potential slower first load on weaker devices/networks.

### Accepted policy decisions (captured)
- **Accepted:** 48-hour shared match-picks edit window is intentional policy to reduce overload.
- **Accepted:** simplified group tie-break (`PTS/GD/GF/alpha`) is acceptable for this hobby league.
- **Accepted:** snapshot update source of truth is GitHub Actions updating `matches.json` and rebuilding snapshots.
- **Confirmed:** deployed Firestore rules match repository rules.

## 9) Quantitative check results
- `npm run build`: **pass**
- Data snapshot checks:
  - `matches`: 104
  - `group matches`: 72 across 12 groups, currently 0 groups complete
  - `knockout matches`: 32, opening R32 matches: 16, with populated `homeTeamId/awayTeamId`: 0
  - `members`: 7
  - `leaderboard entries`: 7
  - `picks docs`: 1, total picks: 2
  - picks with legacy outcome mismatch vs scoreline: 2
  - picks with unknown match IDs: 0
  - bracket/leaderboard users missing from `members.json`: 0

## 10) Prioritized remediation order (post-audit)
1. **Fair-write protections first (High):**
   - enforce server-side lock checks for picks and knockout docs,
   - enforce immutable `createdAt` and one pick per user+match,
   - reject/strip client legacy scoring fields (`outcome`, `winner`) on trusted path.
2. **Scoring determinism (High):**
   - derive outcome/winner from score/advances only in scorer,
   - add invariant tests covering mismatch payloads and tie-break behavior.
3. **KO draw compatibility (High):**
   - either update ingest to populate required KO confirmation fields,
   - or update `computeKoDrawConfirmedSignal` to use the current fixture schema.
4. **Identity safety (Medium):**
   - add uniqueness checks and migration handling for member ID edits.
5. **UX and transparency (Medium):**
   - make social/projection permission limits explicit in UI,
   - sort upcoming picks by nearest lock first,
   - clarify snapshot timestamp semantics (publish + build time).
6. **Config hardening (Low):**
   - move rules deadline to centralized config process for future tournaments.

## 11) Remediation implementation status (March 2, 2026)

### Implemented in code
- **Fair-write protections (partial):**
  - Added Firestore schema validation for picks, group bracket, and knockout bracket docs.
  - Added knockout server lock check before first KO kickoff.
  - Enforced canonical `userId` and per-match deduplication in pick persistence path.
- **Scoring determinism:**
  - Scoring paths now derive outcome/winner from scores/advances first and only use legacy fields as fallback when scores are absent.
  - Removed mutable submission-time tie-break from leaderboard sorting.
- **KO draw compatibility:**
  - Updated KO-open detection to recognize current fixture schema (`stage: R32`) and resolved team placeholders.
  - Updated match ingest to emit KO metadata (`round`, `knockoutRoundIndex`, `homeTeamId`, `awayTeamId`).
- **Identity safety:**
  - Added duplicate member ID validation in admin flow.
  - Locked member ID edits for existing users to prevent orphaned prediction docs.
- **UX/transparency:**
  - Upcoming fixtures are now ordered by nearest lock first.
  - Added explicit UI warnings when projected comparisons/social badges are limited by permissions.
  - Updated rules copy to match intentional rolling 48-hour picks window.
  - Leaderboard snapshot `lastUpdated` now reflects leaderboard generation time.

### Residual risk / follow-up
- **Still open (architecture-level):** full server-side per-match pick lock enforcement and strict immutable per-pick fields are not fully enforceable with the current single-document list model for picks.
- **Recommended next step:** migrate picks to per-match documents (or move write/scoring to trusted backend functions) to enforce deadlines and immutability at rule/backend level.

### Verification
- `npm run build`: **pass** (token/contrast/route guards, TypeScript build, Vite build).
