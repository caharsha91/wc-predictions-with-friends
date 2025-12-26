import { useEffect, useMemo, useState } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import {
  fetchBestThirdQualifiers,
  fetchBracketPredictions,
  fetchMatches,
  fetchMembers,
  fetchPicks,
  fetchScoring
} from '../../lib/data'
import {
  buildGroupStandingsSnapshot,
  type CsvValue,
  downloadCsv,
  formatExportFilename,
  getLatestMatch,
  resolveBestThirdQualifiers
} from '../../lib/exports'
import { loadLocalBracketPrediction, mergeBracketPredictions } from '../../lib/bracket'
import { getOutcomeFromScores, loadLocalPicks, mergePicks } from '../../lib/picks'
import { buildLeaderboard } from '../../lib/scoring'
import type { BracketPrediction } from '../../types/bracket'
import type { Member } from '../../types/members'
import type { Match, MatchWinner } from '../../types/matches'
import type { Pick } from '../../types/picks'
import type { ScoringConfig } from '../../types/scoring'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      matches: Match[]
      members: Member[]
      picks: Pick[]
      predictions: BracketPrediction[]
      scoring: ScoringConfig
      bestThirdQualifiers: string[]
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

export default function ExportsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [exportMatchScope, setExportMatchScope] = useState<'finished' | 'latest'>('finished')

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [
          matchesFile,
          membersFile,
          picksFile,
          scoringFile,
          bracketFile,
          bestThirdFile
        ] = await Promise.all([
          fetchMatches(),
          fetchMembers(),
          fetchPicks(),
          fetchScoring(),
          fetchBracketPredictions(),
          fetchBestThirdQualifiers()
        ])
        if (canceled) return

        const localPicks = loadLocalPicks(CURRENT_USER_ID)
        const mergedPicks = mergePicks(picksFile.picks, localPicks, CURRENT_USER_ID)
        const localBracket = loadLocalBracketPrediction(CURRENT_USER_ID)
        const mergedBrackets = mergeBracketPredictions(
          bracketFile.predictions,
          localBracket,
          CURRENT_USER_ID
        )

        setState({
          status: 'ready',
          matches: matchesFile.matches,
          members: membersFile.members,
          picks: mergedPicks,
          predictions: mergedBrackets,
          scoring: scoringFile,
          bestThirdQualifiers: bestThirdFile.qualifiers,
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
  }, [])

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

  const latestFinishedMatch = useMemo(
    () => getLatestMatch(finishedMatches),
    [finishedMatches]
  )

  const latestGroupMatch = useMemo(
    () => getLatestMatch(finishedGroupMatches),
    [finishedGroupMatches]
  )

  const latestKnockoutMatch = useMemo(
    () => getLatestMatch(finishedKnockoutMatches),
    [finishedKnockoutMatches]
  )

  const pickMatchIds = useMemo(() => {
    if (exportMatchScope === 'latest') {
      return latestFinishedMatch ? new Set([latestFinishedMatch.id]) : new Set()
    }
    return new Set(finishedMatches.map((match) => match.id))
  }, [exportMatchScope, finishedMatches, latestFinishedMatch])

  const groupIdsForExport = useMemo(() => {
    if (exportMatchScope === 'latest') {
      return latestGroupMatch?.group ? new Set([latestGroupMatch.group]) : new Set()
    }
    return new Set(
      finishedGroupMatches.map((match) => match.group).filter((group): group is string => !!group)
    )
  }, [exportMatchScope, finishedGroupMatches, latestGroupMatch])

  const knockoutMatchIds = useMemo(() => {
    if (exportMatchScope === 'latest') {
      return latestKnockoutMatch ? new Set([latestKnockoutMatch.id]) : new Set()
    }
    return new Set(finishedKnockoutMatches.map((match) => match.id))
  }, [exportMatchScope, finishedKnockoutMatches, latestKnockoutMatch])

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
    return buildLeaderboard(
      state.members,
      state.matches,
      state.picks,
      state.predictions,
      state.scoring,
      state.bestThirdQualifiers
    )
  }, [state])

  const hasPickExport =
    state.status === 'ready' && state.members.length > 0 && pickMatchIds.size > 0
  const hasGroupExport =
    state.status === 'ready' && state.members.length > 0 && groupIdsForExport.size > 0
  const hasKnockoutExport =
    state.status === 'ready' && state.members.length > 0 && knockoutMatchIds.size > 0
  const hasLeaderboardExport = leaderboard.length > 0

  const latestPickMatchLabel = latestFinishedMatch
    ? `${latestFinishedMatch.homeTeam.code} vs ${latestFinishedMatch.awayTeam.code}`
    : 'No finished matches yet'
  const latestGroupMatchLabel = latestGroupMatch
    ? `${latestGroupMatch.homeTeam.code} vs ${latestGroupMatch.awayTeam.code}`
    : 'No finished group match yet'
  const latestKnockoutMatchLabel = latestKnockoutMatch
    ? `${latestKnockoutMatch.homeTeam.code} vs ${latestKnockoutMatch.awayTeam.code}`
    : 'No finished knockout match yet'
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
    <div className="stack">
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
                match in each section.
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
                        exportMatchScope === 'latest'
                          ? 'exportToggleButton exportToggleButtonActive'
                          : 'exportToggleButton'
                      }
                      onClick={() => setExportMatchScope('latest')}
                      aria-pressed={exportMatchScope === 'latest'}
                    >
                      Latest match only
                    </button>
                  </div>
                </div>
                <div className="exportHint">
                  {exportMatchScope === 'latest'
                    ? 'Exports include the latest finished match in each section.'
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
                  {exportMatchScope === 'latest'
                    ? latestPickMatchLabel
                    : 'All finished matches.'}
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
                  {exportMatchScope === 'latest'
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
                  {exportMatchScope === 'latest'
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
