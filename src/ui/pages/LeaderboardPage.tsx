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
import { getDateKeyLocal } from '../../lib/matches'
import { loadLocalBracketPrediction, mergeBracketPredictions } from '../../lib/bracket'
import { loadLocalPicks, mergePicks } from '../../lib/picks'
import { buildLeaderboard } from '../../lib/scoring'
import type { BracketPrediction } from '../../types/bracket'
import type { Member } from '../../types/members'
import type { Match } from '../../types/matches'
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
      bracketPredictions: BracketPrediction[]
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

function formatDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatLabel(value: string) {
  if (!value) return ''
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return formatDateKey(value)
  return value
}

type HistoryPoint = {
  key: string
  label: string
  totals: Map<string, number>
}

const knockoutStageOrder = ['R32', 'R16', 'QF', 'SF', 'Final'] as const

export default function LeaderboardPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [page, setPage] = useState(1)
  const pageSize = 6
  const [primaryId, setPrimaryId] = useState<string | null>(null)
  const [secondaryId, setSecondaryId] = useState<string | null>(null)

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
        const merged = mergePicks(picksFile.picks, localPicks, CURRENT_USER_ID)
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
          picks: merged,
          bracketPredictions: mergedBrackets,
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

  const leaderboard = useMemo(() => {
    if (state.status !== 'ready') return []
    return buildLeaderboard(
      state.members,
      state.matches,
      state.picks,
      state.bracketPredictions,
      state.scoring,
      state.bestThirdQualifiers
    )
  }, [state])

  const dateKeys = useMemo(() => {
    if (state.status !== 'ready') return []
    const groupMatches = state.matches.filter(
      (match) => match.stage === 'Group' && match.status === 'FINISHED'
    )
    const keys = new Set(groupMatches.map((match) => getDateKeyLocal(match.kickoffUtc)))
    return [...keys].sort()
  }, [state])

  function buildSnapshotMatches(
    matches: Match[],
    options: { cutoffDateKey?: string; allowedStages?: Set<string> }
  ): Match[] {
    return matches.map((match) => {
      if (options.allowedStages && !options.allowedStages.has(match.stage)) {
        return {
          ...match,
          status: 'SCHEDULED',
          score: undefined,
          winner: undefined,
          decidedBy: undefined
        }
      }
      if (options.cutoffDateKey && match.stage === 'Group') {
        const matchDate = getDateKeyLocal(match.kickoffUtc)
        if (matchDate > options.cutoffDateKey) {
          return {
            ...match,
            status: 'SCHEDULED',
            score: undefined,
            winner: undefined,
            decidedBy: undefined
          }
        }
      }
      return match
    })
  }

  const history = useMemo<HistoryPoint[]>(() => {
    if (state.status !== 'ready') return []
    const groupMatches = state.matches.filter((match) => match.stage === 'Group')
    const knockoutMatches = state.matches.filter((match) => match.stage !== 'Group')
    const knockoutStarted = knockoutMatches.some((match) => match.status === 'FINISHED')
    const historyPoints: HistoryPoint[] = []

    historyPoints.push({
      key: 'pre',
      label: '',
      totals: new Map(state.members.map((member) => [member.id, 0]))
    })

    if (!knockoutStarted) {
      for (const dateKey of dateKeys) {
        const cutoffMatches = buildSnapshotMatches(state.matches, {
          cutoffDateKey: dateKey,
          allowedStages: new Set(['Group'])
        })
        const snapshot = buildLeaderboard(
          state.members,
          cutoffMatches,
          state.picks,
          state.bracketPredictions,
          state.scoring,
          undefined
        )
        const totals = new Map(snapshot.map((entry) => [entry.member.id, entry.totalPoints]))
        historyPoints.push({ key: dateKey, label: dateKey, totals })
      }
      return historyPoints
    }

    const groupComplete = groupMatches.length > 0 && groupMatches.every((match) => match.status === 'FINISHED')
    const groupStages = new Set(['Group'])
    const groupSnapshotMatches = buildSnapshotMatches(state.matches, {
      allowedStages: groupStages
    })
    const groupSnapshot = buildLeaderboard(
      state.members,
      groupSnapshotMatches,
      state.picks,
      state.bracketPredictions,
      state.scoring,
      groupComplete ? state.bestThirdQualifiers : undefined
    )
    historyPoints.push({
      key: 'group',
      label: groupComplete ? 'Group complete' : 'Group',
      totals: new Map(groupSnapshot.map((entry) => [entry.member.id, entry.totalPoints]))
    })

    const allowedStages = new Set(['Group'])
    for (const stage of knockoutStageOrder) {
      const stageMatches = state.matches.filter((match) => match.stage === stage)
      if (stageMatches.length === 0) continue
      const stageComplete = stageMatches.every((match) => match.status === 'FINISHED')
      if (!stageComplete) break
      allowedStages.add(stage)
      const snapshotMatches = buildSnapshotMatches(state.matches, { allowedStages })
      const snapshot = buildLeaderboard(
        state.members,
        snapshotMatches,
        state.picks,
        state.bracketPredictions,
        state.scoring,
        groupComplete ? state.bestThirdQualifiers : undefined
      )
      historyPoints.push({
        key: stage,
        label: stage,
        totals: new Map(snapshot.map((entry) => [entry.member.id, entry.totalPoints]))
      })
    }

    return historyPoints
  }, [dateKeys, state])

  useEffect(() => {
    if (leaderboard.length === 0) return
    const leaderId = leaderboard[0].member.id
    const fallbackSecondary =
      leaderId === CURRENT_USER_ID ? leaderboard[1]?.member.id ?? leaderId : CURRENT_USER_ID
    setPrimaryId((current) => current ?? leaderId)
    setSecondaryId((current) => current ?? fallbackSecondary)
  }, [leaderboard])

  useEffect(() => {
    if (leaderboard.length === 0) return
    const pageCount = Math.max(1, Math.ceil(leaderboard.length / pageSize))
    setPage((current) => Math.min(current, pageCount))
  }, [leaderboard, pageSize])

  const pageCount = Math.max(1, Math.ceil(leaderboard.length / pageSize))
  const pageStart = (page - 1) * pageSize
  const pageEntries = leaderboard.slice(pageStart, pageStart + pageSize)

  const chartSeries = useMemo(() => {
    const primary = primaryId
    const secondary = secondaryId
    if (!primary || !secondary || history.length === 0) return null
    const primaryValues = history.map((entry) => entry.totals.get(primary) ?? 0)
    const secondaryValues = history.map((entry) => entry.totals.get(secondary) ?? 0)
    const maxValue = Math.max(...primaryValues, ...secondaryValues, 1)
    const labelEvery = Math.max(1, Math.ceil(history.length / 8))
    return { primaryValues, secondaryValues, maxValue, labelEvery }
  }, [history, primaryId, secondaryId])

  return (
    <div className="stack">
      <div className="row rowSpaceBetween">
        <div>
          <div className="sectionKicker">Standings</div>
          <h1 className="h1">Leaderboard</h1>
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
        <div className="card">
          <div className="sectionTitle">Gameday history</div>
          <div className="historyControls">
            <label className="historyLabel">
              Compare
              <select
                className="historySelect"
                value={primaryId ?? ''}
                onChange={(event) => setPrimaryId(event.target.value)}
              >
                {state.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="historyVs">vs</span>
            <label className="historyLabel">
              Player
              <select
                className="historySelect"
                value={secondaryId ?? ''}
                onChange={(event) => setSecondaryId(event.target.value)}
              >
                {state.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {chartSeries ? (
            <div className="historyChart">
              <svg viewBox="0 0 640 180" role="img" aria-label="Gameday history chart">
                <defs>
                  <linearGradient id="historyPrimary" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="historySecondary" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--glow)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="var(--glow)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {chartSeries.primaryValues.map((value, index) => {
                  if (index === 0) return null
                  if (index % chartSeries.labelEvery !== 0) return null
                  const prev = chartSeries.primaryValues[index - 1]
                  const step = 560 / Math.max(1, chartSeries.primaryValues.length - 1)
                  const x1 = 40 + step * (index - 1)
                  const x2 = 40 + step * index
                  const y1 = 150 - (prev / chartSeries.maxValue) * 110
                  const y2 = 150 - (value / chartSeries.maxValue) * 110
                  return (
                    <line
                      key={`grid-${index}`}
                      x1={x1}
                      x2={x1}
                      y1={20}
                      y2={150}
                      stroke="var(--border-soft)"
                      strokeDasharray="2 6"
                    />
                  )
                })}
                <polyline
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="3"
                  points={chartSeries.primaryValues
                    .map((value, index) => {
                      const step = 560 / Math.max(1, chartSeries.primaryValues.length - 1)
                      const x = 40 + step * index
                      const y = 150 - (value / chartSeries.maxValue) * 110
                      return `${x},${y}`
                    })
                    .join(' ')}
                />
                <polyline
                  fill="none"
                  stroke="var(--glow)"
                  strokeWidth="2"
                  points={chartSeries.secondaryValues
                    .map((value, index) => {
                      const step = 560 / Math.max(1, chartSeries.secondaryValues.length - 1)
                      const x = 40 + step * index
                      const y = 150 - (value / chartSeries.maxValue) * 110
                      return `${x},${y}`
                    })
                    .join(' ')}
                />
                {chartSeries.primaryValues.map((value, index) => {
                  const isAnchor =
                    index % chartSeries.labelEvery === 0 || index === chartSeries.primaryValues.length - 1
                  if (!isAnchor) return null
                  const step = 560 / Math.max(1, chartSeries.primaryValues.length - 1)
                  const x = 40 + step * index
                  const y = 150 - (value / chartSeries.maxValue) * 110
                  return <circle key={`p-${index}`} cx={x} cy={y} r="3.5" fill="var(--accent)" />
                })}
                {chartSeries.secondaryValues.map((value, index) => {
                  const isAnchor =
                    index % chartSeries.labelEvery === 0 || index === chartSeries.secondaryValues.length - 1
                  if (!isAnchor) return null
                  const step = 560 / Math.max(1, chartSeries.secondaryValues.length - 1)
                  const x = 40 + step * index
                  const y = 150 - (value / chartSeries.maxValue) * 110
                  return <circle key={`s-${index}`} cx={x} cy={y} r="3" fill="var(--glow)" />
                })}
                {chartSeries.primaryValues.map((value, index) => {
                  const isAnchor =
                    index % chartSeries.labelEvery === 0 || index === chartSeries.primaryValues.length - 1
                  if (!isAnchor) return null
                  const step = 560 / Math.max(1, chartSeries.primaryValues.length - 1)
                  const x = 40 + step * index
                  const y = 150 - (value / chartSeries.maxValue) * 110
                  return (
                    <text
                      key={`p-label-${index}`}
                      x={x}
                      y={y - 10}
                      textAnchor="middle"
                      fill="var(--accent)"
                      fontSize="10"
                    >
                      {value}
                    </text>
                  )
                })}
                {chartSeries.secondaryValues.map((value, index) => {
                  const isAnchor =
                    index % chartSeries.labelEvery === 0 || index === chartSeries.secondaryValues.length - 1
                  if (!isAnchor) return null
                  const step = 560 / Math.max(1, chartSeries.secondaryValues.length - 1)
                  const x = 40 + step * index
                  const y = 150 - (value / chartSeries.maxValue) * 110
                  return (
                    <text
                      key={`s-label-${index}`}
                      x={x}
                      y={y + 14}
                      textAnchor="middle"
                      fill="var(--text)"
                      opacity="0.85"
                      fontSize="10"
                    >
                      {value}
                    </text>
                  )
                })}
                {history.map((entry, index) => {
                  const isAnchor =
                    index % chartSeries.labelEvery === 0 || index === history.length - 1
                  if (!isAnchor) return null
                  const label = formatLabel(entry.label)
                  if (!label) return null
                  const step = 560 / Math.max(1, history.length - 1)
                  const x = 40 + step * index
                  return (
                    <text
                      key={`label-${entry.key}`}
                      x={x}
                      y={170}
                      textAnchor="middle"
                      fill="var(--muted)"
                      fontSize="10"
                    >
                      {label}
                    </text>
                  )
                })}
              </svg>
            </div>
          ) : (
            <div className="muted">No finished matches yet.</div>
          )}
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <div className="card">
          {leaderboard.length === 0 ? (
            <div className="muted">No finished matches to score yet.</div>
          ) : (
            <div className="leaderboardTable">
              <div className="leaderboardRow leaderboardHeader">
                <div>#</div>
                <div>Player</div>
                <div>Exact</div>
                <div>Outcome</div>
                <div>Knockout</div>
                <div>Bracket</div>
                <div>Total</div>
              </div>
              {pageEntries.map((entry, index) => (
                <div
                  key={entry.member.id}
                  className={
                    entry.member.id === CURRENT_USER_ID
                      ? 'leaderboardRow leaderboardHighlight'
                      : 'leaderboardRow'
                  }
                >
                  <div className="leaderboardRank">{pageStart + index + 1}</div>
                  <div className="leaderboardName">
                    {entry.member.name}
                    {entry.member.handle ? (
                      <span className="leaderboardHandle">@{entry.member.handle}</span>
                    ) : null}
                  </div>
                  <div className="leaderboardPoints">{entry.exactPoints}</div>
                  <div>{entry.resultPoints}</div>
                  <div>{entry.knockoutPoints}</div>
                  <div>{entry.bracketPoints}</div>
                  <div className="leaderboardTotal">{entry.totalPoints}</div>
                </div>
              ))}
            </div>
          )}
          {leaderboard.length > pageSize ? (
            <div className="leaderboardPagination">
              <button
                type="button"
                className="paginationButton"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
              >
                Prev
              </button>
              <div className="paginationInfo">
                Page {page} of {pageCount}
              </div>
              <button
                type="button"
                className="paginationButton"
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={page === pageCount}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
