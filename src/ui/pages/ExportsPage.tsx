import { useEffect, useMemo, useState } from 'react'

import {
  fetchBestThirdQualifiers,
  fetchBracketPredictions,
  fetchLeaderboard,
  fetchMatches,
  fetchMembers,
  fetchPicks
} from '../../lib/data'
import {
  fetchUserBracketGroupDoc,
  fetchUserBracketKnockoutDoc,
  fetchUserPicksDoc,
  saveUserBracketGroupDoc,
  saveUserBracketKnockoutDoc,
  saveUserPicksDoc
} from '../../lib/firestoreData'
import { hasFirebase } from '../../lib/firebase'
import {
  buildGroupStandingsSnapshot,
  type CsvValue,
  downloadCsv,
  formatExportFilename,
  resolveBestThirdQualifiers
} from '../../lib/exports'
import {
  combineBracketPredictions,
  hasBracketData,
  loadLocalBracketPrediction,
  saveLocalBracketPrediction
} from '../../lib/bracket'
import { getDateKeyInTimeZone, PACIFIC_TIME_ZONE } from '../../lib/matches'
import {
  flattenPicksFile,
  getOutcomeFromScores,
  getUserPicksFromFile,
  loadLocalPicks,
  mergePicks,
  saveLocalPicks
} from '../../lib/picks'
import type { BracketPrediction } from '../../types/bracket'
import type { LeaderboardEntry } from '../../types/leaderboard'
import type { Member } from '../../types/members'
import type { Match, MatchWinner } from '../../types/matches'
import type { Pick } from '../../types/picks'
import { useAuthState } from '../hooks/useAuthState'
import { useViewerId } from '../hooks/useViewerId'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      matches: Match[]
      members: Member[]
      picks: Pick[]
      predictions: BracketPrediction[]
      bestThirdQualifiers: string[]
      leaderboard: LeaderboardEntry[]
      lastUpdated: string
    }

function formatUpdatedAt(iso: string) {
  const date = new Date(iso)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatMatchdayLabel(dateKey: string | null) {
  if (!dateKey) return 'No finished matchdays yet'
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    month: 'short',
    day: 'numeric'
  }).format(date)
  return `Matchday ${formatted}`
}

function getLatestDateKey(matches: Match[]) {
  let latest: string | null = null
  for (const match of matches) {
    const key = getDateKeyInTimeZone(match.kickoffUtc, PACIFIC_TIME_ZONE)
    if (!latest || key > latest) {
      latest = key
    }
  }
  return latest
}

export function ExportsPanel({ embedded = false }: { embedded?: boolean }) {
  const userId = useViewerId()
  const authState = useAuthState()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [exportMatchScope, setExportMatchScope] = useState<'finished' | 'latest-day'>('finished')
  const firestoreEnabled = hasFirebase && authState.status === 'ready' && !!authState.user

  useEffect(() => {
    let canceled = false
    async function load() {
      if (hasFirebase && authState.status === 'loading') return
      setState({ status: 'loading' })
      try {
        const [
          matchesFile,
          membersFile,
          picksFile,
          bracketFile,
          bestThirdFile,
          leaderboardFile
        ] = await Promise.all([
          fetchMatches(),
          fetchMembers(),
          fetchPicks(),
          fetchBracketPredictions(),
          fetchBestThirdQualifiers(),
          fetchLeaderboard()
        ])
        if (canceled) return
        const allPicks = flattenPicksFile(picksFile)
        const basePredictions = combineBracketPredictions(bracketFile)

        let viewerPicks: Pick[] | null = null
        if (firestoreEnabled) {
          const remote = await fetchUserPicksDoc(userId)
          if (remote !== null) {
            viewerPicks = remote
            saveLocalPicks(userId, remote)
          }
        }

        if (viewerPicks === null) {
          const localPicks = loadLocalPicks(userId)
          if (localPicks.length > 0) {
            viewerPicks = localPicks
          } else {
            viewerPicks = getUserPicksFromFile(picksFile, userId)
          }
          if (firestoreEnabled && viewerPicks.length > 0) {
            try {
              await saveUserPicksDoc(userId, viewerPicks)
            } catch {
              // Ignore Firestore write failures for local-only usage.
            }
          }
        }

        const mergedPicks = mergePicks(allPicks, viewerPicks ?? [], userId)
        const localBracket = loadLocalBracketPrediction(userId)
        const localReady = localBracket ? hasBracketData(localBracket) : false
        const basePrediction =
          basePredictions.find((prediction) => prediction.userId === userId) ?? null
        let viewerPrediction: BracketPrediction | null = localReady ? localBracket : basePrediction

        if (firestoreEnabled) {
          const [groupDoc, knockoutDoc] = await Promise.all([
            fetchUserBracketGroupDoc(userId),
            fetchUserBracketKnockoutDoc(userId)
          ])
          const hasRemote = !!groupDoc || !!knockoutDoc
          if (hasRemote) {
            const now = new Date().toISOString()
            const fallback: BracketPrediction = viewerPrediction ?? {
              id: `bracket-${userId}`,
              userId,
              groups: {},
              bestThirds: [],
              knockout: {},
              createdAt: now,
              updatedAt: now
            }
            viewerPrediction = {
              ...fallback,
              groups: groupDoc?.groups ?? fallback.groups,
              bestThirds: groupDoc?.bestThirds ?? fallback.bestThirds,
              knockout: knockoutDoc ?? fallback.knockout,
              updatedAt: now
            }
            saveLocalBracketPrediction(userId, viewerPrediction)
          } else if (viewerPrediction && hasBracketData(viewerPrediction)) {
            try {
              await Promise.all([
                saveUserBracketGroupDoc(
                  userId,
                  viewerPrediction.groups ?? {},
                  viewerPrediction.bestThirds
                ),
                saveUserBracketKnockoutDoc(userId, viewerPrediction.knockout)
              ])
            } catch {
              // Ignore Firestore write failures for local-only usage.
            }
          }
        }

        const mergedBrackets = viewerPrediction
          ? [
              ...basePredictions.filter((prediction) => prediction.userId !== userId),
              viewerPrediction
            ]
          : basePredictions

        setState({
          status: 'ready',
          matches: matchesFile.matches,
          members: membersFile.members,
          picks: mergedPicks,
          predictions: mergedBrackets,
          bestThirdQualifiers: bestThirdFile.qualifiers,
          leaderboard: leaderboardFile.entries,
          lastUpdated: matchesFile.lastUpdated
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (!canceled) setState({ status: 'error', message })
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [authState.status, firestoreEnabled, userId])

  const finishedMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.matches.filter((match) => match.status === 'FINISHED')
  }, [state])

  const finishedGroupMatches = useMemo(() => {
    return finishedMatches.filter((match) => match.stage === 'Group')
  }, [finishedMatches])

  const finishedKnockoutMatches = useMemo(() => {
    return finishedMatches.filter((match) => match.stage !== 'Group')
  }, [finishedMatches])

  const latestFinishedDateKey = useMemo(
    () => getLatestDateKey(finishedMatches),
    [finishedMatches]
  )

  const latestGroupDateKey = useMemo(
    () => getLatestDateKey(finishedGroupMatches),
    [finishedGroupMatches]
  )

  const latestKnockoutDateKey = useMemo(
    () => getLatestDateKey(finishedKnockoutMatches),
    [finishedKnockoutMatches]
  )

  const pickMatchIds = useMemo(() => {
    if (exportMatchScope === 'latest-day') {
      return new Set(
        finishedMatches
          .filter(
            (match) =>
              latestFinishedDateKey &&
              getDateKeyInTimeZone(match.kickoffUtc, PACIFIC_TIME_ZONE) ===
                latestFinishedDateKey
          )
          .map((match) => match.id)
      )
    }
    return new Set(finishedMatches.map((match) => match.id))
  }, [exportMatchScope, finishedMatches, latestFinishedDateKey])

  const groupIdsForExport = useMemo(() => {
    if (exportMatchScope === 'latest-day') {
      return new Set(
        finishedGroupMatches
          .filter(
            (match) =>
              latestGroupDateKey &&
              getDateKeyInTimeZone(match.kickoffUtc, PACIFIC_TIME_ZONE) === latestGroupDateKey
          )
          .map((match) => match.group)
          .filter((group): group is string => !!group)
      )
    }
    return new Set(
      finishedGroupMatches.map((match) => match.group).filter((group): group is string => !!group)
    )
  }, [exportMatchScope, finishedGroupMatches, latestGroupDateKey])

  const knockoutMatchIds = useMemo(() => {
    if (exportMatchScope === 'latest-day') {
      return new Set(
        finishedKnockoutMatches
          .filter(
            (match) =>
              latestKnockoutDateKey &&
              getDateKeyInTimeZone(match.kickoffUtc, PACIFIC_TIME_ZONE) ===
                latestKnockoutDateKey
          )
          .map((match) => match.id)
      )
    }
    return new Set(finishedKnockoutMatches.map((match) => match.id))
  }, [exportMatchScope, finishedKnockoutMatches, latestKnockoutDateKey])

  const matchById = useMemo(() => {
    if (state.status !== 'ready') return new Map<string, Match>()
    return new Map(state.matches.map((match) => [match.id, match]))
  }, [state])

  const memberById = useMemo(() => {
    if (state.status !== 'ready') return new Map<string, Member>()
    return new Map(state.members.map((member) => [member.id, member]))
  }, [state])

  const groupStandings = useMemo(() => {
    if (state.status !== 'ready') return new Map()
    return buildGroupStandingsSnapshot(state.matches)
  }, [state])

  const groupComplete = useMemo(() => {
    if (groupStandings.size === 0) return false
    return [...groupStandings.values()].every((summary) => summary.complete)
  }, [groupStandings])

  const leaderboard = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.leaderboard
  }, [state])

  const hasPickExport =
    state.status === 'ready' && state.members.length > 0 && pickMatchIds.size > 0
  const hasGroupExport =
    state.status === 'ready' && state.members.length > 0 && groupIdsForExport.size > 0
  const hasKnockoutExport =
    state.status === 'ready' && state.members.length > 0 && knockoutMatchIds.size > 0
  const hasLeaderboardExport = leaderboard.length > 0

  const latestPickMatchLabel = formatMatchdayLabel(latestFinishedDateKey)
  const latestGroupMatchLabel = latestGroupDateKey
    ? formatMatchdayLabel(latestGroupDateKey)
    : 'No finished group matchdays yet'
  const latestKnockoutMatchLabel = latestKnockoutDateKey
    ? formatMatchdayLabel(latestKnockoutDateKey)
    : 'No finished knockout matchdays yet'
  const finishedMatchCount = finishedMatches.length
  const finishedGroupCount = finishedGroupMatches.length
  const finishedKnockoutCount = finishedKnockoutMatches.length
  const memberCount = state.status === 'ready' ? state.members.length : 0
  const groupStatusLabel = groupComplete ? 'Complete' : 'In progress'

  function handleExportPicks() {
    if (state.status !== 'ready') return
    if (state.members.length === 0 || pickMatchIds.size === 0) return
    const headers = [
      'user_id',
      'user_name',
      'match_id',
      'stage',
      'group',
      'kickoff_utc',
      'home_team',
      'away_team',
      'pick_home_score',
      'pick_away_score',
      'pick_outcome',
      'pick_winner',
      'pick_decided_by',
      'result_home_score',
      'result_away_score',
      'result_winner',
      'result_decided_by'
    ]
    const rows = state.picks
      .filter((pick) => pickMatchIds.has(pick.matchId))
      .map((pick) => {
        const match = matchById.get(pick.matchId)
        const member = memberById.get(pick.userId)
        if (!match) {
          return {
            user_id: pick.userId,
            user_name: member?.name ?? pick.userId,
            match_id: pick.matchId,
            stage: '',
            group: '',
            kickoff_utc: '',
            home_team: '',
            away_team: '',
            pick_home_score: pick.homeScore ?? '',
            pick_away_score: pick.awayScore ?? '',
            pick_outcome: pick.outcome ?? getOutcomeFromScores(pick.homeScore, pick.awayScore) ?? '',
            pick_winner: '',
            pick_decided_by: pick.decidedBy ?? '',
            result_home_score: '',
            result_away_score: '',
            result_winner: '',
            result_decided_by: ''
          }
        }
        const pickOutcome = pick.outcome ?? getOutcomeFromScores(pick.homeScore, pick.awayScore)
        const pickWinner =
          pick.winner === 'HOME'
            ? match.homeTeam.code
            : pick.winner === 'AWAY'
              ? match.awayTeam.code
              : ''
        const resultWinner =
          match.winner === 'HOME'
            ? match.homeTeam.code
            : match.winner === 'AWAY'
              ? match.awayTeam.code
              : ''
        return {
          user_id: pick.userId,
          user_name: member?.name ?? pick.userId,
          match_id: match.id,
          stage: match.stage,
          group: match.group ?? '',
          kickoff_utc: match.kickoffUtc,
          home_team: match.homeTeam.code,
          away_team: match.awayTeam.code,
          pick_home_score: pick.homeScore ?? '',
          pick_away_score: pick.awayScore ?? '',
          pick_outcome: pickOutcome ?? '',
          pick_winner: pickWinner,
          pick_decided_by: pick.decidedBy ?? '',
          result_home_score: match.score?.home ?? '',
          result_away_score: match.score?.away ?? '',
          result_winner: resultWinner,
          result_decided_by: match.decidedBy ?? ''
        }
      })
    downloadCsv(formatExportFilename('picks', exportMatchScope), headers, rows)
  }

  function handleExportGroup() {
    if (state.status !== 'ready') return
    if (state.members.length === 0 || groupIdsForExport.size === 0) return
    const headers = [
      'user_id',
      'user_name',
      'category',
      'group_id',
      'slot',
      'pick',
      'actual',
      'group_complete'
    ]
    const rows: Array<Record<string, CsvValue>> = []
    const actualBestThirds = groupComplete
      ? resolveBestThirdQualifiers(groupStandings, state.bestThirdQualifiers)
      : undefined
    const predictionsByUser = new Map(
      state.predictions.map((prediction) => [prediction.userId, prediction])
    )

    for (const member of state.members) {
      const prediction = predictionsByUser.get(member.id)
      if (!prediction) continue
      for (const [groupId, groupPick] of Object.entries(prediction.groups)) {
        if (!groupIdsForExport.has(groupId)) continue
        const summary = groupStandings.get(groupId)
        const actualFirst = summary?.complete ? summary.standings[0]?.team.code ?? '' : ''
        const actualSecond = summary?.complete ? summary.standings[1]?.team.code ?? '' : ''
        rows.push({
          user_id: member.id,
          user_name: member.name,
          category: 'group',
          group_id: groupId,
          slot: 'first',
          pick: groupPick.first ?? '',
          actual: actualFirst,
          group_complete: summary?.complete ?? false
        })
        rows.push({
          user_id: member.id,
          user_name: member.name,
          category: 'group',
          group_id: groupId,
          slot: 'second',
          pick: groupPick.second ?? '',
          actual: actualSecond,
          group_complete: summary?.complete ?? false
        })
      }

      if (groupComplete && actualBestThirds && actualBestThirds.length > 0) {
        const predictedThirds = prediction.bestThirds ?? []
        predictedThirds.forEach((team, index) => {
          rows.push({
            user_id: member.id,
            user_name: member.name,
            category: 'best_third',
            group_id: '',
            slot: `${index + 1}`,
            pick: team ?? '',
            actual: actualBestThirds[index] ?? '',
            group_complete: true
          })
        })
      }
    }

    downloadCsv(formatExportFilename('bracket-group', exportMatchScope), headers, rows)
  }

  function handleExportKnockout() {
    if (state.status !== 'ready') return
    if (state.members.length === 0 || knockoutMatchIds.size === 0) return
    const headers = [
      'user_id',
      'user_name',
      'stage',
      'match_id',
      'home_team',
      'away_team',
      'pick_winner',
      'result_home_score',
      'result_away_score',
      'result_winner',
      'result_decided_by'
    ]
    const rows: Array<Record<string, CsvValue>> = []
    const predictionsByUser = new Map(
      state.predictions.map((prediction) => [prediction.userId, prediction])
    )

    for (const member of state.members) {
      const prediction = predictionsByUser.get(member.id)
      if (!prediction) continue
      const stageEntries = Object.entries(prediction.knockout ?? {}) as Array<
        [string, Record<string, MatchWinner>]
      >
      for (const [stage, stagePicks] of stageEntries) {
        for (const [matchId, winner] of Object.entries(stagePicks)) {
          if (!knockoutMatchIds.has(matchId)) continue
          const match = matchById.get(matchId)
          if (!match || match.status !== 'FINISHED') continue
          const pickWinner =
            winner === 'HOME'
              ? match.homeTeam.code
              : winner === 'AWAY'
                ? match.awayTeam.code
                : ''
          const resultWinner =
            match.winner === 'HOME'
              ? match.homeTeam.code
              : match.winner === 'AWAY'
                ? match.awayTeam.code
                : ''
          rows.push({
            user_id: member.id,
            user_name: member.name,
            stage,
            match_id: matchId,
            home_team: match.homeTeam.code,
            away_team: match.awayTeam.code,
            pick_winner: pickWinner,
            result_home_score: match.score?.home ?? '',
            result_away_score: match.score?.away ?? '',
            result_winner: resultWinner,
            result_decided_by: match.decidedBy ?? ''
          })
        }
      }
    }

    downloadCsv(formatExportFilename('bracket-knockout', exportMatchScope), headers, rows)
  }

  function handleExportLeaderboard() {
    if (leaderboard.length === 0) return
    const headers = [
      'rank',
      'user_id',
      'user_name',
      'handle',
      'exact_points',
      'outcome_points',
      'knockout_points',
      'bracket_points',
      'total_points'
    ]
    const rows = leaderboard.map((entry, index) => ({
      rank: index + 1,
      user_id: entry.member.id,
      user_name: entry.member.name,
      handle: entry.member.handle ?? '',
      exact_points: entry.exactPoints,
      outcome_points: entry.resultPoints,
      knockout_points: entry.knockoutPoints,
      bracket_points: entry.bracketPoints,
      total_points: entry.totalPoints
    }))
    downloadCsv(formatExportFilename('leaderboard', 'all'), headers, rows)
  }

  return (
    <div className={embedded ? 'stack adminExports' : 'stack'}>
      {!embedded ? (
        <div className="row rowSpaceBetween">
          <div>
            <div className="sectionKicker">Data center</div>
            <h1 className="h1">Exports</h1>
            <div className="pageSubtitle">Download finished-only CSVs for the league.</div>
          </div>
          {state.status === 'ready' ? (
            <div className="lastUpdated">
              <div className="lastUpdatedLabel">Last updated</div>
              <div className="lastUpdatedValue">{formatUpdatedAt(state.lastUpdated)}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {state.status === 'loading' ? <div className="muted">Loading...</div> : null}
      {state.status === 'error' ? <div className="error">{state.message}</div> : null}

      {state.status === 'ready' ? (
        <div className="stack">
          <div className="exportsLayout">
            <section className="card exportsGuide">
              <div className="sectionKicker">Export guide</div>
              <div className="sectionTitle">Finished-only data drops</div>
              <p className="exportsGuideIntro">
                Exports only include finished matches to keep picks private before kickoff. Use
                the match window toggle to share everything completed so far or just the latest
                matchday in each section.
              </p>
              <div className="exportsGuideGrid">
                <div className="exportsGuideBlock">
                  <div className="exportsGuideLabel">What gets exported</div>
                  <ul className="exportsGuideList">
                    <li>Match picks include scores, outcomes, and final results.</li>
                    <li>Group bracket exports include qualifiers and best thirds once groups close.</li>
                    <li>Knockout bracket exports include only finished knockout matches.</li>
                    <li>Leaderboard exports include totals and category breakdowns.</li>
                  </ul>
                </div>
                <div className="exportsGuideBlock exportsGuideCallout">
                  <div className="exportsGuideLabel">Privacy rules</div>
                  <p>
                    Finished-only exports keep user picks hidden until a match is final. Best third
                    picks unlock after the group stage finishes.
                  </p>
                </div>
              </div>
            </section>

            <div className="card exportPanel exportScope">
              <div className="exportHeader">
                <div>
                  <div className="sectionKicker">Export scope</div>
                  <div className="sectionTitle">Match window</div>
                </div>
                <div className="exportMeta">
                  <span className="exportNote">Finished games only</span>
                  <span className="exportBadge">All users</span>
                </div>
              </div>
              <div className="exportControls">
                <div className="exportField">
                  <span className="exportFieldLabel">Match window</span>
                  <div className="exportToggle" role="group" aria-label="Match window">
                    <button
                      type="button"
                      className={
                        exportMatchScope === 'finished'
                          ? 'exportToggleButton exportToggleButtonActive'
                          : 'exportToggleButton'
                      }
                      onClick={() => setExportMatchScope('finished')}
                      aria-pressed={exportMatchScope === 'finished'}
                    >
                      Finished matches
                    </button>
                    <button
                      type="button"
                      className={
                        exportMatchScope === 'latest-day'
                          ? 'exportToggleButton exportToggleButtonActive'
                          : 'exportToggleButton'
                      }
                      onClick={() => setExportMatchScope('latest-day')}
                      aria-pressed={exportMatchScope === 'latest-day'}
                    >
                      Latest matchday only
                    </button>
                  </div>
                </div>
                <div className="exportHint">
                  {exportMatchScope === 'latest-day'
                    ? 'Exports include the latest finished matchday in each section.'
                    : 'Exports include all finished matches.'}
                </div>
              </div>
              <div className="exportStats">
                <div className="exportStat">
                  <div className="exportStatLabel">Finished matches</div>
                  <div className="exportStatValue">{finishedMatchCount}</div>
                </div>
                <div className="exportStat">
                  <div className="exportStatLabel">Groups finished</div>
                  <div className="exportStatValue">{finishedGroupCount}</div>
                </div>
                <div className="exportStat">
                  <div className="exportStatLabel">Knockout finished</div>
                  <div className="exportStatValue">{finishedKnockoutCount}</div>
                </div>
                <div className="exportStat">
                  <div className="exportStatLabel">Players</div>
                  <div className="exportStatValue">{memberCount}</div>
                </div>
                <div className="exportStat exportStatWide">
                  <div className="exportStatLabel">Group status</div>
                  <div className="exportStatValue">{groupStatusLabel}</div>
                </div>
              </div>
            </div>

            <div className="exportsGrid exportsGridWide exportsGridFull">
              <div className="card exportTile">
                <div className="exportTileHeader">
                  <div>
                    <div className="exportTileTitle">Match picks</div>
                    <div className="exportTileMeta">All users</div>
                  </div>
                  <button
                    type="button"
                    className="button buttonSmall"
                    onClick={handleExportPicks}
                    disabled={!hasPickExport}
                  >
                    CSV
                  </button>
                </div>
                <div className="exportTileHint">
                  {exportMatchScope === 'latest-day' ? latestPickMatchLabel : 'All finished matches.'}
                </div>
              </div>

              <div className="card exportTile">
                <div className="exportTileHeader">
                  <div>
                    <div className="exportTileTitle">Group bracket</div>
                    <div className="exportTileMeta">All users</div>
                  </div>
                  <button
                    type="button"
                    className="button buttonSmall"
                    onClick={handleExportGroup}
                    disabled={!hasGroupExport}
                  >
                    CSV
                  </button>
                </div>
                <div className="exportTileHint">
                  {exportMatchScope === 'latest-day'
                    ? latestGroupMatchLabel
                    : 'Groups with finished matches.'}
                  {!groupComplete ? ' Best third picks unlock after groups.' : ''}
                </div>
              </div>

              <div className="card exportTile">
                <div className="exportTileHeader">
                  <div>
                    <div className="exportTileTitle">Knockout bracket</div>
                    <div className="exportTileMeta">All users</div>
                  </div>
                  <button
                    type="button"
                    className="button buttonSmall"
                    onClick={handleExportKnockout}
                    disabled={!hasKnockoutExport}
                  >
                    CSV
                  </button>
                </div>
                <div className="exportTileHint">
                  {exportMatchScope === 'latest-day'
                    ? latestKnockoutMatchLabel
                    : 'Finished knockout matches only.'}
                </div>
              </div>

              <div className="card exportTile">
                <div className="exportTileHeader">
                  <div>
                    <div className="exportTileTitle">Leaderboard</div>
                    <div className="exportTileMeta">All users</div>
                  </div>
                  <button
                    type="button"
                    className="button buttonSmall"
                    onClick={handleExportLeaderboard}
                    disabled={!hasLeaderboardExport}
                  >
                    CSV
                  </button>
                </div>
                <div className="exportTileHint">Ranked totals for all players.</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function ExportsPage() {
  return <ExportsPanel />
}
